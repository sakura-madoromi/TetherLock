import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { unzipSync } from 'fflate';
import {PerspectiveCamera,Vector3} from 'three';

const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'generated/v3/purchased-specs/browser');await mkdir(output,{recursive:true});
const source_sha256={};
for(const file of ['tests/workbench/browser.mjs','apps/workbench/public/manifest.json','apps/workbench/public/engineering.json',...(await readdir('apps/workbench/src')).filter(n=>/\.(js|css)$/.test(n)).map(n=>'apps/workbench/src/'+n)])source_sha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/google/chrome/chrome',headless:true,
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)||process.env.WORKBENCH_URL||'http://127.0.0.1:5173/';
const external=[];
await context.route('**/*',route=>{const origin=new URL(route.request().url()).origin;if(origin!==new URL(url).origin){external.push(route.request().url());return route.abort();}return route.continue();});
const check=(name)=>{checks.push(name);console.log('PASS',name);};
async function download(action,name,afterClick){
  const ready=page.waitForEvent('download',{timeout:60000});
  await page.locator(`[data-action="${action}"]`).filter({visible:true}).first().click();
  if(afterClick)await afterClick();
  const file=await ready;await file.saveAs(path.join(output,name));return readFile(path.join(output,name));
}
async function input(key,value){await page.locator(`[data-setting="${key}"]`).filter({visible:true}).first().evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}

