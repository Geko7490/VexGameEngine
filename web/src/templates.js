import {id,makeObject as obj,makeProject} from './project.js';
export const templates={blank:'Boş proje',platform:'3D Platform',racing:'Araba Yarışı',ball:'Top Bulmacası',parkour:'Parkur',collect:'Kristal Toplama',escape:'Düşmandan Kaçış'};
const block=(op,args={})=>({op,args});
const event=(event,source,...steps)=>({id:id(),event,source,steps});
export function createTemplate(name,type){
  const project=makeProject(name);
  if(type==='blank') return project;
  const s=project.scenes[0], platform=(name,position,scale,color='#57548c')=>obj('box',{name,position,scale,color,body:'fixed'});
  const runner=type==='platform'||type==='parkour';
  const player=obj(type==='ball'?'sphere':type==='racing'?'box':'capsule',{name:'Oyuncu',position:[0,1.3,2],body:'dynamic',
    scale:type==='racing'?[1.25,.6,2]:[.85,.85,.85]});
  s.objects.push(player);
  s.player=player.id;
  s.controller=type==='racing'?'vehicle':type==='ball'?'ball':'third';
  if(type==='racing'||type==='ball') s.ui.jump='';
  if(runner){
    s.objects.push(platform('Başlangıç',[0,-.25,2],[5,.5,5]));
    for(let i=1;i<=5;i++) s.objects.push(platform('Platform '+i,[i%2?1:-1,i*(type==='parkour'?.36:.20)-.25,2-i*3],[3.3,.5,2.7]));
  }else{
    s.objects.push(platform('Zemin',[0,-.25,-6],[14,.5,24]));
    for(let i=0;i<4;i++) s.objects.push(platform('Engel '+(i+1),[i%2?-2.2:2.2,.55,-2-i*3],[type==='racing'?2:3,1.1,.7],'#7656a8'));
    if(type==='ball'){
      s.objects.push(platform('Sol bariyer',[-5,.45,-4],[.35,.9,17]),platform('Sağ bariyer',[5,.45,-4],[.35,.9,17]));
    }
  }
  if(type==='collect'){
    for(let i=0;i<5;i++){
      const crystal=obj('sphere',{name:'Kristal '+(i+1),position:[i%2?4:-4,.6,-i*2.8],scale:[.8,.8,.8],color:'#70ffd9',body:'sensor'});
      s.objects.push(crystal);
      s.scripts.push(event('trigger',crystal.id,block('score',{amount:10}),block('destroy',{target:'$self'}),
        block('add',{name:'crystals',amount:1}),block('branch',{name:'crystals',amount:4}),block('finish',{text:'Bütün kristaller toplandı'})));
    }
  }else{
    const goal=obj('box',{name:'Bitiş',position:runner?[1,type==='parkour'?2.35:1.55,-13]:[0,.55,-14],scale:[2,1.1,1.1],
      body:'sensor',color:'#55ffbd',emissive:'#105d49',opacity:.75});
    s.objects.push(goal);
    s.scripts.push(event('trigger',goal.id,block('score',{amount:100}),block('finish',{text:'Bölüm tamamlandı'})));
  }
  if(type==='escape'){
    for(const x of [-4.3,4.3]){
      const guard=obj('capsule',{name:'Devriye',color:'#fc627e',position:[x,.65,-7],body:'kinematic'});
      s.objects.push(guard);
      const stride=x<0?.0715:-.0715;
      s.scripts.push(event('start',null,block('set',{name:x<0?'guardA':'guardB',amount:0})));
      const counter=x<0?'guardA':'guardB';
      s.scripts.push(event('step',null,block('add',{name:counter,amount:1}),block('move',{target:guard.id,xyz:[stride,0,0]}),block('branch',{name:counter,amount:119}),
        block('position',{target:guard.id,xyz:[x,.65,-7]}),block('branch',{name:counter,amount:119}),block('set',{name:counter,amount:0})));
      s.scripts.push(event('collision',guard.id,block('health',{amount:-100}),block('finish',{text:'Devriye seni yakaladı'})));
    }
  }
  return project;
}
