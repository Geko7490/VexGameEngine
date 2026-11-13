import {zipSync} from 'fflate';
import {decode,encode,maxBytes} from './project.js';

export const projectArchive=project=>zipSync({'project.json':encode(project)},{level:0});

// This version accepts the single, stored entry emitted by the project exporter.
// The archive is never extracted to the filesystem.
export function importArchive(bytes){
  const fail=()=>{throw new Error('Geçersiz VEX proje ZIP dosyası.');};
  if(bytes.length<122||bytes.length>maxBytes+1024)fail();
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=n=>v.getUint16(n,true),u32=n=>v.getUint32(n,true);
  const end=bytes.length-22;
  if(u32(end)!==0x06054b50||u32(end+4)!==0||u16(end+8)!==1||u16(end+10)!==1||u16(end+20)!==0)fail();
  const at=u32(end+16), length=u32(end+12);
  if(length!==58||at+length!==end||at<42||u32(at)!==0x02014b50||u32(at+42)!==0||
     u16(at+8)!==0||u16(at+10)!==0||u16(at+28)!==12||u32(at+30)!==0||u16(at+34)!==0)fail();
  const size=u32(at+24), crc=u32(at+16);
  if(size>maxBytes||at!==42+size||u32(at+20)!==size||u32(0)!==0x04034b50||u16(6)!==0||u16(8)!==0||
     u32(14)!==crc||u32(18)!==size||u32(22)!==size||u16(26)!==12||u16(28)!==0)fail();
  const decoder=new TextDecoder();
  if(decoder.decode(bytes.subarray(30,42))!=='project.json'||decoder.decode(bytes.subarray(at+46,at+58))!=='project.json')fail();
  const data=bytes.subarray(42,at);
  let sum=0xffffffff;
  for(const byte of data){
    sum^=byte;
    for(let bit=0;bit<8;bit++)sum=(sum>>>1)^((sum&1)?0xedb88320:0);
  }
  if(((sum^0xffffffff)>>>0)!==crc)fail();
  return decode(data);
}
export const gameArchive=html=>zipSync({'index.html':new TextEncoder().encode(html)},{level:6});
