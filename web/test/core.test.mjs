import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {encode,decode,id,makeObject,validate} from '../src/project.js';
import {templates,createTemplate} from '../src/templates.js';
import {projectArchive,importArchive} from '../src/archive.js';
import {BlockMachine} from '../src/blocks.js';
import {readyPhysics,Physics,fixedStep} from '../src/physics.js';

test('all editable templates survive project ZIP round-trip',()=>{
  for(const key of Object.keys(templates)){
    const p=createTemplate('Üç Boyut',key);
    assert.deepEqual(decode(encode(p)),p);
    assert.deepEqual(importArchive(projectArchive(p)),p);
  }
});
test('malformed archives, corrupt data and wrong paths are rejected',()=>{
  assert.throws(()=>importArchive(zipSync({'../project.json':new Uint8Array([1])})));
  const bytes=projectArchive(createTemplate('Test','platform'));
  bytes[45]^=1;
  assert.throws(()=>importArchive(bytes),/Geçersiz VEX/);
});
test('typed block references and parent cycles are rejected',()=>{
  const p=createTemplate('Test','blank'), s=p.scenes[0], a=makeObject(), b=makeObject();
  s.objects.push(a,b);
  a.parent=b.id;b.parent=a.id;
  assert.throws(()=>validate(p),/üst obje/);
  b.parent=null;
  s.scripts.push({id:id(),event:'start',source:null,steps:[{op:'move',args:{target:a.id,xyz:[0,'1',0]}}]});
  assert.throws(()=>validate(p),/geçersiz giriş/);
});
test('events preserve collision context and delayed blocks do not execute early',()=>{
  const applied=[];
  const scripts=[{event:'trigger',source:'goal',steps:[{op:'wait',args:{amount:.25}},{op:'destroy',args:{target:'$other'}}]}];
  const vm=new BlockMachine(scripts,{variable:()=>0,apply:(op,args,target)=>applied.push([op,target])});
  vm.emit('trigger','wrong','player');
  vm.tick(.125);
  assert.equal(vm.threads.length,0);
  vm.emit('trigger','goal','player');
  vm.tick(.125);vm.tick(.125);
  assert.deepEqual(applied,[]);
  vm.tick(.125);
  assert.deepEqual(applied,[['destroy','player']]);
});
test('Rapier keeps the character on a platform and emits a sensor contact',async()=>{
  await readyPhysics();
  const s=createTemplate('Test','platform').scenes[0];
  const player=s.objects.find(o=>o.id===s.player);
  const sensor=makeObject('box',{body:'sensor',position:[0,.4,2],scale:[3,.8,3]});
  s.objects.push(sensor);
  const physics=new Physics(s);
  try{
    const hits=[];
    for(let i=0;i<180;i++)physics.step((a,b)=>hits.push([a.id,b.id]));
    const entry=physics.entries.get(player.id);
    assert.ok(Math.abs(entry.body.translation().y-.425)<.09);
    assert.ok(physics.grounded(entry));
    assert.ok(hits.some(pair=>pair.includes(sensor.id)&&pair.includes(player.id)));
    assert.ok(Math.abs(physics.world.timestep-fixedStep)<1e-6);
  }finally{physics.dispose();}
});
