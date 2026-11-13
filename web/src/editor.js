import {actions,events,makeObject,makeScene,id,clone,encode,maxBytes} from './project.js';
import {templates,createTemplate} from './templates.js';
import {editorStage} from './editor-stage.js';
import {inspectModel} from './stage.js';
import {startGame} from './runtime.js';
import {projectArchive,importArchive} from './archive.js';
import {exportGame} from './export.js';
import * as disk from './storage.js';
import {el,button} from './dom.js';

const root=document.querySelector('#app'), notice=document.querySelector('#notice');
let renderedGallery=0;
let p=null, levelId=null, selected=null, activePanel='scene', tool='select', space='world', snap=false;
let undo=[],redo=[], saveTimer, saveQueue=Promise.resolve(), saveVersion=0;
let stage=null,stopGame=null, viewport=null,panel=null,toolbar=null,header=null,metrics=null, statsTimer=null;
let galleryMode='projects', session=0, toastTimer;
const level=()=>p.scenes.find(s=>s.id===levelId);
const current=()=>level().objects.find(o=>o.id===selected);
const asName=(name,fallback)=>name?.trim().slice(0,80)||fallback;
const label=(title,control)=>el('label',{className:'field'},el('span',{},title),control);
const text=(value,change,max=80)=>el('input',{value,maxlength:max,onchange:e=>change(e.target.value)});
const check=(value,change)=>el('input',{type:'checkbox',checked:value,onchange:e=>change(e.target.checked)});
function number(value,change,min=-10000,max=10000,step=.05){
  return el('input',{type:'number',value,min,max,step,onchange:e=>{
    const n=e.target.valueAsNumber;
    if(Number.isFinite(n))change(Math.min(max,Math.max(min,n)));
    else e.target.value=value;
  }});
}
function dropdown(entries,value,change){
  const select=el('select',{onchange:e=>change(e.target.value)});
  for(const [v,name] of entries)select.append(el('option',{value:v},name));
  select.value=value??'';
  return select;
}
const options=(map,value,change)=>dropdown(Object.entries(map),value,change);
const color=(value,change)=>el('input',{type:'color',value,onchange:e=>change(e.target.value)});
const title=(name,detail)=>el('div',{className:'section-title'},el('h2',{},name),detail);
const row=(...children)=>el('div',{className:'row'},...children);
const muted=t=>el('p',{className:'muted'},t);
function flash(message,error=false){
  notice.textContent=message;notice.hidden=false;notice.className=error?'error':'';
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{notice.hidden=true;},4500);
}
function run(fn){return async()=>{try{await fn();}catch(e){flash(e.message,true);}};}
function confirmAction(message){
  return new Promise(resolve=>{
    const dialog=el('dialog',{},el('p',{},message),row(button('Vazgeç',()=>dialog.close('no')),button('Sil',()=>dialog.close('yes'),{className:'danger'})));
    dialog.addEventListener('close',()=>{dialog.remove();resolve(dialog.returnValue==='yes');},{once:true});
    document.body.append(dialog);dialog.showModal();
  });
}
function nameDialog(initial,heading){
  return new Promise(resolve=>{
    const input=el('input',{value:initial,required:'',maxlength:80,'aria-label':'Proje adı'});
    const form=el('form',{method:'dialog'},el('h2',{},heading),input,row(button('Vazgeç',()=>dialog.close()),el('button',{type:'submit',value:'yes',className:'primary'},'Onayla')));
    const dialog=el('dialog',{},form);
    dialog.addEventListener('close',()=>{dialog.remove();resolve(dialog.returnValue==='yes'?input.value.trim():null);},{once:true});
    document.body.append(dialog);dialog.showModal();input.focus();input.select();
  });
}
let nativePickerOpen=false;
function filePick(accept,handle){
  if(window.VexImport){
    if(nativePickerOpen)return;
    nativePickerOpen=true;
    window.VexImport.onmessage=event=>{
      window.VexImport.onmessage=null;
      nativePickerOpen=false;
      run(async()=>{
        const picked=JSON.parse(event.data);
        if(picked.error)throw new Error(picked.error);
        if(!picked.path)return;
        if(!/^[a-f0-9-]{36}$/.test(picked.path))throw new Error('Geçersiz dosya seçimi.');
        const response=await fetch('/picked/'+picked.path,{cache:'no-store'});
        if(!response.ok)throw new Error('Seçilen dosya okunamadı.');
        await handle(new File([await response.blob()],picked.name));
      })();
    };
    try{window.VexImport.postMessage('pick');}
    catch(error){nativePickerOpen=false;window.VexImport.onmessage=null;flash(error.message,true);}
    return;
  }
  const file=el('input',{type:'file',accept,hidden:true,onchange:async()=>{
    const picked=file.files?.[0];file.remove();
    if(picked)await run(()=>handle(picked))();
  },oncancel:()=>file.remove()});
  document.body.append(file);file.click();
}
const safeName=name=>name.replace(/[\\/:*?"<>|]/g,'_').slice(0,65)||'VEX';
const downloadProject=q=>disk.download(projectArchive(q),safeName(q.name)+'.vex.zip');
const downloadGame=q=>disk.download(exportGame(q),safeName(q.name)+'.zip');

function status(value){if(header)header.querySelector('[data-save]')?.replaceChildren(value);}
function persist(){
  clearTimeout(saveTimer);
  if(!p)return saveQueue;
  const copy=clone(p), version=++saveVersion;
  saveQueue=saveQueue.catch(()=>{}).then(()=>disk.save(copy)).then(()=>{
    if(version===saveVersion)status('Kaydedildi');
  }).catch(error=>{if(version===saveVersion)status('Kayıt başarısız');throw error;});
  return saveQueue;
}
function schedule(){
  status('Kaydediliyor');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>run(persist)(),300);
}
function normalize(){
  if(!p.scenes.some(s=>s.id===levelId))levelId=p.start;
  if(!current())selected=null;
}
function change(mutate,rebuild=true){
  const before=clone(p);
  try{mutate();encode(p);}
  catch(e){p=before;normalize();renderPanel();flash(e.message,true);return false;}
  undo.push(before);if(undo.length>35)undo.shift();redo=[];
  normalize();schedule();
  if(rebuild)rebuildStage();
  refresh();
  return true;
}
function history(from,to){
  if(!from.length)return;
  to.push(clone(p));p=from.pop();normalize();schedule();rebuildStage();refresh();
}
function teardown(){
  session++;
  stage?.dispose();stage=null;
  stopGame?.();stopGame=null;
  clearInterval(statsTimer);
}
function openEditor(q){
  teardown();p=clone(q);levelId=p.start;selected=null;activePanel='scene';tool='select';undo=[];redo=[];
  viewport=el('section',{className:'viewport','aria-label':'3D sahne'});
  panel=el('aside',{className:'panel'});
  toolbar=el('div',{className:'toolbar'});
  header=el('header',{className:'editor-head'});
  metrics=el('span',{className:'metrics'});
  const section=el('div',{className:'studio'},header,toolbar,el('div',{className:'work-area'},viewport,panel));
  root.replaceChildren(section);
  rebuildStage();refresh();
  statsTimer=setInterval(()=>{
    if(!stage)return;
    const m=stage.metrics();
    metrics.textContent=m.fps+' FPS · '+m.objects+' obje · '+m.calls+' çizim · '+m.triangles+' üçgen';
  },850);
}
function rebuildStage(restore=true){
  const saved=restore?stage?.camera():null;
  stage?.dispose();stage=null;
  viewport.replaceChildren();
  try{
    stage=editorStage(viewport,p,level(),objectId=>{selected=objectId;activePanel='scene';refresh();},
      (objectId,transform)=>{
        if(!objectId){flash(transform+' yüklenemedi.',true);return;}
        const object=level().objects.find(o=>o.id===objectId);
        if(object&&JSON.stringify(transform)!==JSON.stringify({position:object.position,rotation:object.rotation,scale:object.scale})){
          if(!change(()=>Object.assign(object,transform),false))rebuildStage();
        }
      });
    if(saved)stage.restore(saved);
    stage.configure(selected,tool,space,snap);
  }catch(e){viewport.replaceChildren(muted('3D görünüm açılmadı. WebGL 2 desteğini kontrol edin.'));flash(e.message,true);}
}
async function play(project,preview){
  const serial=++session;
  const container=el('section',{className:'play-screen'});
  const host=el('div',{className:'game-host'});
  const back=button(preview?'Testi durdur':'Galeriye dön',()=>{
    if(preview){session++;stopGame?.();stopGame=null;root.replaceChildren(container.editor);rebuildStage();refresh();}else run(gallery)();
  });
  container.append(el('header',{className:'play-head'},back,el('strong',{},project.name)),host);
  if(preview){container.editor=root.firstElementChild;stage?.dispose();stage=null;}
  root.replaceChildren(container);
  try{
    const stop=await startGame(host,project,{preview});
    if(serial!==session)stop();else stopGame=stop;
  }catch(e){if(serial===session)host.replaceChildren(muted(e.message));}
}
function refresh(){
  const prior=header.querySelector('[data-save]')?.textContent??'Kaydedildi';
  header.replaceChildren(
    button('‹ Projeler',run(async()=>{await persist();await gallery();})),
    el('strong',{className:'project-title'},p.name),
    el('span',{'data-save':'',className:'save-state'},prior),
    button('Geri al',()=>history(undo,redo),{disabled:!undo.length}),
    button('Yinele',()=>history(redo,undo),{disabled:!redo.length}),
    button('Kaydet',run(async()=>{await persist();flash('Proje kaydedildi.');})),
    button('▶ Test',run(()=>play(p,true)),{className:'primary'}),
  );
  toolbar.replaceChildren(
    ...Object.entries({scene:'Sahne',blocks:'Bloklar',assets:'Assetler',settings:'Ayarlar',output:'Dışa aktar'}).map(([key,name])=>
      button(name,()=>{activePanel=key;refresh();},{'aria-pressed':String(activePanel===key)})),
    button('Tam ekran',()=>{
      const full=viewport.parentElement.classList.toggle('full');
      toolbar.lastChild.textContent=full?'Paneli aç':'Tam ekran';
    }),
  );
  if(viewport.parentElement.classList.contains('full'))toolbar.lastChild.textContent='Paneli aç';
  stage?.configure(selected,tool,space,snap);
  renderPanel();
}
function vector(title,value,changeValue,min,max){
  return el('fieldset',{className:'vectors'},el('legend',{},title),...['X','Y','Z'].map((axis,index)=>label(axis,
    number(value[index],n=>{const v=[...value];v[index]=n;changeValue(v);},min,max))));
}
const assetChoices=kind=>p.assets.filter(a=>a.kind===kind).map(a=>[a.id,a.name]);
function renderScene(){
  const s=level(), o=current(), itemTypes={box:'Küp',sphere:'Küre',capsule:'Kapsül',group:'Grup',light:'Işık'};
  const addObject=kind=>change(()=>{
    const item=makeObject(kind,{position:o?[...o.position]:[0,.5,0]});
    if(o)item.position[0]+=1;
    s.objects.push(item);selected=item.id;
  });
  const hierarchy=el('div',{className:'hierarchy'});
  for(const item of s.objects){
    let depth=0,parent=item.parent;
    while(parent){depth++;parent=s.objects.find(q=>q.id===parent)?.parent;}
    hierarchy.append(button(item.name||item.kind,()=>{selected=item.id;refresh();},
      {'aria-pressed':String(item.id===selected),style:'padding-inline-start:'+Math.min(8,depth)*10+'px'}));
  }
  const modelSelect=dropdown([['','Model ekle'],...assetChoices('model')],'',value=>{
    if(value)change(()=>{const item=makeObject('model',{asset:value,name:p.assets.find(a=>a.id===value).name.slice(0,80)});s.objects.push(item);selected=item.id;});
  });
  panel.append(title('Sahne',metrics),
    row(dropdown(p.scenes.map(q=>[q.id,q.name]),s.id,value=>{levelId=value;selected=null;rebuildStage(false);refresh();}),
      button('+ Sahne',()=>change(()=>{const q=makeScene('Sahne '+(p.scenes.length+1));p.scenes.push(q);levelId=q.id;selected=null;}))),
    row(...Object.entries(itemTypes).map(([kind,name])=>button('+ '+name,()=>addObject(kind)))),
    ...(assetChoices('model').length?[modelSelect]:[]),
    row(options({select:'Seç',translate:'Taşı',rotate:'Döndür',scale:'Ölçek'},tool,value=>{tool=value;refresh();}),
      options({world:'Dünya',local:'Yerel'},space,value=>{space=value;refresh();}),
      label('Izgara',check(snap,value=>{snap=value;refresh();}))),
    row(dropdown([['','Kamera'],['orbit','Orbit'],['top','Üst'],['front','Ön'],['back','Arka'],['side','Yan'],['focus','Odaklan']],'',
      value=>{if(value)stage?.view(value,selected);})),hierarchy);
  if(!o){panel.append(muted('Özellikleri düzenlemek için bir obje seç.'));return;}
  const edit=(key,value,rebuild=true)=>change(()=>{o[key]=value;},rebuild);
  const isDescendant=item=>{
    let parent=item.parent;
    while(parent){if(parent===o.id)return true;parent=s.objects.find(q=>q.id===parent)?.parent;}
    return false;
  };
  panel.append(title('Obje'),
    label('Ad',text(o.name,v=>edit('name',asName(v,o.name),false))),
    row(button('Çoğalt',()=>change(()=>{const copy=clone(o);copy.id=id();copy.name=(copy.name+' Kopya').slice(0,80);copy.position[0]+=1;s.objects.push(copy);selected=copy.id;})),
      button('Sil',run(async()=>{
        if(!await confirmAction(o.name+' silinsin mi?'))return;
        change(()=>{
          s.objects=s.objects.filter(q=>q.id!==o.id);
          for(const q of s.objects)if(q.parent===o.id)q.parent=null;
          s.scripts=s.scripts.filter(q=>q.source!==o.id);
          for(const script of s.scripts)script.steps=script.steps.filter(b=>b.args.target!==o.id);
          if(s.player===o.id)s.player=null;
        });
      }),{className:'danger'})),
    label('Üst obje',dropdown([['','Sahne kökü'],...s.objects.filter(q=>q!==o&&!isDescendant(q)).map(q=>[q.id,q.name])],o.parent,
      value=>change(()=>{o.parent=value||null;if(value){o.body='none';if(s.player===o.id)s.player=null;}}))),
    vector('Konum',o.position,v=>edit('position',v),-10000,10000),
    vector('Dönüş (°)',o.rotation,v=>edit('rotation',v),-36000,36000),
    vector('Ölçek',o.scale,v=>edit('scale',v),.025,500),
    label('Renk',color(o.color,v=>edit('color',v))),label('Emissive',color(o.emissive,v=>edit('emissive',v))),
    label('Metalik',number(o.metalness,v=>edit('metalness',v),0,1)),
    label('Pürüzlülük',number(o.roughness,v=>edit('roughness',v),0,1)),
    label('Opaklık',number(o.opacity,v=>edit('opacity',v),0,1)));
  if(o.kind!=='model')panel.append(label('Doku',dropdown([['','Yok'],...assetChoices('image')],o.texture,v=>edit('texture',v||null))));
  if(o.parent||['group','light'].includes(o.kind))return;
  panel.append(title('Fizik'),label('Gövde',options({none:'Yok',fixed:'Statik',dynamic:'Dinamik',kinematic:'Kinematik',sensor:'Tetikleyici'},o.body,
    v=>change(()=>{o.body=v;if(s.player===o.id&&!['dynamic','kinematic'].includes(v))s.player=null;},false))),
    label('Collider',options({auto:'Otomatik',box:'Kutu',sphere:'Küre',capsule:'Kapsül',...(o.kind==='box'&&o.body!=='dynamic'?{mesh:'Kutu ağı'}:{})},o.collider,v=>edit('collider',v,false))),
    label('Sürtünme',number(o.friction,v=>edit('friction',v,false),0,10)),
    label('Sekme',number(o.restitution,v=>edit('restitution',v,false),0,1)),
    label('Kütle',number(o.mass,v=>edit('mass',v,false),.01,10000)));
  if(['dynamic','kinematic'].includes(o.body))panel.append(label('Oyuncu',check(s.player===o.id,v=>change(()=>{s.player=v?o.id:null;},false))));
}
const fieldNames={target:'Obje',xyz:'X / Y / Z',color:'Renk',text:'Metin',asset:'Ses',amount:'Değer',name:'Değişken',scene:'Sahne'};
function blockField(type,key,value,changeValue){
  if(type==='vector')return vector(fieldNames[key],value,changeValue,-10000,10000);
  const controls={
    object:()=>dropdown([['$self','Olay objesi'],['$other','Diğer obje'],...level().objects.map(o=>[o.id,o.name])],value,changeValue),
    scene:()=>dropdown(p.scenes.map(s=>[s.id,s.name]),value,changeValue),
    audio:()=>dropdown(assetChoices('audio'),value,changeValue),
    color:()=>color(value,changeValue),
    text:()=>text(value,changeValue,300),
    key:()=>text(value,changeValue),
    number:()=>number(value,changeValue,-100000,100000),
  };
  return label(fieldNames[key],controls[type]());
}
function renderBlocks(){
  const s=level();
  panel.append(title('Görsel kod'),button('+ Olay',()=>change(()=>s.scripts.push({id:id(),event:'start',source:null,steps:[]}),false),{className:'primary'}));
  if(!s.scripts.length)panel.append(muted('Bir olay ekle ve çalıştıracağı blokları sırala.'));
  for(const script of s.scripts){
    const card=el('section',{className:'script'},row(
      options(events,script.event,value=>change(()=>{script.event=value;script.source=null;},false)),
      button('Sil',()=>change(()=>{s.scripts=s.scripts.filter(q=>q!==script);},false),{'aria-label':'Olayı sil'})));
    if(['collision','trigger'].includes(script.event))card.append(label('Olay objesi',dropdown([['','Her obje'],...s.objects.map(o=>[o.id,o.name])],
      script.source,value=>change(()=>{script.source=value||null;},false))));
    script.steps.forEach((block,index)=>{
      const [name,fields]=actions[block.op];
      const reorder=destination=>change(()=>{
        script.steps.splice(index,1);script.steps.splice(destination,0,block);
      },false);
      let drag=null;
      const handle=button('↕',()=>{},{
        className:'drag-handle','aria-label':'Bloğu sürükleyerek taşı',
        onpointerdown:e=>{
          if(e.pointerType==='mouse')return;
          e.preventDefault();
          drag={pointer:e.pointerId,y:e.clientY,index};
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onpointermove:e=>{
          if(e.pointerId!==drag?.pointer)return;
          const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.block');
          if(target?.parentElement!==card)return;
          drag.index=Number(target.dataset.index);
          card.querySelector('.drop-block')?.classList.remove('drop-block');
          target.classList.add('drop-block');
        },
        onpointerup:e=>{
          if(e.pointerId!==drag?.pointer)return;
          const destination=drag.index, moved=Math.abs(e.clientY-drag.y)>8;
          drag=null;
          card.querySelector('.drop-block')?.classList.remove('drop-block');
          if(moved&&destination!==index)reorder(destination);
        },
        onlostpointercapture:()=>{
          drag=null;
          card.querySelector('.drop-block')?.classList.remove('drop-block');
        },
      });
      const blockNode=el('div',{className:'block',draggable:'true','data-index':index,
        ondragstart:e=>e.dataTransfer.setData('text/plain',script.id+':'+index),
        ondragover:e=>e.preventDefault(),
        ondrop:e=>{
          e.preventDefault();const [source,n]=e.dataTransfer.getData('text/plain').split(':');
          const from=Number(n);
          if(source!==script.id||!Number.isInteger(from)||from===index||!script.steps[from])return;
          change(()=>{const [moved]=script.steps.splice(from,1);script.steps.splice(index,0,moved);},false);
        }},el('div',{className:'block-heading'},el('strong',{},name),handle),row(
          button('↑',()=>reorder(index-1),{disabled:index===0,'aria-label':'Bloğu yukarı taşı'}),
          button('↓',()=>reorder(index+1),{disabled:index===script.steps.length-1,'aria-label':'Bloğu aşağı taşı'}),
          button('Kopyala',()=>change(()=>script.steps.splice(index+1,0,clone(block)),false)),
          button('Sil',()=>change(()=>script.steps.splice(index,1),false),{'aria-label':'Bloğu sil'})));
      for(const [key,type] of Object.entries(fields))blockNode.append(blockField(type,key,block.args[key],value=>change(()=>{block.args[key]=value;},false)));
      card.append(blockNode);
    });
    card.append(dropdown([['','+ Eylem ekle'],...Object.entries(actions).filter(([key])=>key!=='sound'||assetChoices('audio').length).map(([key,[name]])=>[key,name])],'',op=>{
      if(!op)return;
      const defaults={object:selected??'$self',vector:[0,0,0],color:'#a481ff',text:'',key:'sayi',number:op==='score'?10:op==='wait'?1:0,
        scene:p.start,audio:assetChoices('audio')[0]?.[0]};
      change(()=>script.steps.push({op,args:Object.fromEntries(Object.entries(actions[op][1]).map(([key,type])=>[key,defaults[type]]))}),false);
    }));
    panel.append(card);
  }
}
const formats={glb:['model','model/gltf-binary'],gltf:['model','model/gltf-json'],png:['image','image/png'],jpg:['image','image/jpeg'],
  jpeg:['image','image/jpeg'],webp:['image','image/webp'],mp3:['audio','audio/mpeg'],ogg:['audio','audio/ogg'],wav:['audio','audio/wav']};
function dataUri(file,mime){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error);
    reader.onload=()=>resolve('data:'+mime+reader.result.slice(reader.result.indexOf(';')));
    reader.readAsDataURL(file);
  });
}
function renderAssets(){
  panel.append(title('Assetler'),button('Dosya içe aktar',()=>filePick(Object.keys(formats).map(x=>'.'+x).join(','),async file=>{
    const project=p, format=formats[file.name.split('.').pop().toLowerCase()];
    if(!format||!file.size||file.size>maxBytes*.72)throw new Error('Desteklenmeyen biçim veya fazla büyük dosya.');
    const [kind,mime]=format;
    const a={id:id(),name:file.name.slice(0,140),kind,data:await dataUri(file,mime)};
    if(kind==='model')await inspectModel(a);
    if(project!==p)return;
    change(()=>p.assets.push(a));
  }),{className:'primary'}));
  if(!p.assets.length)panel.append(muted('GLB, gömülü GLTF, PNG, JPEG, WebP, WAV, OGG ve MP3.'));
  for(const a of p.assets){
    const used=p.scenes.some(s=>s.objects.some(o=>o.asset===a.id||o.texture===a.id)||s.scripts.some(script=>script.steps.some(b=>b.args.asset===a.id)));
    const preview=a.kind==='image'?el('img',{src:a.data,alt:a.name,className:'asset-image'}):
      a.kind==='audio'?el('audio',{src:a.data,controls:'',preload:'none'}):null;
    panel.append(el('div',{className:'asset'},preview,label('Ad',text(a.name,v=>change(()=>{a.name=v.trim()||a.name;},false),140)),
      row(el('small',{},used?'Kullanımda':a.kind.toUpperCase()),button('Çoğalt',()=>change(()=>p.assets.push({...a,id:id(),name:(a.name+' Kopya').slice(0,140)}),false)),
        button('Sil',()=>change(()=>{p.assets=p.assets.filter(q=>q!==a);},false),{disabled:used}))));
  }
}
function renderSettings(){
  const s=level(), edit=(key,value,rebuild=true)=>change(()=>{s[key]=value;},rebuild);
  panel.append(title('Oyun ayarları'),label('Sahne adı',text(s.name,v=>edit('name',asName(v,s.name),false))),
    label('Başlangıç sahnesi',dropdown(p.scenes.map(q=>[q.id,q.name]),p.start,value=>change(()=>{p.start=value;},false))),
    label('Grafik kalitesi',options({low:'Düşük',medium:'Orta',high:'Yüksek'},p.quality,value=>change(()=>{p.quality=value;}))),
    label('Arka plan',color(s.background,v=>edit('background',v))),
    label('Sis',number(s.fog,v=>edit('fog',v),0,.25,.005)),
    vector('Yerçekimi',s.gravity,v=>edit('gravity',v,false),-100,100),
    label('Kontrolcü',options({third:'Üçüncü şahıs',first:'Birinci şahıs',top:'Üstten bakış',ball:'Yuvarlanan top',vehicle:'Araç',free:'Serbest kamera'},s.controller,v=>edit('controller',v,false))),
    label('Joystick',check(s.ui.joystick,v=>change(()=>{s.ui.joystick=v;},false))),
    label('Zıplama tuşu',text(s.ui.jump,v=>change(()=>{s.ui.jump=v;},false),24)),
    label('Etkileşim tuşu',text(s.ui.interact,v=>change(()=>{s.ui.interact=v;},false),24)));
  if(p.scenes.length>1)panel.append(button('Sahneyi sil',run(async()=>{
    if(!await confirmAction(s.name+' silinsin mi?'))return;
    change(()=>{
      p.scenes=p.scenes.filter(q=>q!==s);
      if(p.start===s.id)p.start=p.scenes[0].id;
      for(const q of p.scenes)for(const script of q.scripts)script.steps=script.steps.filter(b=>b.op!=='scene'||b.args.scene!==s.id);
      levelId=p.start;selected=null;
    });
  }),{className:'danger'}));
}
function renderPanel(){
  const scroll=panel.scrollTop;
  panel.replaceChildren();
  if(activePanel==='scene')renderScene();
  if(activePanel==='blocks')renderBlocks();
  if(activePanel==='assets')renderAssets();
  if(activePanel==='settings')renderSettings();
  if(activePanel==='output')panel.append(title('Dışa aktar'),
    button('HTML5 oyun ZIP’i',run(()=>downloadGame(p)),{className:'primary'}),
    button('Düzenlenebilir proje ZIP’i',run(()=>downloadProject(p))),
    button('Yerel galeriye yayınla',run(async()=>{await persist();await disk.publish(clone(p));flash('Oyun yerel galeriye eklendi.');})));
  panel.scrollTop=scroll;
}
async function gallery(){
  teardown();p=null;header=null;
  const galleryId=++renderedGallery;
  const games=galleryMode==='games';
  const items=await (games?disk.published():disk.projects());
  if(galleryId!==renderedGallery)return;
  const nav=el('nav',{className:'gallery-nav'},el('strong',{},'VEX'),
    button('Projeler',run(()=>{galleryMode='projects';return gallery();}),{'aria-pressed':String(!games)}),
    button('Yerel oyunlar',run(()=>{galleryMode='games';return gallery();}),{'aria-pressed':String(games)}));
  const grid=el('div',{className:'gallery-grid'});
  const controls=el('div',{className:'gallery-controls'});
  if(!games){
    const select=dropdown(Object.entries(templates),'platform',value=>select.value=value);
    select.setAttribute('aria-label','Şablon');
    controls.append(select,button('Yeni proje',run(async()=>{
      const name=await nameDialog('Yeni proje','Proje oluştur');
      if(name){const q=createTemplate(name.slice(0,80),select.value);await disk.save(q);openEditor(q);}
    }),{className:'primary'}),button('ZIP içe aktar',()=>filePick('.zip',async file=>{
      if(file.size>maxBytes+1024)throw new Error('Proje ZIP dosyası çok büyük.');
      const q=importArchive(new Uint8Array(await file.arrayBuffer()));q.id=id();await disk.save(q);openEditor(q);
    })));
  }
  for(const q of items.sort((a,b)=>a.name.localeCompare(b.name,'tr'))){
    const card=el('article',{className:'project-card'},el('div',{className:'project-image','aria-hidden':'true'},el('i')),
      el('h2',{},q.name),el('p',{},q.scenes.length+' sahne · '+q.scenes.reduce((n,s)=>n+s.objects.length,0)+' obje'));
    if(games)card.append(row(button('Oyna',run(()=>play(q,false)),{className:'primary'}),button('Oyun ZIP',run(()=>downloadGame(q))),
      button('Kaldır',run(async()=>{if(await confirmAction(q.name+' galeriden kaldırılsın mı?')){await disk.unpublish(q.id);await gallery();}}))));
    else card.append(row(button('Aç',()=>openEditor(q),{className:'primary'}),button('Yeniden adlandır',run(async()=>{
      const name=await nameDialog(q.name,'Projeyi yeniden adlandır');
      if(name){await disk.save({...q,name});await gallery();}
    })),button('Çoğalt',run(async()=>{
      await disk.save({...q,id:id(),name:(q.name+' Kopya').slice(0,80)});await gallery();
    })),button('Proje ZIP',run(()=>downloadProject(q))),button('Sil',run(async()=>{
      if(await confirmAction(q.name+' silinsin mi?')){await disk.remove(q.id);await gallery();}
    }),{className:'danger'})));
    grid.append(card);
  }
  if(!items.length)grid.append(muted(games?'Yayınlanan yerel oyunlar burada görünür.':'Boş bir proje veya düzenlenebilir oyun şablonuyla başla.'));
  root.replaceChildren(el('div',{className:'gallery'},nav,el('div',{className:'gallery-body'},el('h1',{},games?'Yerel oyunlar':'VEX Game Engine'),controls,grid)));
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&p)run(persist)();});
run(gallery)();
