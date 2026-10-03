import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output='generated/v3/references/browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true}),errors=[],external=[],checks=[];
const url=process.env.WORKBENCH_URL||'http://127.0.0.1:5173/';
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(url).origin){external.push(route.request().url());return route.abort();}return route.continue();});
async function download(action) {
  const pending=page.waitForEvent('download');await page.locator(`[data-action="${action}"]`).filter({visible:true}).first().click();
  const d=await pending;const stream=await d.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);
}
const glbJson=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
const nodes=j=>j.nodes.filter(n=>n.name==='reference-phone'||n.name==='reference-card');
const check=n=>{checks.push(n);console.log('PASS',n);};
try {
  await page.goto(url);await page.waitForSelector('#loading[hidden]',{state:'attached',timeout:45000});
  await page.locator('[data-tab="display"]').click();
  assert.equal(await page.locator('[data-setting="phone"]').isChecked(),true);
  assert.equal(await page.locator('[data-setting="card"]').isChecked(),true);
  assert.equal(await page.locator('[data-setting="reference"]').isChecked(),false);
  const m=await page.evaluate(()=>fetch('manifest.json').then(r=>r.json()));
  assert.equal(m.parts.length,44);assert.ok(!m.parts.some(p=>p.id.includes('window_pad')||p.id.includes('reference')));check('independent defaults; references and retired pads excluded from product parts');
  await page.locator('[data-tab="motion"]').click();await page.locator('[data-pose="open"]').click();
  await page.screenshot({path:output+'/open.png'});
  await page.locator('[data-tab="export"]').click();
  const noRefs=glbJson(await download('export-glb'));assert.equal(nodes(noRefs).length,0);check('GLB excludes references by default');
  await page.locator('[data-setting="includeReferences"]').check();
  const first=glbJson(await download('export-glb'));assert.equal(nodes(first).length,2);
  const transforms=nodes(first).map(n=>({name:n.name,matrix:n.matrix,translation:n.translation}));
  await page.locator('[data-tab="motion"]').click();await page.locator('[data-pose="exploded"]').click();
  await page.locator('[data-tab="export"]').click();
  const moved=glbJson(await download('export-glb'));assert.deepEqual(nodes(moved).map(n=>({name:n.name,matrix:n.matrix,translation:n.translation})),transforms);check('references stay fixed during lid opening and explosion');
  await page.locator('[data-tab="display"]').click();await page.locator('[data-setting="phone"]').uncheck();
  await page.locator('[data-tab="export"]').click();
  const cardOnly=glbJson(await download('export-glb'));assert.deepEqual(nodes(cardOnly).map(n=>n.name),['reference-card']);
  const config=JSON.parse(await download('save-settings'));assert.equal(config.state.phone,false);assert.equal(config.state.card,true);check('phone can be hidden independently; fixed card survives; view JSON preserves switches');
  await page.locator('#settings-file').setInputFiles({name:'old-view.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:3,state:{lid:105,travel:0},camera:config.camera}))});
  await page.locator('[data-tab="display"]').click();assert.equal(await page.locator('[data-setting="phone"]').isChecked(),true);assert.equal(await page.locator('[data-setting="card"]').isChecked(),true);check('old configurations use reference defaults');
  await page.locator('[data-tab="export"]').click();await page.locator('#export-resolution').selectOption('2400,2400');
  const on=await download('export-png');await page.locator('[data-tab="display"]').click();await page.locator('[data-setting="phone"]').uncheck();await page.locator('[data-setting="card"]').uncheck();await page.locator('[data-tab="export"]').click();
  const off=await download('export-png');assert.notEqual(createHash('sha256').update(on).digest('hex'),createHash('sha256').update(off).digest('hex'));await writeFile(output+'/with-references.png',on);await writeFile(output+'/without-references.png',off);check('preview PNG reflects current reference visibility');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);check('no runtime errors or external assets');
  await writeFile(output+'/results.json',JSON.stringify({pass:true,checks,errors,external},null,2)+'\n');
} catch(e){await writeFile(output+'/results.json',JSON.stringify({pass:false,checks,errors,error:String(e)},null,2));throw e;}
finally{await browser.close();}
