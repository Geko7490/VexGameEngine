import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';

const files={'editor.html':'text/html','editor.js':'text/javascript','editor.css':'text/css'};
const server=createServer(async(req,res)=>{
  const name=basename(req.url);
  if(!Object.hasOwn(files,name)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':files[name]}).end(await readFile(join('dist',name)));
});
const temporary=await mkdtemp(join(tmpdir(),'vex-smoke-'));
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url='http://127.0.0.1:'+server.address().port+'/editor.html';
  await page.goto(url);
  await page.getByRole('button',{name:'Yeni proje',exact:true}).click();
  await page.getByRole('textbox',{name:'Proje adı'}).fill('Çevrimdışı test');
  await page.getByRole('button',{name:'Onayla'}).click();
  await page.locator('.viewport canvas').waitFor();
  await page.getByRole('button',{name:'+ Küp',exact:true}).click();
  await page.getByRole('button',{name:'Bloklar',exact:true}).click();
  await page.getByRole('button',{name:'+ Olay'}).click();
  await page.locator('.script').last().locator('select').last().selectOption('score');
  await page.getByRole('button',{name:'▶ Test'}).click();
  await page.getByText(/Skor 10/).waitFor({timeout:10000});
  await page.getByRole('button',{name:'Testi durdur'}).click();
  await page.getByRole('button',{name:'Dışa aktar',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'HTML5 oyun ZIP’i'}).click()]);
  const zip=unzipSync(new Uint8Array(await readFile(await download.path())));
  assert.deepEqual(Object.keys(zip),['index.html']);
  const game=join(temporary,'index.html');
  await writeFile(game,zip['index.html']);
  await page.getByRole('button',{name:'Kaydet',exact:true}).click();
  await page.getByText('Proje kaydedildi.',{exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Aç',exact:true}).click();
  await page.getByRole('button',{name:'Küp',exact:true}).waitFor();
  await page.close();

  await context.setOffline(true);
  const standalone=await context.newPage();
  standalone.on('pageerror',error=>errors.push(error.message));
  const requests=[];
  standalone.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await standalone.goto(pathToFileURL(game).href);
  await standalone.getByText(/Skor 10/).waitFor({timeout:10000});
  await standalone.locator('canvas').waitFor();
  assert.deepEqual(requests,[]);
  assert.deepEqual(errors,[]);
  console.log('Mobile viewport editor, persistence, playtest, HTML5 ZIP and offline file launch passed.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  await rm(temporary,{recursive:true,force:true});
}
