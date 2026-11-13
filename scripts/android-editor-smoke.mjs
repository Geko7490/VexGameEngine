import assert from 'node:assert/strict';

const endpoint = 'http://127.0.0.1:9222/json/list';
const response = await fetch(endpoint, {signal: AbortSignal.timeout(8000)});
assert.ok(response.ok, 'WebView debugging endpoint was not available.');
const page = (await response.json()).find(tab => tab.url.endsWith('/assets/editor.html'));
assert.ok(page?.webSocketDebuggerUrl, 'Android editor tab was not available.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const requests = new Map();
let sequence = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  requests.get(message.id)?.(message);
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebView debugger did not connect.')), 8000);
    socket.addEventListener('open', () => {clearTimeout(timer);resolve();}, {once:true});
    socket.addEventListener('error', () => {clearTimeout(timer);reject(new Error('WebView debugger connection failed.'));}, {once:true});
  });

  async function inspect(fn, arg) {
    const id = ++sequence;
    const expression = '('+fn.toString()+')('+JSON.stringify(arg ?? null)+')';
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(new Error('WebView did not respond to Runtime.evaluate.'));
      }, 4000);
      requests.set(id, result => {clearTimeout(timer);requests.delete(id);resolve(result);});
      socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
    });
    assert.ok(!message.error && !message.result?.exceptionDetails, JSON.stringify(message));
    return message.result.result.value;
  }

  async function waitFor(fn, arg, description) {
    const stop = Date.now() + 15000;
    let value;
    do {
      value = await inspect(fn,arg);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve,250));
    } while (Date.now() < stop);
    const state = await inspect(() => document.querySelector('#app')?.innerText.slice(0,750));
    assert.fail(description+' did not appear. WebView text: '+state);
  }

  const useButton = (label, click = false) => waitFor(([name, tap]) => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(node => node.textContent.trim() === name && !node.disabled && node.getBoundingClientRect().height > 0);
    if (tap) button?.click();
    return Boolean(button);
  }, [label,click],label);

  await useButton('Örnek oyunu aç', true);
  await useButton('+ Küp');
  const layout = await inspect(() => {
    const viewport = document.querySelector('.viewport').getBoundingClientRect();
    const panel = document.querySelector('.panel').getBoundingClientRect();
    const canvas = document.querySelector('.viewport canvas');
    return {
      viewportHeight: viewport.height,
      panelHeight: panel.height,
      canvasWidth: canvas?.width ?? 0,
      sceneError: document.querySelector('.scene-error')?.textContent,
    };
  });
  assert.ok(layout.viewportHeight > 100 && layout.panelHeight > 120, JSON.stringify(layout));
  assert.ok(layout.canvasWidth > 100, JSON.stringify(layout));
  await useButton('+ Küp', true);
  await useButton('Küp');
  await useButton('Bloklar', true);
  await useButton('+ Olay');
  await useButton('Dışa aktar', true);
  await useButton('HTML5 oyun ZIP’i');
  await useButton('▶ Test', true);
  await waitFor(() => Boolean(document.querySelector('.game-status')?.getBoundingClientRect().height),null,'Playtest status');
  await useButton('Testi durdur', true);
  await useButton('HTML5 oyun ZIP’i');
  console.log('Android offline editor: 3D canvas, scene tools, block editor, export panel and playtest passed.');
} finally {
  socket.close();
}
