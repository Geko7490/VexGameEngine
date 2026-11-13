import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
try {
  const page = browser.contexts().flatMap(context => context.pages())
    .find(tab => tab.url().endsWith('/assets/editor.html'));
  assert.ok(page, 'Android editor tab was not available.');
  page.setDefaultTimeout(12000);

  const visible = label => page.getByRole('button', {name: label, exact: true});
  await visible('Örnek oyunu aç').click();
  await visible('+ Küp').waitFor();
  const layout = await page.evaluate(() => {
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
  await visible('+ Küp').click();
  await visible('Küp').waitFor();
  await visible('Bloklar').click();
  await visible('+ Olay').waitFor();
  await visible('Dışa aktar').click();
  await visible('HTML5 oyun ZIP’i').waitFor();
  await visible('▶ Test').click();
  await page.locator('.game-status').waitFor();
  await visible('Testi durdur').click();
  await visible('HTML5 oyun ZIP’i').waitFor();
  console.log('Android offline editor: 3D canvas, scene tools, block editor, export panel and playtest passed.');
} finally {
  await browser.close();
}
