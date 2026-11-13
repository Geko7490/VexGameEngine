import {Vector2,Vector3,Euler,Quaternion} from 'three';
import {clone,validate} from './project.js';
import {Stage} from './stage.js';
import {Physics,readyPhysics,fixedStep} from './physics.js';
import {BlockMachine} from './blocks.js';
import {el,button} from './dom.js';

const rotation=new Euler();
const radians=Math.PI/180;

function inputFor(host,ui,onEvent){
  const keys=new Set(), stick=new Vector2(), listeners=new AbortController();
  const on=(node,name,fn)=>node.addEventListener(name,fn,{signal:listeners.signal});
  const pad=el('div',{className:'game-pad',role:'group','aria-label':'Hareket'},el('i'));
  const triggers=el('div',{className:'game-actions'});
  const jump=()=>onEvent('jump');
  const interact=()=>onEvent('interact');
  if(ui.jump) triggers.append(button(ui.jump,jump));
  if(ui.interact) triggers.append(button(ui.interact,interact));
  on(window,'keydown',e=>{
    if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyE'].includes(e.code)) return;
    e.preventDefault(); keys.add(e.code);
    if(!e.repeat&&e.code==='Space') jump();
    if(!e.repeat&&e.code==='KeyE') interact();
  });
  on(window,'keyup',e=>keys.delete(e.code));
  on(window,'blur',()=>{keys.clear();reset();});
  let pointer=null;
  function reset(){pointer=null;stick.set(0,0);pad.firstChild.style.transform='';}
  function update(e){
    const r=pad.getBoundingClientRect();
    stick.set((e.clientX-r.x-r.width/2)/(r.width*.37),(e.clientY-r.y-r.height/2)/(r.height*.37)).clampLength(0,1);
    pad.firstChild.style.transform='translate('+stick.x*r.width*.31+'px,'+stick.y*r.height*.31+'px)';
  }
  on(pad,'pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;pad.setPointerCapture(pointer);update(e);});
  on(pad,'pointermove',e=>{if(e.pointerId===pointer)update(e);});
  for(const name of ['pointerup','pointercancel','lostpointercapture']) on(pad,name,e=>{if(pointer===e.pointerId)reset();});
  if(ui.joystick) host.append(pad);
  if(triggers.childElementCount) host.append(triggers);
  return {direction(target){
    const held=(a,b)=>Number(keys.has(a)||keys.has(b));
    return target.set(stick.x+held('KeyD','ArrowRight')-held('KeyA','ArrowLeft'),
      stick.y+held('KeyS','ArrowDown')-held('KeyW','ArrowUp')).clampLength(0,1);
  },stop(){listeners.abort();pad.remove();triggers.remove();}};
}

export async function startGame(host,source,{preview=false,storage}={}){
  const project=validate(clone(source));
  await readyPhysics();
  let level,stage,physics,machine,input,canvasEvents;
  let levelId=project.start,frame,lastTime,accumulator=0,score=0,health=100,ended=false,pending=null;
  let variables=new Map(),jumpQueued=false,yaw=0,pitch=.22,verticalSpeed=0,carAngle=0;
  const pressed=new Set(), audio=new Set(), direction=new Vector2(), cameraTarget=new Vector3();
  const status=el('div',{className:'game-status'}), message=el('div',{className:'game-message'});
  const key='vex.game.'+project.id;
  const gameStorage=()=>storage??globalThis.localStorage;
  function showStatus(){status.textContent='Skor '+score+'  ·  Can '+health;}
  function stopScene(){
    pressed.clear();
    for(const clip of audio){clip.pause();clip.removeAttribute('src');clip.load();}
    audio.clear();
    input?.stop();canvasEvents?.abort();physics?.dispose();stage?.dispose();
    status.remove();message.remove();input=null;canvasEvents=null;physics=null;stage=null;
  }
  function save(){
    if(preview) return;
    try{gameStorage().setItem(key,JSON.stringify({score,health,variables:Array.from(variables)}));}
    catch{message.textContent='Oyun kaydı yazılamadı.';}
  }
  function load(){
    if(preview) return;
    try{
      const saved=JSON.parse(gameStorage().getItem(key)??'null');
      if(!saved||!Number.isFinite(saved.score)||!Number.isFinite(saved.health)||!Array.isArray(saved.variables))return;
      score=saved.score;health=saved.health;variables=new Map(saved.variables);showStatus();
    }catch{message.textContent='Oyun kaydı okunamadı.';}
  }
  function finish(text){
    ended=true;
    message.replaceChildren(el('strong',{},text||'Oyun bitti'),
      button('Yeniden oyna',()=>pending={id:levelId,reset:true}));
  }
  function apply(op,a,target){
    const entity=stage.entries.get(target), physical=physics.entries.get(target);
    const root=entity?.root;
    switch(op){
      case 'move':
      case 'position':
        if(root){
          const p=new Vector3(...a.xyz);
          if(op==='move')p.add(root.position);
          if(physical)physics.translate(physical,p);
          else root.position.copy(p);
        }
        break;
      case 'rotate':
        if(root){
          rotation.set(root.rotation.x+a.xyz[0]*radians,root.rotation.y+a.xyz[1]*radians,root.rotation.z+a.xyz[2]*radians);
          if(physical)physics.rotate(physical,new Quaternion().setFromEuler(rotation));
          else root.rotation.copy(rotation);
        }
        break;
      case 'velocity': if(physical?.body.isDynamic())physical.body.setLinvel(new Vector3(...a.xyz),true);break;
      case 'impulse': if(physical?.body.isDynamic())physical.body.applyImpulse(new Vector3(...a.xyz),true);break;
      case 'hide':case 'show':if(root)root.visible=op==='show';break;
      case 'tint':root?.traverse(n=>{for(const material of n.material?[n.material].flat():[])material.color?.set(a.color);});break;
      case 'destroy':physics.remove(target);stage.remove(target);break;
      case 'animate':stage.play(target,a.text);break;
      case 'sound':{
        const asset=project.assets.find(x=>x.id===a.asset);
        if(!asset||audio.size>=8)break;
        const clip=new Audio(asset.data);
        audio.add(clip);clip.addEventListener('ended',()=>audio.delete(clip),{once:true});
        clip.play().catch(()=>audio.delete(clip));
        break;
      }
      case 'gravity':physics.world.gravity=new Vector3(...a.xyz);break;
      case 'text':message.textContent=a.text;break;
      case 'score':score+=a.amount;showStatus();break;
      case 'health':health=Math.min(100,Math.max(0,health+a.amount));showStatus();if(!health){finish('Canın bitti');return false;}break;
      case 'set':case 'add':variables.set(a.name,(op==='add'?(variables.get(a.name)??0):0)+a.amount);break;
      case 'save':save();break;
      case 'load':load();break;
      case 'scene':pending={id:a.scene};return false;
      case 'restart':pending={id:levelId,reset:true};return false;
      case 'finish':finish(a.text);return false;
    }
  }
  function activate(next){
    stopScene();
    levelId=next.id;
    if(next.reset){score=0;health=100;variables=new Map();}
    level=project.scenes.find(s=>s.id===levelId);
    ended=false;pending=null;jumpQueued=false;yaw=0;pitch=.22;carAngle=0;verticalSpeed=0;
    stage=new Stage(host,project,level,{assetError:name=>{message.textContent=name+' yüklenemedi.';}});
    physics=new Physics(level);
    machine=new BlockMachine(level.scripts,{apply,variable:name=>variables.get(name)??0});
    machine.emit('start',level.player);
    input=inputFor(host,level.ui,event=>{
      if(ended)return;
      if(event==='jump')jumpQueued=true;
      pressed.add(event);
    });
    const canvas=stage.renderer.domElement;
    canvasEvents=new AbortController();
    let drag=null;
    function on(name,fn){canvas.addEventListener(name,fn,{signal:canvasEvents.signal});}
    on('pointerdown',e=>{if(drag)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0};});
    on('pointermove',e=>{
      if(drag?.id!==e.pointerId)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      drag={id:drag.id,x:e.clientX,y:e.clientY,travel:drag.travel+Math.abs(dx)+Math.abs(dy)};
      yaw-=dx*.008;pitch=Math.max(-.65,Math.min(1.2,pitch+dy*.006));
    });
    on('pointerup',e=>{if(drag?.id!==e.pointerId)return;if(drag.travel<8&&!ended)pressed.add('tap');drag=null;});
    on('lostpointercapture',()=>{drag=null;});
    message.textContent='';
    host.append(status,message);
    showStatus();
    camera(1);
  }
  function drive(){
    const player=physics.entries.get(level.player);
    input.direction(direction);
    const x=direction.x*Math.cos(yaw)+direction.y*Math.sin(yaw);
    const z=-direction.x*Math.sin(yaw)+direction.y*Math.cos(yaw);
    if(level.controller==='free'){
      cameraTarget.add(new Vector3(x,0,z).multiplyScalar(fixedStep*7));
      jumpQueued=false;return;
    }
    if(!player)return;
    const body=player.body, p=body.translation(), grounded=physics.grounded(player);
    const jump=jumpQueued&&grounded;
    jumpQueued=false;
    if(p.y < -14){finish('Sahneden düştün');return;}
    if(player.character){
      verticalSpeed=jump?7.5:grounded?-.3:verticalSpeed+level.gravity[1]*fixedStep;
      player.character.computeColliderMovement(player.collider,{x:x*fixedStep*5,y:verticalSpeed*fixedStep,z:z*fixedStep*5},
        undefined,undefined,collider=>!collider.isSensor());
      const d=player.character.computedMovement();
      physics.translate(player,{x:p.x+d.x,y:p.y+d.y,z:p.z+d.z});
      return;
    }
    const v=body.linvel();
    if(level.controller==='ball'){
      body.applyTorqueImpulse({x:z*.045,y:0,z:-x*.045},true);
      if(jump)body.setLinvel({x:v.x,y:7.5,z:v.z},true);
    }else if(level.controller==='vehicle'){
      const forward=-direction.y, speed=Math.hypot(v.x,v.z);
      if(speed>.16||Math.abs(forward)>.05)carAngle+=direction.x*fixedStep*1.9*(forward<0?-1:1);
      const ease=Math.abs(forward)>.05?.16:.055;
      const vx=Math.sin(carAngle)*forward*12,vz=-Math.cos(carAngle)*forward*12;
      body.setLinvel({x:v.x+(vx-v.x)*ease,y:v.y,z:v.z+(vz-v.z)*ease},true);
      body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-carAngle),true);
    }else{
      body.setLinvel({x:x*5.8,y:jump?7.5:v.y,z:z*5.8},true);
    }
  }
  function camera(smooth){
    const player=stage.entries.get(level.player)?.root;
    const c=stage.camera;
    if(player&&level.controller!=='free')cameraTarget.copy(player.position);
    const p=cameraTarget;
    const look=new Vector3(p.x,p.y+.35,p.z), pos=new Vector3();
    if(level.controller==='first'&&player){
      pos.copy(p).add(new Vector3(0,.47,0));
      look.copy(pos).add(new Vector3(-Math.sin(yaw),-Math.sin(pitch),-Math.cos(yaw)));
      player.visible=false;
    }else if(level.controller==='top')pos.set(p.x,p.y+13,p.z+4);
    else if(level.controller==='free'){
      pos.copy(p).add(new Vector3(0,3,0));look.copy(pos).add(new Vector3(-Math.sin(yaw),-Math.sin(pitch),-Math.cos(yaw)));
    }else{
      const a=level.controller==='vehicle'?yaw-carAngle:yaw;
      pos.set(p.x+Math.sin(a)*6,p.y+2.7+Math.sin(pitch)*3,p.z+Math.cos(a)*6);
    }
    c.position.lerp(pos,smooth);
    c.lookAt(look);
  }
  function tick(now){
    frame=requestAnimationFrame(tick);
    try{advance(now);}
    catch(error){
      cancelAnimationFrame(frame);
      stopScene();
      host.replaceChildren(el('p',{},'Oyun durdu. '+error.message));
    }
  }
  function advance(now){
    const dt=Math.min(.1,(now-(lastTime??now))/1000);
    lastTime=now;
    if(pending){activate(pending);accumulator=0;}
    accumulator+=dt;
    while(accumulator>=fixedStep&&!ended&&!pending){
      accumulator-=fixedStep;
      for(const event of pressed)machine.emit(event,level.player);
      pressed.clear();
      machine.emit('step',level.player);
      machine.tick(fixedStep);
      if(pending||ended)break;
      drive();
      physics.step((a,b)=>{
        if(a.body==='sensor'||b.body==='sensor'){
          if(a.body==='sensor')machine.emit('trigger',a.id,b.id);
          if(b.body==='sensor')machine.emit('trigger',b.id,a.id);
        }else{machine.emit('collision',a.id,b.id);machine.emit('collision',b.id,a.id);}
      });
      for(const [id,e] of physics.entries){
        const root=stage.entries.get(id)?.root;
        if(root){root.position.copy(e.body.translation());root.quaternion.copy(e.body.rotation());}
      }
    }
    if(ended||pending)accumulator=0;
    camera(1-Math.exp(-dt*13));
    stage.render(ended?0:dt);
  }
  try{activate({id:levelId});frame=requestAnimationFrame(tick);}
  catch(e){stopScene();throw e;}
  return ()=>{cancelAnimationFrame(frame);stopScene();};
}
