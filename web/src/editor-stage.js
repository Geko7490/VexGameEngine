import {BoxGeometry,Mesh,MeshBasicMaterial,Matrix3,Plane,Raycaster,Vector2,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {snapBlock} from './block-snap.js';
import {Stage} from './stage.js';

export function editorStage(host,project,scene,onSelect,onTransform,onBuild,onGroupMove){
  const stage=new Stage(host,project,scene,{editor:true,assetError:name=>onTransform(null,name)});
  const {camera,world,renderer,entries}=stage, canvas=renderer.domElement;
  const orbit=new OrbitControls(camera,canvas);
  orbit.target.set(0,0,-2);
  orbit.enableDamping=true;
  orbit.dampingFactor=.19;
  const gizmo=new TransformControls(camera,canvas);
  gizmo.setSize(.9);
  world.add(gizmo.getHelper());
  let manipulated=false, pointer=null, handle=null;
  gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;if(e.value)manipulated=true;});
  const ghost=new Mesh(new BoxGeometry(),new MeshBasicMaterial({color:0x7bffcd,transparent:true,opacity:.36,depthWrite:false}));
  ghost.visible=false; world.add(ghost);
  const floor=new Plane(new Vector3(0,1,0),0);
  let held=null,marked=[];
  let mode='select', grid=false, magnet=true, direct=null;
  function commit(root){
    if(!root)return;
    const r=x=>Math.round(x*10000)/10000;
    onTransform(root.userData.object,{
      position:root.position.toArray().map(x=>r(Math.max(-10000,Math.min(10000,x)))),
      rotation:root.rotation.toArray().slice(0,3).map(x=>r(x*180/Math.PI)),
      scale:root.scale.toArray().map(x=>r(Math.max(.025,Math.min(500,x)))),
    });
  }
  gizmo.addEventListener('mouseUp',()=>{
    if(mode==='translate'&&gizmo.object)applyMagnet(gizmo.object);
    commit(gizmo.object);
  });
  const ray=new Raycaster(), coords=new Vector2(), lifecycle=new AbortController();
  const on=(name,fn)=>canvas.addEventListener(name,fn,{signal:lifecycle.signal});
  on('pointerdown',e=>{
    if(pointer){pointer=null;manipulated=true;return;}
    if(!e.isPrimary)return;
    pointer={x:e.clientX,y:e.clientY,id:e.pointerId};
    manipulated=!!gizmo.dragging;
  });
  on('pointercancel',()=>{pointer=null;ghost.visible=false;});
  on('pointerleave',()=>{ghost.visible=false;});
  on('pointermove',e=>{
    if(['build','finish'].includes(mode)&&(!pointer||Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<=8))preview(e);
    else ghost.visible=false;
  });
  on('pointerup',e=>{
    const start=pointer;pointer=null;
    if(!start||start.id!==e.pointerId||manipulated||Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)return;
    if(['build','finish'].includes(mode)){
      const position=preview(e);
      if(position)onBuild(position.toArray(),mode);
      return;
    }
    onSelect(pick(e)?.userData.object??null,mode==='multi');
  });
  function rayAt(e){
    const rect=canvas.getBoundingClientRect();
    coords.set(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);
    ray.setFromCamera(coords,camera);
  }
  function pick(e){
    rayAt(e);
    const roots=Array.from(entries.values()).filter(entry=>!entry.o.parent).map(entry=>entry.root);
    let root=ray.intersectObjects(roots,true)[0]?.object;
    while(root&&!root.userData.object)root=root.parent;
    return root;
  }
  function preview(e){
    rayAt(e);
    const roots=Array.from(entries.values()).filter(entry=>!entry.o.parent).map(entry=>entry.root);
    const hit=ray.intersectObjects(roots,true).find(h=>h.object.isMesh&&h.face);
    const point=hit?.point.clone()??ray.ray.intersectPlane(floor,new Vector3());
    if(!point){ghost.visible=false;return null;}
    const normal=hit?hit.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize():new Vector3(0,1,0);
    for(const axis of ['x','y','z']){
      if(Math.abs(normal[axis])<1e-5)point[axis]=Math.round(point[axis]*4)/4;
    }
    point.addScaledVector(normal,.5*(Math.abs(normal.x)+Math.abs(normal.y)+Math.abs(normal.z)));
    ghost.position.copy(point);ghost.visible=true;
    return point;
  }
  function applyMagnet(root){
    if(!magnet||entries.get(root.userData.object)?.o.kind!=='box')return;
    const related=(a,b)=>{for(let item=a;item;item=item.parent)if(item===b)return true;return false;};
    const neighbors=Array.from(entries.values()).filter(e=>e.o.kind==='box'&&e.root.visible&&
      !related(root,e.root)&&!related(e.root,root)).map(e=>e.root);
    snapBlock(root,neighbors);
  }
  function capture(name,fn){canvas.addEventListener(name,fn,{capture:true,signal:lifecycle.signal});}
  capture('pointerdown',e=>{
    if(direct){e.stopImmediatePropagation();return;}
    if(!e.isPrimary||e.button!==0)return;
    if(['build','finish'].includes(mode))preview(e);
    if(mode!=='drag'){
      if(mode!=='select'||e.pointerType!=='touch')return;
      const root=pick(e);
      if(root)held={id:e.pointerId,x:e.clientX,y:e.clientY,timer:setTimeout(()=>{
        held=null;pointer=null;manipulated=true;
        onSelect(root.userData.object,true);
      },490)};
      return;
    }
    const root=pick(e);
    if(!root)return;
    const origin=root.getWorldPosition(new Vector3());
    const normal=new Vector3(0,1,0);
    // When the camera is nearly level, use a camera-facing plane for fine placement.
    if(Math.abs(ray.ray.direction.dot(normal))<.12)camera.getWorldDirection(normal);
    const plane=new Plane().setFromNormalAndCoplanarPoint(normal,origin);
    const hit=ray.ray.intersectPlane(plane,new Vector3());
    if(!hit)return;
    e.stopImmediatePropagation();
    orbit.enabled=false;
    canvas.setPointerCapture(e.pointerId);
    direct={root,origin,plane,hit,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    const group=marked.includes(root.userData.object)?marked:[root.userData.object];
    direct.members=group.map(id=>entries.get(id)?.root).filter(Boolean).filter(member=>{
      for(let ancestor=member.parent;ancestor;ancestor=ancestor.parent)if(group.includes(ancestor.userData.object))return false;
      return true;
    }).map(member=>({root:member,local:member.position.clone(),world:member.getWorldPosition(new Vector3())}));
    if(group.length===1)onSelect(root.userData.object);
  });
  capture('pointermove',e=>{
    if(held?.id===e.pointerId&&Math.hypot(e.clientX-held.x,e.clientY-held.y)>8){clearTimeout(held.timer);held=null;}
    if(!direct||direct.id!==e.pointerId)return;
    e.stopImmediatePropagation();
    if(!direct.moved&&Math.hypot(e.clientX-direct.x,e.clientY-direct.y)<5)return;
    rayAt(e);
    const hit=ray.ray.intersectPlane(direct.plane,new Vector3());
    if(!hit)return;
    direct.moved=true;
    const position=hit.sub(direct.hit).add(direct.origin);
    if(grid){
      position.x=Math.round(position.x*4)/4;
      position.z=Math.round(position.z*4)/4;
      if(direct.plane.normal.y!==1)position.y=Math.round(position.y*4)/4;
    }
    const root=direct.root;
    const delta=position.sub(direct.origin);
    for(const member of direct.members)member.root.position.copy(member.root.parent.worldToLocal(member.world.clone().add(delta)));
    if(direct.members.length===1)applyMagnet(root);
  });
  function endDrag(e,cancel){
    if(held?.id===e.pointerId){clearTimeout(held.timer);held=null;}
    if(!direct||direct.id!==e.pointerId)return;
    e.stopImmediatePropagation();
    const {members,moved}=direct;
    direct=null;
    orbit.enabled=true;
    if(cancel)for(const m of members)m.root.position.copy(m.local);
    else if(moved)onGroupMove(members.map(m=>[m.root.userData.object,m.root.position.toArray()]));
  }
  capture('pointerup',e=>endDrag(e,false));
  capture('pointercancel',e=>endDrag(e,true));
  capture('lostpointercapture',e=>endDrag(e,true));
  let fps=0, frames=0, sampled=performance.now();
  function loop(now){
    handle=requestAnimationFrame(loop);
    if(now!==undefined){
      frames++;
      if(now-sampled>=750){fps=Math.round(frames*1000/(now-sampled));sampled=now;frames=0;}
    }
    orbit.update();
    stage.render();
  }
  loop();
  return {
    configure(id,tool,space,snap,faces,selection){
      if(mode!==tool)ghost.visible=false;
      marked=selection;
      mode=tool;grid=snap;magnet=faces;
      const root=entries.get(id)?.root;
      if(root&&['translate','rotate','scale'].includes(tool))gizmo.attach(root);else gizmo.detach();
      if(['translate','rotate','scale'].includes(tool))gizmo.setMode(tool);
      gizmo.setSpace(space);
      gizmo.setTranslationSnap(snap ? .25 : null);
      gizmo.setRotationSnap(snap?Math.PI/12:null);
      gizmo.setScaleSnap(snap ? .25 : null);
    },
    view(name,id){
      const point=entries.get(id)?.root.getWorldPosition(new Vector3())??new Vector3();
      const positions={top:[0,10,.01],front:[0,1,10],back:[0,1,-10],side:[10,1,0],orbit:[7,5,8],focus:[4,3,5]};
      orbit.target.copy(point);
      camera.position.copy(point).add(new Vector3(...positions[name]));
      orbit.update();
    },
    camera(){return {position:camera.position.clone(),target:orbit.target.clone()};},
    restore(saved){camera.position.copy(saved.position);orbit.target.copy(saved.target);orbit.update();},
    metrics(){const info=renderer.info.render;return {calls:info.calls,triangles:info.triangles,objects:entries.size,fps};},
    dispose(){clearTimeout(held?.timer);cancelAnimationFrame(handle);lifecycle.abort();orbit.dispose();gizmo.dispose();world.remove(gizmo.getHelper());stage.dispose();},
  };
}
