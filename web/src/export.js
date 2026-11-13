import {player,gameCss} from 'vex:payload';
import {encode} from './project.js';
import {gameArchive} from './archive.js';

const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
export function standaloneHtml(project){
  const data=new TextDecoder().decode(encode(project)).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'wasm-unsafe-eval\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; connect-src data: blob:; worker-src blob:">'+
    '<title>VEX Game</title><style>'+gameCss+'</style></head><body><main id="game"></main>'+
    '<script type="application/json" id="vex-project">'+data+'</script><script>'+safeScript(player)+'</script></body></html>';
}
export const exportGame=project=>gameArchive(standaloneHtml(project));
