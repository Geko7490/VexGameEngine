export function el(tag,attrs={},...children){
  const node=document.createElement(tag);
  for(const [name,value] of Object.entries(attrs)){
    if(name.startsWith('on')) node.addEventListener(name.slice(2),value);
    else if(name==='className') node.className=value;
    else if(name==='checked'||name==='value'||name==='disabled'||name==='hidden') node[name]=value;
    else node.setAttribute(name,value);
  }
  node.append(...children.filter(x=>x!==null&&x!==undefined));
  return node;
}
export const button=(label,fn,attrs={})=>el('button',{type:'button',onclick:fn,...attrs},label);