try{
  await page.goto(url);await page.waitForSelector('#loading[hidden]',{state:'attached',timeout:45000});
  const manifest=await page.evaluate(()=>fetch(new URL('manifest.json',document.baseURI)).then(r=>r.json())),partCount=manifest.parts.length;
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.part-row').count(),partCount);
  assert.ok((await page.locator('#status').textContent()).startsWith(String(partCount)));check(`all ${partCount} verified CAD meshes loaded`);
  const color=id=>manifest.parts.find(p=>p.id===id)?.color;
  assert.equal(color('lid'),color('base_box'));assert.equal(color('window_grille'),color('base_box'));
  assert.ok(manifest.parts.some(p=>p.id==='window_grille'&&p.role==='lid'&&p.printFile));
  assert.ok(!manifest.parts.some(p=>p.id.startsWith('window_clamp')));check('integral outer grille and removable inner grille share shell color');
  assert.ok(!manifest.parts.some(p=>p.id.startsWith('collar')));
  for(const id of ['hinge_guard_left','hinge_guard_right'])assert.equal(manifest.parts.find(p=>p.id===id).printFile,`print/${id}.stl`);
  assert.equal(manifest.parts.find(p=>p.id==='inserts_lid').role,'lid');
  assert.equal(manifest.parts.filter(p=>p.kind==='fastener').reduce((n,p)=>n+p.quantity,0),33);
  check('printed pin keepers, moving lid inserts and 33 screws replace independent collars');
  await page.screenshot({path:path.join(output,'workbench.png')});
  if(process.argv.includes('--smoke')){assert.deepEqual(errors,[]);}
  else{
    await page.locator('[data-part="bolt"]').click();assert.match(await page.locator('#inspector').textContent(),/实心锁栓/);
    await page.locator('[data-action="isolate"]').click();assert.ok((await page.locator('#visible-count').textContent()).startsWith(`1 / ${partCount}`));
    await page.keyboard.press('Escape');assert.ok((await page.locator('#visible-count').textContent()).startsWith(`${partCount} / ${partCount}`));check('selection, dimensions and isolation');
    await page.locator('[data-pose="open"]').click();assert.equal(await page.locator('[data-output="lid"]').textContent(),'105.0°');
    assert.equal(await page.locator('[data-output="travel"]').textContent(),'0.0 mm');
    await page.screenshot({path:path.join(output,'open.png')});
    await input('travel',14);assert.equal(await page.locator('[data-output="lid"]').textContent(),'0.0°');
    await page.locator('[data-pose="exploded"]').click();assert.equal(await page.locator('[data-output="explode"]').textContent(),'100%');
    await page.screenshot({path:path.join(output,'exploded.png')});
    await page.locator('[data-pose="closed"]').click();check('lid/bolt interlock and exploded view');
    await page.locator('[data-tab="display"]').click();
    await page.locator('[data-style="blueprint"]').click();await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'blueprint.png')});
    await page.locator('[data-style="studio"]').click();
    await page.locator('[data-setting="clip"]').check();await input('clipValue',36);
    await page.screenshot({path:path.join(output,'section.png')});
    await page.locator('[data-setting="clip"]').uncheck();
    await page.locator('[data-setting="projection"]').selectOption('orthographic');
    await page.locator('[data-setting="projection"]').selectOption('perspective');check('materials, clipping and camera projection');
    await page.locator('[data-action="ruler"]').filter({visible:true}).first().click();
    const canvas=page.locator('#viewport canvas'),rect=await canvas.boundingBox();
    await canvas.click({position:{x:rect.width*.46,y:rect.height*.60}});
    await canvas.click({position:{x:rect.width*.59,y:rect.height*.60}});
    await page.waitForSelector('.measure-label',{timeout:5000});
    assert.ok(parseFloat(await page.locator('.measure-label').first().textContent())>0);
    await page.locator('[data-action="clear-measures"]').click();assert.equal(await page.locator('.measure-label').count(),0);
    await page.locator('[data-action="ruler"]').filter({visible:true}).first().click();check('surface-point measurement and clearing');
    await page.locator('[data-mode="drawing"]').click();await page.locator('[data-engineering-section="reference"]').click();await page.waitForSelector('#drawing-paper svg',{timeout:30000});
    assert.match(await page.locator('#drawing-paper').textContent(),/240.0 × 120.0 × 55.0/);
    await page.screenshot({path:path.join(output,'drawing.png')});check('measured A3 drawing from actual geometry');
    await page.locator('[data-tab="export"]').click();
    const svg=await download('export-svg','drawing.svg');assert.ok(svg.toString().includes('width="420mm"'));assert.ok(!svg.toString().includes('<image'));
    const drawing=await download('export-drawing-png','drawing-export.png');assert.equal(drawing.readUInt32BE(16),3840);assert.equal(drawing.readUInt32BE(20),2715);
    check('SVG and 3840px engineering PNG downloads');
    const popupReady=page.waitForEvent('popup');await page.locator('[data-action="print"]').click();const popup=await popupReady;
    await popup.waitForSelector('svg');const pdf=await popup.pdf({preferCSSPageSize:true,printBackground:true});
    assert.equal(pdf.subarray(0,4).toString(),'%PDF');await writeFile(path.join(output,'drawing.pdf'),pdf);await popup.close();check('A3 print window and PDF rendering');
    await page.locator('[data-mode="studio"]').click();
    await page.locator('#transparent').check();const png=await download('export-png','transparent.png');
    assert.equal(png.readUInt32BE(16),2560);assert.equal(png.readUInt32BE(20),1440);check('2K transparent PNG download');
    await page.locator('#transparent').uncheck();
    await page.locator('#export-resolution').selectOption('3840,2160');const large=await download('export-png','preview-4k.png');
    assert.equal(large.readUInt32BE(16),3840);assert.equal(large.readUInt32BE(20),2160);
    await page.locator('#export-resolution').selectOption('2560,1440');check('4K preview PNG download');
    const settings=await download('save-settings','view.json');const parsed=JSON.parse(settings);assert.equal(parsed.version,3);assert.equal(parsed.state.travel,14);
    const glb=await download('export-glb','model.glb');assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(4),2);
    const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
    const root=json.nodes.find(n=>n.name==='TetherLock-V3');
    assert.equal(root.extras.units,'m');
    assert.deepEqual(root.scale||[root.matrix[0],root.matrix[5],root.matrix[10]],[0.001,0.001,0.001]);
    const base=json.nodes.find(n=>n.name==='base_box'),accessor=json.accessors[json.meshes[base.mesh].primitives[0].attributes.POSITION];
    assert.deepEqual(accessor.max.map((n,i)=>(n-accessor.min[i])*.001),[.24,.12,.055]);check('view JSON and binary GLB with measured 0.24m body');
    const zip=await download('export-views','views.zip',async()=>{
      await page.locator('[data-tab="motion"]').click();await input('travel',2);
      assert.equal(await page.locator('[data-output="travel"]').textContent(),'14.0 mm');
    });const contents=unzipSync(zip);assert.equal(Object.keys(contents).filter(k=>k.endsWith('.png')).length,5);
    assert.equal(JSON.parse(new TextDecoder().decode(contents['view.json'])).state.travel,14);check('five-view ZIP freezes pose while exporting');
    await page.locator('[data-tab="motion"]').click();await input('speed',2.5);
    await page.locator('[data-action="bookmark"]').first().click();
    const video=await download('record','motion.webm',async()=>{
      await page.locator('[data-mode="drawing"]').click();
      assert.ok(await page.locator('[data-mode="studio"]').evaluate(el=>el.classList.contains('active')));
      await page.locator('[data-pose="open"]').click();await page.keyboard.press('Space');
      await page.locator('#bookmarks .bookmark-row button').first().click();
    });assert.equal(video.readUInt32BE(0),0x1a45dfa3);assert.ok(video.length>4000);check('WebM cycle completes despite attempted mode/pose/pause changes');
    await page.locator('#settings-file').setInputFiles({name:'invalid-view.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({state:{},camera:{position:[],target:[]}}))});
    await page.waitForTimeout(200);assert.match(await page.locator('#toast').textContent(),/无法载入/);
    await page.locator('[data-tab="export"]').click();const recovered=JSON.parse(await download('save-settings','recovered-view.json'));
    assert.equal(recovered.camera.position.length,3);assert.ok(recovered.camera.position.every(Number.isFinite));check('invalid imported camera leaves a usable scene');
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'mobile.png'),style:'#toast{visibility:hidden}'});
    assert.ok(await page.locator('.mobile-parts').isVisible());await page.locator('[data-action="toggle-parts"]').click();assert.ok(await page.locator('.left-panel').isVisible());
    await page.locator('[data-action="toggle-settings"]').click();assert.ok(await page.locator('.right-panel').isVisible());
    const mobileConfig=JSON.parse(await download('save-settings','mobile-view.json'));
    const mobileRect=await page.locator('#viewport canvas').boundingBox();
    const mobileCamera=new PerspectiveCamera(34,mobileRect.width/mobileRect.height,.2,3500);
    mobileCamera.up.set(0,0,1);mobileCamera.position.fromArray(mobileConfig.camera.position);
    mobileCamera.lookAt(new Vector3(...mobileConfig.camera.target));mobileCamera.updateMatrixWorld();
    for(const x of [-120,120])for(const y of [-60,60])for(const z of [0,55]){
      const p=new Vector3(x,y,z).project(mobileCamera);assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,'whole assembly stays framed on mobile');
    }
    const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(horizontalOverflow,false);check('390px responsive part/settings panels without page overflow');
    assert.deepEqual(errors,[]);check('no browser runtime errors');
  }
  assert.deepEqual(external,[]);check('all assets served locally without external requests');
  await writeFile(path.join(output,'browser-results.json'),JSON.stringify({url,checks,errors,source_sha256,pass:true},null,2)+'\n');
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'browser-results.json'),JSON.stringify({url,checks,errors,source_sha256,pass:false,error:String(error)},null,2));throw error;}
finally{await browser.close();}
