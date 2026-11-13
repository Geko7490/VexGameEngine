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
      if(script.event!==event || (script.source!==null && script.source!==self) || !script.steps.length) continue;
      if(event==='step' && this.threads.some(thread=>thread.script===script)) continue;
      this.threads.push({script,self,other,index:0,wake:this.time});
    }
  }
  tick(dt){
    this.time+=dt;
    let budget=stepBudget;
    const active=this.threads;
    this.threads=[];
    for(const thread of active){
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
}
