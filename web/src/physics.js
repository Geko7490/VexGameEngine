import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js';
import {Quaternion,Euler} from 'three';
export const fixedStep=1/60;
let initialization;
export function readyPhysics(){return initialization??=RAPIER.init();}
const vec=([x,y,z])=>({x,y,z});
const rad=Math.PI/180;

export class Physics {
  constructor(level){
    this.world=new RAPIER.World(vec(level.gravity));
    this.world.timestep=fixedStep;
    this.queue=new RAPIER.EventQueue(true);
    this.entries=new Map();
    this.handles=new Map();
    for(const o of level.objects) if(o.body!=='none') this.add(o,o.id===level.player,level.controller);
  }
  add(o,player,controller){
    const desc=o.body==='dynamic'?RAPIER.RigidBodyDesc.dynamic():o.body==='kinematic'?
      RAPIER.RigidBodyDesc.kinematicPositionBased():RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(...o.position).setRotation(new Quaternion().setFromEuler(new Euler(...o.rotation.map(n=>n*rad))));
    if(o.body==='dynamic') desc.setCcdEnabled(true);
    if(player && o.body==='dynamic' && controller!=='ball') desc.lockRotations();
    const body=this.world.createRigidBody(desc);
    const kind=o.collider==='auto'?o.kind:o.collider;
    const [x,y,z]=o.scale;
    let shape;
    if(kind==='sphere') shape=RAPIER.ColliderDesc.ball(Math.max(x,y,z)*.5);
    else if(kind==='capsule') shape=RAPIER.ColliderDesc.capsule(y*.14,Math.max(x,z)*.36);
    else if(kind==='mesh' && o.body!=='dynamic' && o.kind==='box'){
      const v=new Float32Array([-x,-y,-z,x,-y,-z,x,y,-z,-x,y,-z,-x,-y,z,x,-y,z,x,y,z,-x,y,z].map(n=>n*.5));
      const i=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3]);
      shape=RAPIER.ColliderDesc.trimesh(v,i);
    }else shape=RAPIER.ColliderDesc.cuboid(x*.5,y*.5,z*.5);
    shape.setFriction(o.friction).setRestitution(o.restitution).setMass(o.mass)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS).setSensor(o.body==='sensor');
    if(o.body==='sensor')shape.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT|RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED);
    const collider=this.world.createCollider(shape,body);
    const entry={body,collider,o};
    if(player && o.body==='kinematic'){
      entry.character=this.world.createCharacterController(.03);
      entry.character.enableSnapToGround(.18);
    }
    this.entries.set(o.id,entry);
    this.handles.set(collider.handle,entry);
  }
  step(onContact){
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((first,second,started)=>{
      const a=this.handles.get(first), b=this.handles.get(second);
      if(started&&a&&b) onContact(a.o,b.o);
    });
  }
  grounded(entry){
    if(entry.character) return entry.character.computedGrounded();
    const position=entry.body.translation();
    const o=entry.o;
    const half=o.kind==='sphere'?Math.max(...o.scale)*.5:o.kind==='capsule'?o.scale[1]*.14+Math.max(o.scale[0],o.scale[2])*.36:o.scale[1]*.5;
    const ray=new RAPIER.Ray(position,{x:0,y:-1,z:0});
    return !!this.world.castRay(ray,half+.14,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,entry.collider,entry.body);
  }
  translate(entry,p){
    if(entry.body.isKinematic()) entry.body.setNextKinematicTranslation(p);
    else entry.body.setTranslation(p,true);
  }
  rotate(entry,q){
    if(entry.body.isKinematic()) entry.body.setNextKinematicRotation(q);
    else entry.body.setRotation(q,true);
  }
  remove(id){
    const entry=this.entries.get(id);
    if(!entry) return;
    if(entry.character) this.world.removeCharacterController(entry.character);
    this.handles.delete(entry.collider.handle);
    this.world.removeRigidBody(entry.body);
    this.entries.delete(id);
  }
  dispose(){this.queue.free();this.world.free();}
}
