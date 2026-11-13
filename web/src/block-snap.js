import {Box3, Vector3} from 'three';

const axes=['x','y','z'];
const unitBox=new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5));

function alignedBounds(object){
  object.updateWorldMatrix(true,false);
  const m=object.matrixWorld.elements;
  const rows=new Set();
  for(let column=0;column<3;column++){
    const values=m.slice(column*4,column*4+3).map(Math.abs);
    const maximum=Math.max(...values);
    if(maximum===0 || values.filter(value=>value>maximum*1e-5).length!==1)return null;
    rows.add(values.indexOf(maximum));
  }
  return rows.size===3?unitBox.clone().applyMatrix4(object.matrixWorld):null;
}

// Match an actual face of an axis-aligned block, including scaled and stacked blocks.
export function snapBlock(root,neighbors,distance=.25){
  const box=alignedBounds(root);
  if(!box)return false;
  let best=null;
  for(const neighbor of neighbors){
    const other=alignedBounds(neighbor);
    if(!other)continue;
    for(const axis of axes){
      if(!axes.every(k=>k===axis || Math.min(box.max[k],other.max[k])-Math.max(box.min[k],other.min[k])>1e-5))continue;
      for(const offset of [other.min[axis]-box.max[axis],other.max[axis]-box.min[axis]]){
        if(Math.abs(offset)<=distance&&(!best||Math.abs(offset)<Math.abs(best.offset)))best={axis,offset,other};
      }
    }
  }
  if(!best)return false;
  const world=root.getWorldPosition(new Vector3());
  world[best.axis]+=best.offset;
  for(const axis of axes.filter(axis=>axis!==best.axis)){
    const options=[best.other.min[axis]-box.min[axis],best.other.max[axis]-box.max[axis]];
    const offset=options.reduce((a,b)=>Math.abs(a)<Math.abs(b)?a:b);
    if(Math.abs(offset)<=distance)world[axis]+=offset;
  }
  root.position.copy(root.parent?root.parent.worldToLocal(world):world);
  return true;
}
