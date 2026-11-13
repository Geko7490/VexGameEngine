export const maxBytes = 8 * 1024 * 1024;
export const id = () => globalThis.crypto?.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
export const clone = x => JSON.parse(JSON.stringify(x));
export const events = { start:'Oyun başladığında', step:'Her fizik adımında', tap:'Sahneye dokunulduğunda', jump:'Zıpla tuşuna basıldığında', interact:'Etkileşim tuşuna basıldığında', collision:'Çarpışma başladığında', trigger:'Tetikleyiciye girildiğinde' };
export const actions = {
  move:['Taşı',{target:'object', xyz:'vector'}], position:['Konuma git',{target:'object', xyz:'vector'}],
  rotate:['Döndür (derece)',{target:'object', xyz:'vector'}], velocity:['Hız belirle',{target:'object', xyz:'vector'}],
  impulse:['İtme uygula',{target:'object', xyz:'vector'}], hide:['Gizle',{target:'object'}], show:['Göster',{target:'object'}],
  destroy:['Yok et',{target:'object'}], tint:['Rengi değiştir',{target:'object', color:'color'}],
  animate:['Animasyonu oynat',{target:'object', text:'text'}], sound:['Ses çal',{asset:'audio'}],
  gravity:['Yerçekimini ayarla',{xyz:'vector'}], score:['Skor ekle',{amount:'number'}], health:['Can değiştir',{amount:'number'}],
  text:['Mesaj göster',{text:'text'}], set:['Sayı değişkeni ata',{name:'key', amount:'number'}],
  add:['Sayı değişkeni artır',{name:'key', amount:'number'}],
  branch:['Değişken eşik üzerindeyse sonraki bloğu çalıştır',{name:'key', amount:'number'}],
  wait:['Bekle (saniye)',{amount:'number'}], scene:['Sahneye geç',{scene:'scene'}],
  save:['Oyun durumunu kaydet',{}], load:['Oyun durumunu yükle',{}],
  finish:['Oyunu bitir',{text:'text'}], restart:['Sahneyi yeniden başlat',{}],
};
export function makeObject(kind='box', props={}) {
  return {id:id(), name:{box:'Küp',sphere:'Küre',capsule:'Kapsül',group:'Grup',model:'Model',light:'Işık'}[kind],
    kind, parent:null, position:[0,.5,0], rotation:[0,0,0], scale:[1,1,1], color:'#a481ff',
    emissive:'#000000', metalness:0, roughness:.65, opacity:1, body:'none', collider:'auto',
    friction:.65, restitution:0, mass:1, asset:null, texture:null, ...props};
}
export const makeScene = (name='Sahne 1') => ({id:id(),name,objects:[],scripts:[],player:null,controller:'third',
  background:'#202742',fog:0,gravity:[0,-18,0],ui:{jump:'Zıpla',interact:'',joystick:true}});
