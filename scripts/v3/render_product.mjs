import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve(process.argv.find(a => a.startsWith('--output='))?.slice(9) || 'artifacts/v3/product-render');
const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'http://192.168.2.178:4173/';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/tetherlock-browsers/chromium-1243/chrome-linux64/chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const page = await context.newPage();
const failures = [];
page.on('pageerror', e => failures.push(e.message));
await page.goto(url);
await page.waitForSelector('#loading[hidden]', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(700);

async function set(key, value) {
  await page.locator(`[data-setting="${key}"]`).evaluate((el, v) => {
    if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = String(v);
    el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
  }, value);
}
async function style(name = 'studio') { await page.locator('[data-tab="display"]').click(); await page.locator(`[data-style="${name}"]`).click(); }
async function pose(name) { await page.locator('[data-tab="motion"]').click(); await page.locator(`[data-pose="${name}"]`).click(); }
async function camera(name) {
  if (name === 'back') await page.keyboard.press('5');
  else await page.locator(`[data-camera="${name}"]`).first().click();
}
async function hideUi(value) {
  await page.addStyleTag({ content: value ? `
    html,body,#app{width:100vw!important;height:100vh!important;overflow:hidden!important}
    .app-header,.status-bar,.left-panel,.right-panel,.stage-header,.motion-bar,.canvas-toolbar,.stage-spec,.axis-gizmo,.viewport-hint{display:none!important}
    .workspace{display:block!important;width:100vw!important;height:100vh!important}
    .stage{display:flex!important;width:100vw!important;height:100vh!important}
    .viewport{width:100vw!important;height:100vh!important;flex:1!important}
    ` : `
    html,body,#app{width:auto!important;height:auto!important;overflow:initial!important}
    .app-header,.status-bar,.left-panel,.right-panel,.stage-header,.motion-bar,.canvas-toolbar,.stage-spec,.axis-gizmo,.viewport-hint{display:revert!important}
    .workspace{display:grid!important;width:auto!important;height:auto!important}
    .stage{display:flex!important;width:auto!important;height:auto!important}
    .viewport{width:auto!important;height:auto!important}
    ` });
  await page.waitForTimeout(250);
}
async function framePart(id) {
  await page.locator(`[data-part="${id}"]`).click();
  await page.locator('[data-action="focus-selected"]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
async function render(name, setup) {
  await hideUi(false);
  await page.locator('[data-mode="studio"]').click();
  await pose('closed');
  await style('studio');
  await set('opacity', 1); await set('grid', false); await set('edges', false); await set('labels', false);
  await set('clip', false); await set('reference', false); await set('phone', true); await set('card', true);
  await set('projection', 'perspective');
  await setup();
  await page.locator('[data-tab="export"]').click();
  await page.locator('#export-resolution').selectOption('3840,2160');
  await hideUi(true);
  if (!name.includes('detail') && !name.includes('hinge')) {
    await page.mouse.move(960, 540);
    await page.mouse.wheel(0, -750);
  }
  await page.waitForTimeout(900);
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('[data-action="export-png"]').evaluate(el => el.click());
  const file = await download;
  await file.saveAs(path.join(out, `${name}.png`));
  console.log('Rendered', `${name}.png`);
}

const shots = [
  ['01-closed-hero', async () => { await camera('iso'); }],
  ['02-open-with-phone-card', async () => { await pose('open'); await camera('iso'); }],
  ['03-open-top-layout', async () => { await pose('open'); await camera('top'); }],
  ['04-hinge-and-pin', async () => { await pose('open'); await camera('back'); await framePart('hinge_pin'); }],
  ['05-exploded-assembly', async () => { await pose('exploded'); await camera('iso'); }],
  ['06-internal-mechanism-xray', async () => { await style('xray'); await camera('iso'); }],
  ['07-grille-window-detail', async () => { await pose('open'); await camera('iso'); await framePart('window_grille'); }],
  ['08-oled-and-button-detail', async () => { await framePart('oled'); }],
];
for (const [name, setup] of shots) {
  if (process.argv.includes('--resume') && await import('node:fs/promises').then(fs => fs.access(path.join(out, `${name}.png`)).then(() => true).catch(() => false))) continue;
  await render(name, setup);
}

await hideUi(false);
await page.locator('[data-tab="motion"]').click();
await set('speed', 1);
await hideUi(true);
const cycleDownload = page.waitForEvent('download', { timeout: 60000 });
await page.locator('[data-action="record"]').first().evaluate(el => el.click());
await page.waitForFunction(() => document.querySelector('#timeline-percent')?.textContent === '100%', null, { timeout: 120000 });
const cycleFile = await cycleDownload; await cycleFile.saveAs(path.join(out, '09-opening-cycle-1080p.webm'));
console.log('Rendered 09-opening-cycle-1080p.webm');

await page.waitForTimeout(500);
await page.evaluate(() => {
  const canvas = document.querySelector('#viewport canvas');
  const stream = canvas.captureStream(30), tracks = stream.getTracks();
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 18000000 }), chunks = [];
  window.__productVideo = new Promise(resolve => {
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { tracks.forEach(t => t.stop()); resolve(new Blob(chunks, { type: mimeType })); };
  });
  window.__productRecorder = recorder; recorder.start(200);
});
await page.locator('[data-action="open-motion"]').evaluate(el => el.click());
await page.waitForFunction(() => document.querySelector('#timeline-percent')?.textContent === '100%', null, { timeout: 120000 });
await page.locator('[data-action="close-motion"]').evaluate(el => el.click());
await page.waitForFunction(() => document.querySelector('#timeline-percent')?.textContent === '100%', null, { timeout: 120000 });
await page.evaluate(() => window.__productRecorder.stop());
const openCloseDownload = page.waitForEvent('download', { timeout: 60000 });
const openCloseInfo = await page.evaluate(async () => {
  const blob = await window.__productVideo;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '10-open-close-detail-1080p.webm'; a.click();
  return { bytes: blob.size, type: blob.type };
});
const openCloseFile = await openCloseDownload; await openCloseFile.saveAs(path.join(out, '10-open-close-detail-1080p.webm'));
console.log('Rendered 10-open-close-detail-1080p.webm', openCloseInfo);

if (failures.length) throw new Error(`Browser render errors: ${failures.join('; ')}`);
await writeFile(path.join(out, 'render-manifest.json'), JSON.stringify({
  title: 'TetherLock V3 · product showcase', source: new URL(url).origin,
  imageResolution: '3840x2160', videoResolution: '1920x1080', videoFps: 30,
  shots: shots.map(([name]) => `${name}.png`), videos: ['09-opening-cycle-1080p.webm', '10-open-close-detail-1080p.webm'], failures,
}, null, 2) + '\n');
await browser.close();
