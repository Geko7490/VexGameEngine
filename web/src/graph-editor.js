import {signature,dataNodes} from './graph.js';
import {button,el} from './dom.js';

const names={exec:'Akış',number:'Sayı',boolean:'Mantık',text:'Metin',vector:'Vektör',object:'Obje',key:'Değişken',scene:'Sahne',audio:'Ses',color:'Renk',
  next:'Devam',yes:'Doğru',no:'Yanlış',first:'Birinci',second:'İkinci',skip:'Atla',value:'Değer',condition:'Koşul'};
const ns='http://www.w3.org/2000/svg';
export class GraphEditor {
  constructor(){this.x=24;this.y=24;this.zoom=.78;this.pin=null;}
  render(graph,{actions,events,edit,make,field,eventField}){
    const shell=el('section',{className:'graph-editor'});
    const controls=el('div',{className:'graph-tools'});
    const area=el('div',{className:'graph-canvas',role:'region','aria-label':'Düğüm tuvali'});
    const layer=el('div',{className:'graph-layer'});
    const wires=document.createElementNS(ns,'svg');
    wires.classList.add('graph-wires');layer.append(wires);area.append(layer);shell.append(controls,area);
    const defs={event:'Olay',if:'Eğer',sequence:'Sırayla çalıştır',
      ...Object.fromEntries(Object.entries(actions).map(([k,v])=>[k,v[0]])),
      ...Object.fromEntries(Object.entries(dataNodes).map(([k,v])=>[k,v[0]]))};
    const nodes=new Map(graph.nodes.map(n=>[n.id,n])),points=new Map();
    if(this.pin&&!nodes.has(this.pin.id))this.pin=null;
    const transform=()=>{
      layer.style.transform='translate('+this.x+'px,'+this.y+'px) scale('+this.zoom+')';
      area.style.backgroundPosition=this.x+'px '+this.y+'px';
      area.style.backgroundSize=24*this.zoom+'px '+24*this.zoom+'px';
    };
    const draw=()=>{
      wires.replaceChildren();
      const rect=layer.getBoundingClientRect();
      for(const edge of graph.edges){
        const ends=[points.get(edge.from+':out:'+edge.out),points.get(edge.to+':in:'+edge.in)];
        if(ends.some(p=>!p))continue;
        const [[x,y],[a,b]]=ends.map(p=>{const r=p.getBoundingClientRect();return [(r.x+r.width/2-rect.x)/this.zoom,(r.y+r.height/2-rect.y)/this.zoom];});
        const bend=Math.max(55,Math.abs(a-x)*.5), path=document.createElementNS(ns,'path');
        path.setAttribute('d','M '+x+' '+y+' C '+(x+bend)+' '+y+' '+(a-bend)+' '+b+' '+a+' '+b);
        path.setAttribute('class','wire-'+ends[0].dataset.type);
        wires.append(path);
      }
    };
    transform();
    const tray=el('div',{className:'graph-tray',hidden:true});shell.append(tray);
    const compatible=(kind,side,type)=>Object.entries(signature(kind,actions)[side]).filter(([,t])=>t===type);
    const connect=(left,right)=>{
      const [out,input]=left.side==='out'?[left,right]:[right,left];
      graph.edges=graph.edges.filter(e=>!(input.type!=='exec'&&e.to===input.id&&e.in===input.name)&&!(out.type==='exec'&&e.from===out.id&&e.out===out.name));
      graph.edges.push({from:out.id,out:out.name,to:input.id,in:input.name});
    };
    const add=(kind,at,other)=>{
      const activeNode=nodes.get(this.pin?.id);
      const position=activeNode?{x:activeNode.x+(this.pin.side==='out'?290:-290),y:activeNode.y}:{...at};
      while(graph.nodes.some(n=>Math.abs(n.x-position.x)<235&&Math.abs(n.y-position.y)<290))position.y+=300;
      const n=make(kind,position);if(!n)return;
      const active=this.pin;this.pin=null;
      edit(()=>{graph.nodes.push(n);if(active&&other)connect(active,{id:n.id,...other});});
    };
    const center=()=>({x:Math.round((area.clientWidth*.3-this.x)/this.zoom),y:Math.round((area.clientHeight*.28-this.y)/this.zoom)});
    const openTray=(at,quick=false)=>{
      tray.replaceChildren();
      const list=el('div',{className:'graph-choices'});
      const search=el('input',{placeholder:'Düğüm ara','aria-label':'Düğüm ara',oninput:()=>fill()});
      const pin=this.pin, side=pin?.side==='in'?'out':'in';
      const fill=()=>{
        list.replaceChildren();
        const query=search.value.toLocaleLowerCase('tr');
        if(pin){
          const source=nodes.get(pin.id);
          for(const n of graph.nodes){
            if(n===source)continue;
            for(const [name,type] of compatible(n.kind,side,pin.type)){
              const label=defs[n.kind]+' · '+(names[name]??name);
              if(!label.toLocaleLowerCase('tr').includes(query))continue;
              list.append(button(label,()=>{this.pin=null;edit(()=>connect(pin,{id:n.id,side,name,type}));}));
            }
          }
        }
        const kinds=quick&&!query&&!pin?['if','set','wait','score','event']:Object.keys(defs);
        for(const kind of kinds){
          if(!defs[kind].toLocaleLowerCase('tr').includes(query))continue;
          const candidates=pin?compatible(kind,side,pin.type):[[null,null]];
          for(const [name,type] of candidates)list.append(button('+ '+defs[kind]+(name?' · '+(names[name]??name):''),()=>add(kind,at,name?{side,name,type}:null)));
        }
      };
      tray.append(el('div',{className:'graph-tray-head'},search,button('Kapat',()=>{tray.hidden=true;this.pin=null;})));
      if(pin)tray.append(button('Bağlantıyı kaldır',()=>{this.pin=null;edit(()=>{
        graph.edges=graph.edges.filter(e=>pin.side==='in'?e.to!==pin.id||e.in!==pin.name:e.from!==pin.id||e.out!==pin.name);
      });}));
      tray.append(list);tray.hidden=false;fill();
    };
    const zoomAt=(scale,x,y)=>{
      const next=Math.max(.3,Math.min(1.7,scale));
      this.x=x-(x-this.x)*next/this.zoom;this.y=y-(y-this.y)*next/this.zoom;this.zoom=next;transform();
    };
    controls.append(button('+ Düğüm',()=>{this.pin=null;openTray(center());},{className:'primary'}),
      button('Düzenle',()=>edit(()=>{
        const depths=new Map();
        function depth(id){if(!depths.has(id))depths.set(id,Math.max(0,...graph.edges.filter(e=>e.to===id).map(e=>depth(e.from)+1)));return depths.get(id);}
        const rows=new Map();
        for(const n of graph.nodes){const col=depth(n.id), row=rows.get(col)??0;n.x=col*290;n.y=row*440;rows.set(col,row+1);}
      })),button('−',()=>zoomAt(this.zoom/1.2,area.clientWidth/2,area.clientHeight/2)),
      button('+',()=>zoomAt(this.zoom*1.2,area.clientWidth/2,area.clientHeight/2)),button('Başlangıç',()=>{this.x=24;this.y=24;this.zoom=.78;transform();}));
    for(const n of graph.nodes){
      const card=el('article',{className:'graph-node '+(n.kind==='event'?'graph-event':dataNodes[n.kind]?'graph-data':'graph-action')});
      card.style.left=n.x+'px';card.style.top=n.y+'px';
      const heading=el('div',{className:'graph-node-title'},el('strong',{},n.kind==='event'?events[n.event]:defs[n.kind]),
        button('×',()=>edit(()=>{graph.nodes=graph.nodes.filter(v=>v!==n);graph.edges=graph.edges.filter(e=>e.from!==n.id&&e.to!==n.id);}),{'aria-label':'Düğümü sil'}));
      card.append(heading);
      const pins=signature(n.kind,actions);
      function makePin(side,name,type){
        const point=button((names[name]??name)+' · '+(names[type]??type),()=>{
          const pin={id:n.id,side,name,type}, previous=this.pin;
          if(previous&&previous.side!==side&&previous.type===type&&previous.id!==n.id){
            this.pin=null;edit(()=>connect(previous,pin));return;
          }
          this.pin=pin;openTray(center());
        },{'data-type':type,className:'graph-pin'});
        points.set(n.id+':'+side+':'+name,point);return point;
      }
      for(const [name,type] of Object.entries(pins.out))card.append(makePin.call(this,'out',name,type));
      if(n.kind==='event')card.append(...eventField(n));
      for(const [name,type] of Object.entries(pins.in)){
        card.append(makePin.call(this,'in',name,type));
        if(type!=='exec'&&!graph.edges.some(e=>e.to===n.id&&e.in===name))card.append(field(type,name,n.args[name],v=>edit(()=>{n.args[name]=v;})));
      }
      const literal={literal:'number',textValue:'text',bool:'boolean'}[n.kind];
      if(literal)card.append(field(literal,'value',n.args.value,v=>edit(()=>{n.args.value=v;})));
      layer.append(card);
      let drag;
      heading.addEventListener('pointerdown',e=>{
        if(e.target.closest('button')||e.button!==0)return;
        heading.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};e.stopPropagation();
      });
      heading.addEventListener('pointermove',e=>{
        if(!drag)return;
        card.style.left=n.x+(e.clientX-drag.x)/this.zoom+'px';card.style.top=n.y+(e.clientY-drag.y)/this.zoom+'px';draw();
      });
      heading.addEventListener('pointerup',e=>{
        if(!drag)return;
        const dx=(e.clientX-drag.x)/this.zoom,dy=(e.clientY-drag.y)/this.zoom;drag=null;
        if(Math.hypot(dx,dy)>3)edit(()=>{n.x=Math.round((n.x+dx)/12)*12;n.y=Math.round((n.y+dy)/12)*12;});
      });
      heading.addEventListener('pointercancel',()=>{drag=null;card.style.left=n.x+'px';card.style.top=n.y+'px';draw();});
    }
    const fingers=new Map();let press;
    const location=e=>{const r=area.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    area.addEventListener('pointerdown',e=>{
      if(e.target.closest('.graph-node')||e.button!==0)return;
      area.setPointerCapture(e.pointerId);const point=location(e);fingers.set(e.pointerId,point);
      clearTimeout(press);
      if(fingers.size===1)press=setTimeout(()=>{this.pin=null;openTray({x:Math.round((point.x-this.x)/this.zoom),y:Math.round((point.y-this.y)/this.zoom)},true);},470);
    });
    area.addEventListener('pointermove',e=>{
      const before=fingers.get(e.pointerId);if(!before)return;
      const point=location(e),dx=point.x-before.x,dy=point.y-before.y;
      if(Math.hypot(dx,dy)>2)clearTimeout(press);
      fingers.set(e.pointerId,point);
      if(fingers.size===2){
        const second=[...fingers].find(([id])=>id!==e.pointerId)[1],dist=p=>Math.hypot(p.x-second.x,p.y-second.y);
        if(dist(before)>3)zoomAt(this.zoom*dist(point)/dist(before),(point.x+second.x)/2,(point.y+second.y)/2);
      }else{this.x+=dx;this.y+=dy;transform();}
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])area.addEventListener(event,e=>{clearTimeout(press);fingers.delete(e.pointerId);});
    area.addEventListener('wheel',e=>{e.preventDefault();const p=location(e);zoomAt(this.zoom*Math.exp(-e.deltaY*.001),p.x,p.y);},{passive:false});
    requestAnimationFrame(draw);
    return shell;
  }
}