export function makeProject(name) {
  const first=makeScene();
  return {id:id(),version:1,name,quality:'medium',start:first.id,scenes:[first],assets:[]};
}
const ensure=(ok, why)=>{if(!ok) throw new Error(why);};
const key=x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(x) && !['__proto__','prototype','constructor'].includes(x);
const str=(x,max=80)=>typeof x==='string' && x.length<=max;
const num=(x,min,max)=>typeof x==='number' && x>=min && x<=max;
const vec=(x,min,max)=>Array.isArray(x) && x.length===3 && x.every(v=>num(v,min,max));
const color=x=>typeof x==='string' && /^#[\da-f]{6}$/i.test(x);
const list=(x,max)=>Array.isArray(x) && x.length<=max;
function index(items) {
  const entries=new Map();
  for(const item of items){
    ensure(item && key(item.id) && !entries.has(item.id),'Geçersiz veya yinelenen kimlik.');
    entries.set(item.id,item);
  }
  return entries;
}
export function validate(project) {
  ensure(project?.version===1 && key(project.id) && str(project.name) && project.name.trim() &&
    list(project.assets,100) && list(project.scenes,24) && project.scenes.length &&
    ['low','medium','high'].includes(project.quality),'Geçersiz proje.');
  const assets=index(project.assets), scenes=index(project.scenes);
  for(const a of assets.values()){
    const type = a.kind==='model' ? 'model/gltf-(binary|json)' : a.kind==='image' ? 'image/(png|jpeg|webp)' : a.kind==='audio' ? 'audio/(wav|ogg|mpeg)' : null;
    ensure(type && str(a.name,140) && str(a.data,maxBytes) && new RegExp('^data:'+type+';base64,').test(a.data) && /^[A-Za-z0-9+/]+={0,2}$/.test(a.data.slice(a.data.indexOf(',')+1)),'Geçersiz asset.');
  }
  ensure(scenes.has(project.start),'Başlangıç sahnesi eksik.');
  for(const s of scenes.values()){
    ensure(str(s.name) && color(s.background) && num(s.fog,0,.25) && vec(s.gravity,-100,100) &&
      list(s.objects,750) && list(s.scripts,150) && ['third','first','top','ball','vehicle','free'].includes(s.controller) &&
      str(s.ui?.jump,24) && str(s.ui?.interact,24) && typeof s.ui?.joystick==='boolean','Geçersiz sahne.');
    const objects=index(s.objects);
    for(const o of objects.values()){
      ensure(str(o.name) && ['box','sphere','capsule','group','model','light'].includes(o.kind) &&
        vec(o.position,-10000,10000) && vec(o.rotation,-36000,36000) && vec(o.scale,.025,500) && color(o.color) && color(o.emissive) &&
        num(o.roughness,0,1) && num(o.metalness,0,1) && num(o.opacity,0,1) &&
        ['none','fixed','dynamic','kinematic','sensor'].includes(o.body) && ['auto','box','sphere','capsule','mesh'].includes(o.collider) &&
        num(o.friction,0,10) && num(o.restitution,0,1) && num(o.mass,.01,10000) &&
        (o.asset===null || assets.get(o.asset)?.kind==='model') && (o.texture===null || assets.get(o.texture)?.kind==='image'),'Geçersiz obje.');
      const seen=new Set([o.id]);
      let parent=o.parent;
      while(parent!==null){
        ensure(objects.has(parent) && !seen.has(parent) && o.body==='none','Geçersiz üst obje ilişkisi.');
        seen.add(parent);
        parent=objects.get(parent).parent;
      }
    }
    ensure(s.player===null || ['dynamic','kinematic'].includes(objects.get(s.player)?.body),'Oyuncuya fizik gövdesi gerekli.');
    for(const script of index(s.scripts).values()){
      ensure(Object.hasOwn(events,script.event) && (script.source===null ||
        (['collision','trigger'].includes(script.event) && objects.has(script.source))) && list(script.steps,120),'Geçersiz olay bloğu.');
      for(const b of script.steps){
        ensure(b && Object.hasOwn(actions,b.op) && b.args,'Bilinmeyen eylem bloğu.');
        for(const [k,t] of Object.entries(actions[b.op][1])){
          const x=b.args[k];
          const validators={object:()=>['$self','$other'].includes(x)||objects.has(x),scene:()=>scenes.has(x),audio:()=>assets.get(x)?.kind==='audio',
            color:()=>color(x),key:()=>key(x),text:()=>str(x,300),number:()=>num(x,-100000,100000),vector:()=>vec(x,-10000,10000)};
          ensure(validators[t](),actions[b.op][0]+' bloğunda geçersiz giriş.');
        }
      }
    }
  }
  return project;
}
export function encode(project){
  validate(project);
  const bytes=new TextEncoder().encode(JSON.stringify(project));
  ensure(bytes.length<=maxBytes,'Proje 8 MB sınırını aşıyor.');
  return bytes;
}
export function decode(bytes){
  ensure(bytes.length<=maxBytes,'Proje 8 MB sınırını aşıyor.');
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
