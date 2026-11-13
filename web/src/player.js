import {startGame} from './runtime.js';
const host=document.querySelector('#game');
try{
  const project=JSON.parse(document.querySelector('#vex-project').textContent);
  document.title=project.name;
  startGame(host,project).catch(showError);
}catch(error){showError(error);}
function showError(error){host.textContent='Oyun başlatılamadı. '+error.message;}
