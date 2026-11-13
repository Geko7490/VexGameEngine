import assert from 'node:assert/strict';
import test from 'node:test';
import {Group} from 'three';
import {snapBlock} from '../src/block-snap.js';

test('scaled neighbors snap flush from either side and can be stacked',()=>{
  const block=new Group(), other=new Group();
  other.scale.set(2,1,2);
  for(const [axis,start,end] of [['x',1.68,1.5],['x',-1.68,-1.5],['y',1.15,1]]){
    block.position.set(0,0,0);
    block.position[axis]=start;
    assert.equal(snapBlock(block,[other]),true);
    assert.ok(Math.abs(block.position[axis]-end)<1e-8);
  }
});
test('rejects distant, corner-only and angled candidates',()=>{
  const block=new Group(), other=new Group();
  for(const [x,y,z] of [[1.4,0,0],[1.1,0,1.1]]){
    block.position.set(x,y,z);
    assert.equal(snapBlock(block,[other]),false);
  }
  block.position.set(1.1,0,0);
  other.rotation.y=Math.PI/4;
  assert.equal(snapBlock(block,[other]),false);
});
