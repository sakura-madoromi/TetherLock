import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const output='artifacts/v3/engineering/browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=n=>{checks.push(n);console.log('PASS',n);};
try {
  await page.goto(process.env.WORKBENCH_URL||'http://127.0.0.1:5173/');await page.waitForSelector('#loading[hidden]',{state:'attached',timeout:45000});
  await page.locator('[data-mode="drawing"]').click();await page.locator('[data-engineering-section="bom"]').click();
  assert.equal(await page.locator('.bom-row').count(),69);assert.match(await page.locator('.bom-summary').textContent(),/216.95/);check('all 69 rows and separate cost groups shown with budget conflict');
  await page.locator('[data-bom-category]').selectOption('print');assert.equal(await page.locator('.bom-row').count(),20);
  await page.locator('[data-bom-category]').selectOption('all');await page.locator('[data-bom-search]').fill('149×82');assert.equal(await page.locator('.bom-row').count(),1);
  await page.locator('#bom-acrylic summary').click();assert.match(await page.locator('#bom-acrylic').textContent(),/轻拧至四耳限位/);check('category and spec search; item acceptance details');
  await page.locator('[data-bom-search]').fill('thread_inserts');await page.locator('[data-bom-quantity]').selectOption('purchaseQuantity');assert.match(await page.locator('#bom-thread_inserts summary').textContent(),/20/);
  await page.locator('[data-bom-quantity]').selectOption('installedQuantity');assert.match(await page.locator('#bom-thread_inserts summary').textContent(),/10/);check('installed versus purchase quantity');
  const pending=page.waitForEvent('download');await page.locator('[data-bom-export="all"]').click();const d=await pending;const stream=await d.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const csv=Buffer.concat(chunks).toString();assert.match(csv,/cadFingerprint/);assert.match(csv,/battery_protection/);assert.match(csv,/screw-M2x6-CS/);await writeFile(output+'/download.csv',csv);check('complete CSV export retains provenance and canonical screw rows');
  const popup=page.waitForEvent('popup');await page.locator('[data-bom-export="paper"]').click();const printed=await popup;await printed.waitForSelector('tbody tr');assert.equal(await printed.locator('tbody tr').count(),69);await printed.close();check('printable complete table with repeated header CSS');
  await page.locator('[data-bom-search]').fill('acrylic');await page.locator('#bom-acrylic summary').click();await page.locator('[data-bom-part="acrylic"]').click();assert.ok(await page.locator('[data-mode="studio"]').evaluate(b=>b.classList.contains('active')));assert.match(await page.locator('#inspector').textContent(),/亚克力/);check('BOM links open associated product part');
  await page.locator('[data-mode="drawing"]').click();await page.locator('[data-bom-search]').fill('');await page.screenshot({path:output+'/desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('BOM usable at 390px without page overflow');
  assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({pass:true,checks,errors},null,2)+'\n');
}catch(e){await writeFile(output+'/results.json',JSON.stringify({pass:false,checks,errors,error:String(e)},null,2));throw e;}
finally{await browser.close();}
