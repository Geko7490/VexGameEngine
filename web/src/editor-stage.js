import {Raycaster,Vector2,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {Stage} from './stage.js';

export function editorStage(host,project,scene,onSelect,onTransform){
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
  gizmo.addEventListener('mouseUp',()=>{
    const root=gizmo.object;
    if(!root)return;
    const r=x=>Math.round(x*10000)/10000;
    onTransform(root.userData.object,{
      position:root.position.toArray().map(x=>r(Math.max(-10000,Math.min(10000,x)))),
      rotation:root.rotation.toArray().slice(0,3).map(x=>r(x*180/Math.PI)),
      scale:root.scale.toArray().map(x=>r(Math.max(.025,Math.min(500,x)))),
    });
  });
  const ray=new Raycaster(), coords=new Vector2(), lifecycle=new AbortController();
  const on=(name,fn)=>canvas.addEventListener(name,fn,{signal:lifecycle.signal});
  on('pointerdown',e=>{
    if(pointer){pointer=null;manipulated=true;return;}
    if(!e.isPrimary)return;
    pointer={x:e.clientX,y:e.clientY,id:e.pointerId};
    manipulated=!!gizmo.dragging;
  });
  on('pointercancel',()=>{pointer=null;});
  on('pointerup',e=>{
    const start=pointer;pointer=null;
    if(!start||start.id!==e.pointerId||manipulated||Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)return;
    const rect=canvas.getBoundingClientRect();
    coords.set(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);
    ray.setFromCamera(coords,camera);
    const roots=Array.from(entries.values()).filter(entry=>!entry.o.parent).map(entry=>entry.root);
    const first=ray.intersectObjects(roots,true)[0];
    let root=first?.object;
    while(root&&!root.userData.object)root=root.parent;
    onSelect(root?.userData.object??null);
  });
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
    configure(id,tool,space,snap){
      const root=entries.get(id)?.root;
      if(root&&tool!=='select')gizmo.attach(root);else gizmo.detach();
      if(tool!=='select')gizmo.setMode(tool);
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
    dispose(){cancelAnimationFrame(handle);lifecycle.abort();orbit.dispose();gizmo.dispose();world.remove(gizmo.getHelper());stage.dispose();},
  };
}
