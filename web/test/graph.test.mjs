import test from 'node:test';
import assert from 'node:assert/strict';
import {actions,events,makeProject,makeObject,validate,encode,decode} from '../src/project.js';
import {compileGraph,migrate} from '../src/graph.js';
import {BlockMachine} from '../src/blocks.js';

test('key pickup, typed condition and door opening survive serialization',()=>{
  const p=makeProject('Anahtarlı kapı'), s=p.scenes[0];
  const key=makeObject('box',{body:'sensor'}), door=makeObject('box',{body:'fixed'});
  s.objects.push(key,door);
  const n=(id,kind,args={},extra={})=>({id,kind,x:0,y:0,args,...extra});
  const edge=(from,out,to,input='exec')=>({from,out,to,in:input});
  s.graph={nodes:[
    n('pickup','event',{}, {event:'trigger',source:key.id}),
    n('set','set',{name:'anahtar',amount:1}),n('destroy','destroy',{target:'$self'}),
    n('touch','event',{}, {event:'collision',source:door.id}),
    n('if','if',{condition:false}),n('open','destroy',{target:door.id}),n('locked','text',{text:'Kilitli'}),
    n('read','read',{name:'anahtar'}),n('greater','greater',{a:0,b:0}),
  ],edges:[
    edge('pickup','next','set'),edge('set','next','destroy'),edge('touch','next','if'),
    edge('read','value','greater','a'),edge('greater','value','if','condition'),edge('if','yes','open'),edge('if','no','locked'),
  ]};
  const vars=new Map(), moves=[];
  const vm=new BlockMachine(compileGraph(decode(encode(p)).scenes[0].graph,actions,events),{
    variable:k=>vars.get(k)??0,
    apply(op,args,target){if(op==='set')vars.set(args.name,args.amount);else moves.push([op,target??args.text]);},
  });
  for(const [event,source] of [['collision',door.id],['trigger',key.id],['collision',door.id]]){vm.emit(event,source);vm.tick(1/60);}
  assert.deepEqual(moves,[['text','Kilitli'],['destroy',key.id],['destroy',door.id]]);
  s.graph.edges[4].to='read';s.graph.edges[4].in='name';
  assert.throws(()=>validate(p),/Pin tipleri/);
});

test('legacy skip behavior migrates and cyclic flow is rejected',()=>{
  const p=makeProject('Eski proje'), s=p.scenes[0];
  s.graph=migrate([{id:'legacy',event:'start',source:null,steps:[
    {op:'branch',args:{name:'x',amount:0}},{op:'score',args:{amount:10}},{op:'score',args:{amount:20}},
  ]}]);
  validate(p);
  const result=[];
  const vm=new BlockMachine(compileGraph(s.graph,actions,events),{variable:()=>0,apply:(_,args)=>result.push(args.amount)});
  vm.emit('start');vm.tick(1/60);
  assert.deepEqual(result,[20]);
  s.graph.edges=s.graph.edges.filter(e=>e.to!=='legacy-0-0');
  s.graph.edges.push({from:'legacy-0-2',out:'next',to:'legacy-0-0',in:'exec'});
  assert.throws(()=>validate(p),/döngü/);
});
