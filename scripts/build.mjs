import {build} from 'esbuild';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';

const base={bundle:true,format:'iife',target:['chrome110'],legalComments:'eof',minify:true};
const [gameCss,editorCss,html]=await Promise.all(
  ['web/src/game.css','web/src/editor.css','web/editor.html'].map(file=>readFile(file,'utf8'))
);
const player=(await build({...base,entryPoints:['web/src/player.js'],write:false})).outputFiles[0].text;
const payload={name:'vex-game-payload',setup(builder){
  builder.onResolve({filter:/^vex:payload$/},args=>({path:args.path,namespace:'payload'}));
  builder.onLoad({filter:/.*/,namespace:'payload'},()=>({
    contents:'export const player='+JSON.stringify(player)+';export const gameCss='+JSON.stringify(gameCss)+';',
    loader:'js',
  }));
}};
await mkdir('dist',{recursive:true});
await build({...base,entryPoints:['web/src/editor.js'],outfile:'dist/editor.js',plugins:[payload]});
await Promise.all([writeFile('dist/editor.html',html),writeFile('dist/editor.css',gameCss+'\n'+editorCss)]);
await mkdir('app/build/generated/offlineAssets',{recursive:true});
await cp('dist','app/build/generated/offlineAssets',{recursive:true});
