const maxThreads=256;
const stepBudget=2000;

// A bounded interpreter. Project data cannot execute JavaScript.
export class BlockMachine {
  constructor(scripts,host){
    this.scripts=scripts;
    this.host=host;
    this.threads=[];
    this.time=0;
  }
  emit(event,self=null,other=null){
    for(const script of this.scripts){
      if(this.threads.length>=maxThreads) break;
      if(script.event!==event || (script.source!==null && script.source!==self) || (!script.flow&&!script.steps.length)) continue;
      if(event==='step' && this.threads.some(thread=>thread.script===script)) continue;
      this.threads.push({script,self,other,index:0,node:script.flow?.first,pending:[],wake:this.time});
    }
  }
  tick(dt){
    this.time+=dt;
    let budget=stepBudget;
    const active=this.threads;
    this.threads=[];
    for(const thread of active){
      if(thread.script.flow){
        while(budget>0&&thread.node&&thread.wake<=this.time){
          budget--;
          if(this.advanceGraph(thread,dt)===false)return;
        }
        if(thread.node)this.threads.push(thread);
        continue;
      }
      while(budget>0 && thread.wake<=this.time && thread.index<thread.script.steps.length){
        budget--;
        const {op,args}=thread.script.steps[thread.index++];
        if(op==='wait') thread.wake=this.time+Math.max(dt,Math.min(3600,args.amount));
        else if(op==='branch'){
          if(!(this.host.variable(args.name)>args.amount)) thread.index++;
        }else{
          const target=args.target==='$self'?thread.self:args.target==='$other'?thread.other:args.target;
          if(this.host.apply(op,args,target)===false) return;
        }
      }
      if(thread.index<thread.script.steps.length) this.threads.push(thread);
    }
  }
  advanceGraph(thread,dt){
    const {nodes,incoming,outgoing}=thread.script.flow;
    const n=nodes.get(thread.node), cache=new Map();
    const target=value=>value==='$self'?thread.self:value==='$other'?thread.other:value;
    function input(node,pin){const edge=incoming.get(node.id+':'+pin);return edge?value(edge.from):node.args[pin];}
    const host=this.host;
    function value(id){
      if(cache.has(id))return cache.get(id);
      const node=nodes.get(id), get=pin=>input(node,pin);
      let result;
      switch(node.kind){
        case 'read':result=host.variable(get('name'));break;
        case 'sum':result=get('a')+get('b');break;
        case 'subtract':result=get('a')-get('b');break;
        case 'greater':result=get('a')>get('b');break;
        case 'vector':result=['x','y','z'].map(get);break;
        case 'objectValue':result=get('target');break;
        case 'objectPosition':result=host.position?.(target(get('target')))??[0,0,0];break;
        default:result=node.args.value;
      }
      if(typeof result==='number')result=Number.isFinite(result)?Math.max(-100000,Math.min(100000,result)):0;
      cache.set(id,result);
      return result;
    }
    const args=Object.fromEntries(Object.keys(n.args).map(key=>[key,input(n,key)]));
    let next='next';
    if(n.kind==='if')next=args.condition?'yes':'no';
    else if(n.kind==='branch')next=host.variable(args.name)>args.amount?'next':'skip';
    else if(n.kind==='sequence'){
      const second=outgoing.get(n.id+':second');
      if(second)thread.pending.push(second);
      next='first';
    }else if(n.kind==='wait')thread.wake=this.time+Math.max(dt,Math.min(3600,args.amount));
    else if(host.apply(n.kind,args,target(args.target))===false)return false;
    thread.node=outgoing.get(n.id+':'+next)??thread.pending.pop();
  }
}
