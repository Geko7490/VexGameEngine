export const dataNodes={
  literal:['Sayı',{},'number'], textValue:['Metin',{},'text'], bool:['Mantıksal değer',{},'boolean'],
  read:['Değişken oku',{name:'key'},'number'], sum:['Topla',{a:'number',b:'number'},'number'],
  subtract:['Çıkar',{a:'number',b:'number'},'number'], greater:['Büyüktür',{a:'number',b:'number'},'boolean'],
  vector:['Vektör oluştur',{x:'number',y:'number',z:'number'},'vector'],
  objectValue:['Obje',{target:'object'},'object'], objectPosition:['Obje konumu',{target:'object'},'vector'],
};
export function signature(kind,actions){
  if(kind==='event')return {in:{},out:{next:'exec'}};
  if(kind==='if')return {in:{exec:'exec',condition:'boolean'},out:{yes:'exec',no:'exec'}};
  if(kind==='sequence')return {in:{exec:'exec'},out:{first:'exec',second:'exec'}};
  if(Object.hasOwn(dataNodes,kind))return {in:dataNodes[kind][1],out:{value:dataNodes[kind][2]}};
  if(Object.hasOwn(actions,kind))return {in:{exec:'exec',...actions[kind][1]},out:kind==='branch'?{next:'exec',skip:'exec'}:{next:'exec'}};
  throw Error('Bilinmeyen düğüm.');
}
export function validateGraph(graph,actions,events,validateValue,objects){
  if(!Array.isArray(graph?.nodes)||graph.nodes.length>240||!Array.isArray(graph.edges)||graph.edges.length>1200)throw Error('Grafik sınırı aşıldı.');
  const nodes=new Map(), incoming=new Map(), outgoing=new Map(), paths=new Map();
  for(const n of graph.nodes){
    if(!n||typeof n.id!=='string'||!/^[-\w]{1,80}$/.test(n.id)||nodes.has(n.id)||typeof n.kind!=='string'||
      !Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>100000||Math.abs(n.y)>100000||!n.args)throw Error('Geçersiz düğüm.');
    const pins=signature(n.kind,actions);
    if(n.kind==='event'&&(!Object.hasOwn(events,n.event)||(n.source!==null&&(!['collision','trigger'].includes(n.event)||!objects.has(n.source)))))throw Error('Geçersiz grafik olayı.');
    for(const [pin,type] of Object.entries(pins.in))if(type!=='exec'&&!validateValue(type,n.args[pin]))throw Error('Geçersiz giriş: '+pin);
    const literal={literal:'number',textValue:'text',bool:'boolean'}[n.kind];
    if(literal&&!validateValue(literal,n.args.value))throw Error('Geçersiz sabit değer.');
    nodes.set(n.id,n);
  }
  for(const e of graph.edges){
    const from=nodes.get(e?.from),to=nodes.get(e?.to);
    if(!from||!to)throw Error('Bağlantı ucu bulunamadı.');
    const output=signature(from.kind,actions).out,input=signature(to.kind,actions).in;
    if(!Object.hasOwn(output,e.out)||!Object.hasOwn(input,e.in)||output[e.out]!==input[e.in])throw Error('Pin tipleri uyuşmuyor.');
    const target=e.to+':'+e.in, source=e.from+':'+e.out;
    if((output[e.out]!=='exec'&&incoming.has(target))||(output[e.out]==='exec'&&outgoing.has(source)))throw Error('Bu yürütme pini zaten bağlı.');
    incoming.set(target,e);outgoing.set(source,e.to);
    if(!paths.has(e.from))paths.set(e.from,[]);
    paths.get(e.from).push(e.to);
  }
  const visiting=new Set(),visited=new Set();
  function visit(id){
    if(visiting.has(id))throw Error('Grafikte döngü oluştu.');
    if(visited.has(id))return;
    visiting.add(id);
    for(const to of paths.get(id)??[])visit(to);
    visiting.delete(id);visited.add(id);
  }
  for(const id of nodes.keys())visit(id);
  return {nodes,incoming,outgoing};
}
export function compileGraph(graph,actions,events){
  const {nodes,incoming,outgoing}=validateGraph(graph,actions,events,()=>true,new Set(graph.nodes.map(n=>n.source)));
  const scripts=[];
  for(const n of nodes.values())if(n.kind==='event'){
    const first=outgoing.get(n.id+':next');
    if(first)scripts.push({event:n.event,source:n.source,flow:{first,nodes,incoming,outgoing}});
  }
  return scripts;
}
export function migrate(scripts,prefix='legacy'){
  const nodes=[],edges=[];
  const link=(from,out,to)=>{if(to)edges.push({from,out,to,in:'exec'});};
  scripts.forEach((script,row)=>{
    const eventId=prefix+'-'+row;
    const ids=script.steps.map((_,i)=>eventId+'-'+i);
    nodes.push({id:eventId,kind:'event',event:script.event,source:script.source,x:0,y:row*435,args:{}});
    link(eventId,'next',ids[0]);
    script.steps.forEach((step,i)=>{
      nodes.push({id:ids[i],kind:step.op,x:(i+1)*290,y:row*435,args:{...step.args}});
      link(ids[i],'next',ids[i+1]);
      if(step.op==='branch')link(ids[i],'skip',ids[i+2]);
    });
  });
  return {nodes,edges};
}
