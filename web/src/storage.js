import {encode} from './project.js';

const database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('vex-engine',1);
  request.onupgradeneeded=()=>{
    request.result.createObjectStore('projects',{keyPath:'id'});
    request.result.createObjectStore('published',{keyPath:'id'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
async function transaction(store,mode,operation){
  const db=await database;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode);
    const req=operation(tx.objectStore(store));
    tx.oncomplete=()=>resolve(req.result);
    tx.onabort=()=>reject(tx.error??new Error('Yerel kayıt işlemi tamamlanamadı.'));
  });
}
export const projects=()=>transaction('projects','readonly',s=>s.getAll());
export function save(project){
  encode(project);
  return transaction('projects','readwrite',s=>s.put(project));
}
export const remove=id=>transaction('projects','readwrite',s=>s.delete(id));
export const published=()=>transaction('published','readonly',s=>s.getAll());
export function publish(project){
  encode(project);
  return transaction('published','readwrite',s=>s.put(project));
}
export const unpublish=id=>transaction('published','readwrite',s=>s.delete(id));
export function download(bytes,name){
  if(window.VexFiles){
    // Convert in bounded chunks to avoid argument-count limits.
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    window.VexFiles.postMessage(JSON.stringify({name,base64:btoa(binary)}));
    return;
  }
  const href=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
  const link=Object.assign(document.createElement('a'),{href,download:name});
  link.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
