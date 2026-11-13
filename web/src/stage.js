import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const rad=Math.PI/180;
export function applyTransform(root,o){
  root.position.fromArray(o.position);
  root.rotation.set(...o.rotation.map(x=>x*rad));
  root.scale.fromArray(o.scale);
}
function assetManager(){
  const manager=new T.LoadingManager();
  manager.setURLModifier(url=>{
    if(!/^(data:|blob:)/i.test(url)) throw new Error('GLTF dosyası bütün kaynaklarını kendi içinde taşımalı.');
    return url;
  });
  return manager;
}
export async function inspectModel(asset){
  const encoded=asset.data.slice(asset.data.indexOf(',')+1);
  const binary=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
  let json;
  if(asset.data.startsWith('data:model/gltf-binary')){
    const header=new DataView(binary.buffer);
    if(binary.length<20 || header.getUint32(0,true)!==0x46546c67 || header.getUint32(4,true)!==2 ||
        header.getUint32(8,true)!==binary.length || header.getUint32(16,true)!==0x4e4f534a) throw new Error('Geçersiz GLB.');
    const size=header.getUint32(12,true);
    if(size>binary.length-20) throw new Error('Geçersiz GLB JSON bölümü.');
    json=JSON.parse(new TextDecoder().decode(binary.subarray(20,20+size)));
  }else json=JSON.parse(new TextDecoder().decode(binary));
  for(const entry of [...(json.buffers??[]),...(json.images??[])]){
    if(entry.uri!==undefined && (typeof entry.uri!=='string' || !entry.uri.startsWith('data:'))) throw new Error('Modeli gömülü kaynaklarla GLB veya GLTF olarak dışa aktarın.');
  }
  return binary.buffer;
}
function disposeRoot(root){
  const textures=new Set(), materials=new Set(), geometries=new Set(), skeletons=new Set();
  root.traverse(n=>{
    if(n.geometry) geometries.add(n.geometry);
    if(n.skeleton) skeletons.add(n.skeleton);
    for(const material of n.material ? [n.material].flat() : []){
      materials.add(material);
      for(const value of Object.values(material)) if(value?.isTexture) textures.add(value);
    }
    n.shadow?.dispose();
  });
  for(const set of [geometries,materials,textures,skeletons]) for(const item of set) item.dispose();
}
export class Stage {
  constructor(host,project,level,{editor=false,assetError=()=>{}}={}){
    this.host=host;
    this.world=new T.Scene();
    this.world.background=new T.Color(level.background);
    if(level.fog) this.world.fog=new T.FogExp2(level.background,level.fog);
    this.camera=new T.PerspectiveCamera(55,1,.08,800);
    this.camera.position.set(8,6,10);
    this.renderer=new T.WebGLRenderer({antialias:project.quality!=='low',powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, {low:1,medium:1.5,high:2}[project.quality]));
    this.renderer.shadowMap.enabled=project.quality==='high';
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    host.append(this.renderer.domElement);
    this.world.add(new T.HemisphereLight(0xe3ecff,0x605177,2.1));
    const sun=new T.DirectionalLight(0xffe7cb,2.25);
    sun.position.set(8,13,6);
    sun.castShadow=project.quality==='high';
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18});
    this.world.add(sun);
    if(editor) this.world.add(new T.GridHelper(100,100,0x7972a2,0x3d405b));
    this.entries=new Map();
    this.assets=new Map(project.assets.map(a=>[a.id,a]));
    this.assetError=assetError;
    this.loader=new GLTFLoader(assetManager());
    this.textureLoader=new T.TextureLoader(assetManager());
    for(const o of level.objects) this.add(o,editor);
    for(const o of level.objects) if(o.parent) this.entries.get(o.parent).root.add(this.entries.get(o.id).root);
    this.resize=new ResizeObserver(()=>this.fit());
    this.resize.observe(host);
    this.fit();
  }

  add(o,editor){
    const root=new T.Group();
    root.userData.object=o.id;
    const entry={root,o,mixer:null,clips:[],disposed:false};
    applyTransform(root,o);
    this.world.add(root);
    this.entries.set(o.id,entry);
    if(o.kind==='group') return;
    if(o.kind==='light'){
      root.add(new T.PointLight(o.color,35,18));
      if(!editor) return;
    }
    const geometry=o.kind==='sphere'?new T.SphereGeometry(.5,20,14):
      o.kind==='capsule'?new T.CapsuleGeometry(.36,.28,6,12):new T.BoxGeometry(1,1,1);
    const material=new T.MeshStandardMaterial({color:o.color,emissive:o.emissive,metalness:o.metalness,
      roughness:o.roughness,opacity:o.opacity,transparent:o.opacity<1});
    const mesh=new T.Mesh(geometry,material);
    mesh.castShadow=mesh.receiveShadow=true;
    root.add(mesh);
    if(o.texture){
      const texture=this.textureLoader.load(this.assets.get(o.texture).data,undefined,undefined,()=>this.assetError(o.name));
      texture.colorSpace=T.SRGBColorSpace;
      material.map=texture;
    }
    if(o.kind==='model'&&o.asset){
      inspectModel(this.assets.get(o.asset)).then(bytes=>this.loader.parseAsync(bytes,'')).then(gltf=>{
        if(entry.disposed){disposeRoot(gltf.scene);return;}
        root.remove(mesh);
        disposeRoot(mesh);
        gltf.scene.traverse(n=>{if(n.isMesh) n.castShadow=n.receiveShadow=true;});
        root.add(gltf.scene);
        entry.clips=gltf.animations;
        entry.mixer=new T.AnimationMixer(gltf.scene);
        if(!editor && entry.clips.length) entry.mixer.clipAction(entry.clips[0]).play();
      }).catch(()=>{if(!entry.disposed) this.assetError(o.name);});
    }
  }
  play(id,name){
    const e=this.entries.get(id), clip=e?.clips.find(c=>c.name===name)??(!name?e?.clips[0]:null);
    if(clip){e.mixer.stopAllAction();e.mixer.clipAction(clip).reset().play();}
  }
  remove(id){
    const entry=this.entries.get(id);
    if(!entry) return;
    for(const child of Array.from(entry.root.children)){
      if(child.userData.object) this.remove(child.userData.object);
    }
    entry.disposed=true;
    entry.mixer?.stopAllAction();
    disposeRoot(entry.root);
    entry.root.removeFromParent();
    this.entries.delete(id);
  }
  fit(){
    const w=this.host.clientWidth,h=this.host.clientHeight;
    if(!w||!h) return;
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }
  render(dt=0){
    if(dt) for(const e of this.entries.values()) e.mixer?.update(dt);
    this.renderer.render(this.world,this.camera);
  }
  dispose(){
    this.resize.disconnect();
    for(const id of this.entries.keys()) this.remove(id);
    disposeRoot(this.world);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
