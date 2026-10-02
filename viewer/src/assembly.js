import { defaults, clamp } from './state.js';
import { AssemblyProgress } from './assembly-progress.js';
import { saveBlob, capturePNG } from './exports.js';
import { escapeXML as e } from './drawing.js';

export function pathOffset(animation,progress) {
  if(animation.kind!=='installation')return [0,0,0];
  const frames=animation.keyframes,lengths=frames.slice(1).map((p,i)=>Math.hypot(...p.map((v,j)=>v-frames[i][j]))),total=lengths.reduce((a,b)=>a+b,0);let distance=clamp(progress,0,1)*total;
  for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const t=lengths[i]?distance/lengths[i]:0;return frames[i].map((v,j)=>v+(frames[i+1][j]-v)*t);}distance-=lengths[i];}return [0,0,0];
}
export function printableAssembly(data,font) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>TetherLock 组装指导</title><style>@font-face{font-family:TL;src:url(data:font/otf;base64,${font})}body{font:11pt TL,sans-serif;line-height:1.7}article{break-before:page}article:first-of-type{break-before:auto}@page{size:A4;margin:15mm}h1{font-size:18pt}h2{font-size:15pt}li{break-inside:avoid}code{overflow-wrap:anywhere}footer{font-size:8pt;border-top:1px solid #666;margin-top:10mm}a{color:black}</style></head><body><h1>TetherLock ${e(data.version)} · 组装与维护</h1><p>步骤版本 ${e(data.assembly.version)} / ${e(data.generatedAt)} / CAD ${e(data.cadFingerprint)}</p><p>费用估算¥${data.costs.device}，目标约¥100；未解决：${data.unresolved.map(r=>e(r.id)).join('、')}。人工完成只代表记录；控制固件、强度、寿命、低压与≤15秒仍待实测。</p>${data.assembly.steps.map(s=>`<article><h2>${e(s.id+' '+s.title)}</h2><p>${e(s.purpose)}</p><ol>${s.operations.map(v=>`<li>${e(v)}</li>`).join('')}</ol><p><b>物料：</b>${s.materials.map(r=>e(r.id)+` ×${r.quantity}${e(r.unit)}（${e(r.usage)}）`).join('；')||'复核现有装配，无新增用量'}</p><p><b>工具：</b>${s.tools.map(e).join('、')}</p><p><b>已装集合：</b><code>${s.installedBefore.map(e).join('、')||'尚未装配'}</code></p><p><b>连接：</b>${s.connections.map(e).join('、')||'本步无新增螺钉连接'}；<b>图纸：</b>${s.drawings.map(e).join('、')}</p><p>${e(s.animation.label)}</p><p><b>人工检查：</b></p>${s.checks.map(c=>`<p>□ ${e(c.label)}</p>`).join('')}<p>日期：____________ 操作者：____________ 问题与测量：________________________</p><footer>${e(s.id)} / ${e(data.assembly.version)} / CAD ${e(data.cadFingerprint)}<br>步骤 ${e(data.assemblyFingerprint)} / 生成 ${e(data.generatedAt)}</footer></article>`).join('')}</body></html>`;
}
export class AssemblyGuide {
  constructor(host,data,scene,callbacks,font) {
    this.host=host;this.data=data;this.scene=scene;this.cb=callbacks;this.font=font;this.progress=new AssemblyProgress(data);this.state={...defaults,mode:'assembly',phone:false,card:false,reference:false,grid:false,edges:true,labels:false,travel:0,selected:null};this.playing=false;this.phase=0;this.full=false;
    host.innerHTML='<aside class="assembly-list"><h2>组装指导</h2><p class="assembly-summary"></p><div class="assembly-steps"></div><div class="assembly-record-actions"><button data-assembly-action="export-progress">导出进度JSON</button><button data-assembly-action="import-progress">载入进度JSON</button><button data-assembly-action="reset">重置本版进度</button><button data-assembly-action="print">整套可打印说明</button><input class="assembly-file" type="file" accept=".json,application/json" hidden></div><p class="assembly-storage"></p></aside><div class="assembly-center"><div class="assembly-view-tools"><button data-assembly-action="full">查看完整总装</button><button data-assembly-action="focus">聚焦当前件</button><button data-assembly-action="image">导出本步PNG</button></div><div class="assembly-viewport"></div><p class="assembly-animation-label"></p><div class="assembly-player"><button data-assembly-action="previous">上一步</button><button data-assembly-action="play">播放</button><button data-assembly-action="replay">重播</button><input data-assembly-timeline type="range" min="0" max="1000" value="0" aria-label="组装动画进度"><span class="assembly-percent">0%</span><button data-assembly-action="next">下一步</button></div></div><aside class="assembly-detail"></aside>';
    host.addEventListener('click',event=>{if(this.exporting){this.cb.notice('正在导出本步图片，请稍候');return;}const b=event.target.closest('button');if(!b)return;if(b.dataset.assemblyStep){this.select(b.dataset.assemblyStep);return;}if(b.dataset.assemblyMaterial){this.cb.openMaterial(b.dataset.assemblyMaterial);return;}if(b.dataset.assemblyDrawing){this.cb.openDrawing(b.dataset.assemblyDrawing);return;}if(b.dataset.assemblyAction)this.action(b.dataset.assemblyAction).catch(e=>this.cb.notice(e.message));});
    host.addEventListener('input',event=>{if(this.exporting)return;const t=event.target;if(t.dataset.assemblyCheck){this.progress.check(t.dataset.assemblyCheck,t.checked);this.renderProgress();}if(t.hasAttribute('data-assembly-timeline')){this.playing=false;this.phase=Number(t.value)/1000;this.updateScene();this.renderPlayer();}if(t.hasAttribute('data-assembly-note')){this.progress.record.notes[this.step.id]=t.value;this.progress.save();this.renderProgress();}});
    host.querySelector('.assembly-file').addEventListener('change',async event=>{try{const file=event.target.files[0];if(file){if(file.size>2000000)throw new Error('进度文件过大');this.progress.import(JSON.parse(await file.text()));this.select(this.progress.record.currentStep);this.cb.notice(this.progress.archived?'旧版记录保留；本版检查需重新人工确认':'人工记录已载入');}}catch(e){this.cb.notice(e.message);}finally{event.target.value='';}});
    this.select(this.progress.record.currentStep,false);
  }
  enter() {
    this.previewCamera=this.scene.cameraState();this.previewProjection=this.scene.cb.getState().projection;this.active=true;this.scene.hovered=null;
    this.viewportHome=this.scene.container.parentElement;this.viewportNext=this.scene.container.nextSibling;
    this.host.querySelector('.assembly-viewport').append(this.scene.container);this.scene.container.hidden=false;this.scene.setProjection('perspective');
    this.updateScene();this.scene.resize();if(this.camera)this.scene.restoreCamera(this.camera);else this.scene.preset(this.step.camera);
  }
  leave() {this.playing=false;this.camera=this.scene.cameraState();this.active=false;this.viewportHome.insertBefore(this.scene.container,this.viewportNext);this.scene.setProjection(this.previewProjection||'perspective');this.scene.apply();this.scene.restoreCamera(this.previewCamera);}
  select(id,save=true) {
    const step=this.data.assembly.steps.find(s=>s.id===id);if(!step)throw new Error('步骤不存在：'+id);this.step=step;this.playing=false;this.phase=0;this.full=false;this.camera=null;
    if(save){this.progress.record.currentStep=id;this.progress.save();}
    this.renderDetail();this.renderProgress();this.renderPlayer();this.updateScene();if(this.active)this.scene.preset(step.camera);
  }
  updateScene() {
    const s=this.step,ids=this.data.productParts.map(p=>p.id),visible=new Set(this.full?ids:[...s.installedBefore,...s.parts]);
    // No parts are installed in preparation; show a labeled sample assembly for inspection.
    if(!visible.size)ids.forEach(id=>visible.add(id));
    this.state={...this.state,...s.targetPose,hidden:ids.filter(id=>!visible.has(id)),assemblyHighlights:s.highlight,assemblyInstalled:s.installedBefore,assemblyOffsets:{},assemblyOperation:s.animation.kind==='operation'?this.phase:undefined};
    if(!this.full&&s.animation.kind==='installation')for(const id of s.animation.partIds)this.state.assemblyOffsets[id]={offset:pathOffset(s.animation,this.phase),frame:s.animation.frame};
    if(this.active){this.scene.apply({section:false});this.scene.render();}
  }
  tick(delta) {if(!this.active)return;if(this.playing&&!this.scene.capturing){this.phase=Math.min(1,this.phase+delta/(this.step.animation.duration*1000));this.updateScene();this.renderPlayer();if(this.phase>=1){this.playing=false;this.renderPlayer();}}this.scene.render();}
  renderPlayer() {this.host.querySelector('[data-assembly-timeline]').value=Math.round(this.phase*1000);this.host.querySelector('.assembly-percent').textContent=Math.round(this.phase*100)+'%';this.host.querySelector('[data-assembly-action="play"]').textContent=this.playing?'暂停':'播放';this.host.querySelector('[data-assembly-action="full"]').textContent=this.full?'回到当前步骤':'查看完整总装';this.host.querySelector('.assembly-animation-label').textContent=this.full?'完整总装参考；动画暂停，不代表本步已完成':this.step.animation.label;this.host.querySelectorAll('.assembly-detail ol li').forEach((li,i)=>li.classList.toggle('active-operation',this.step.animation.kind==='operation'&&i===Math.min(this.step.operations.length-1,Math.floor(this.phase*this.step.operations.length))));}
  renderProgress() {
    const r=this.progress.record,steps=this.data.assembly.steps;this.host.querySelector('.assembly-summary').textContent=`${r.completed.length} / ${steps.length} 步人工记录完成 · ${this.data.assembly.version}`;
    this.host.querySelector('.assembly-steps').innerHTML=steps.map(s=>`<button data-assembly-step="${s.id}" class="${s.id===this.step.id?'active':''}"><small>${e(s.chapter)}</small><b>${r.completed.includes(s.id)?'✓':'○'} ${e(s.id)} ${e(s.title)}</b></button>`).join('');
    this.host.querySelector('.assembly-storage').textContent=(this.progress.persistent?'本机自动保存人工记录。':this.progress.message)+(this.progress.archived?` 保留${this.progress.archived}份旧版/重置记录；本版检查需重新确认。`:'')+' 完成状态不代表自动检测实物合格。';
    const complete=this.host.querySelector('[data-assembly-action="complete"]');if(complete){complete.disabled=!this.step.checks.filter(c=>c.required).every(c=>r.checks[c.id]);complete.textContent=r.completed.includes(this.step.id)?'本步已人工记录完成':'人工确认本步完成';}
  }
  renderDetail() {
    const s=this.step,r=this.progress.record,materials=new Map(this.data.materials.map(r=>[r.id,r]));
    this.host.querySelector('.assembly-detail').innerHTML=`<h2>${e(s.id+' '+s.title)}</h2><p>${e(s.purpose)}</p><ol>${s.operations.map(v=>`<li>${e(v)}</li>`).join('')}</ol><h3>物料 / 本步用量</h3>${s.materials.map(r=>`<p><button data-assembly-material="${e(r.id)}">${e(materials.get(r.id).name)} · ${e(r.id)}</button> × ${r.quantity} ${e(r.unit)}<small>${e(r.usage)}${materials.get(r.id).status==='unresolved'?' / 未解决，需核对或适配':''}</small></p>`).join('')||'<p>复核已装件，无新增用量。</p>'}<h3>工具</h3><p>${s.tools.map(id=>`<button data-assembly-material="${e(id)}">${e(materials.get(id).name)}</button>`).join(' · ')}</p><h3>人工检查</h3>${s.checks.map(c=>`<label class="assembly-check"><input type="checkbox" data-assembly-check="${e(c.id)}" ${r.checks[c.id]?'checked':''}>${e(c.label)}</label>`).join('')}<button class="button primary" data-assembly-action="complete">人工确认本步完成</button><label class="assembly-notes">量测 / 问题记录<textarea data-assembly-note rows="4">${e(r.notes[s.id]||'')}</textarea></label><h3>图纸 / 打印</h3><div class="assembly-links">${s.drawings.map(id=>`<button data-assembly-drawing="${id}">${id}</button>`).join('')}${s.printFiles.map(file=>`<a href="${e(file)}" download>STL ${e(file.slice(6,-4))}</a>`).join('')}</div><p class="small">连接：${s.connections.map(e).join('、')||'本步无新增螺钉连接'}；螺钉旋转与热装只作操作说明，不表示真实螺纹运动或扭矩。</p><details><summary>本步之前已安装的零件</summary><p class="small">${s.installedBefore.map(e).join('、')||'尚未装配；画面为清点参考样机'}</p></details><p class="small">CAD ${e(this.data.cadFingerprint)}<br>步骤 ${e(this.data.assemblyFingerprint)} / ${e(this.data.generatedAt)}</p>`;
  }
  async action(kind) {
    if(kind==='previous'||kind==='next'){const steps=this.data.assembly.steps,index=steps.indexOf(this.step),next=steps[index+(kind==='next'?1:-1)];if(next){if(kind==='next'&&!this.progress.record.completed.includes(this.step.id))this.cb.notice('本步检查尚未人工完成，仍允许浏览下一步');this.select(next.id);}return;}
    if(kind==='play'){if(this.full){this.full=false;this.updateScene();}if(this.phase===1)this.phase=0;this.playing=!this.playing;this.renderPlayer();return;}
    if(kind==='replay'){this.phase=0;this.full=false;this.playing=true;this.updateScene();this.scene.preset(this.step.camera);this.renderPlayer();return;}
    if(kind==='full'){this.playing=false;this.full=!this.full;this.updateScene();this.scene.preset(this.step.camera);this.renderPlayer();return;}
    if(kind==='focus'){this.scene.frame(this.step.highlight[0]);return;}
    if(kind==='complete'){this.progress.complete(this.step.id);this.renderProgress();return;}
    if(kind==='reset'){if(confirm('重置本版人工进度？旧记录会保留，检查需要重新确认。')){this.progress.reset();this.select(this.progress.record.currentStep);}return;}
    if(kind==='import-progress'){this.host.querySelector('.assembly-file').click();return;}
    if(kind==='export-progress'){this.progress.save();saveBlob(new Blob([JSON.stringify(this.progress.export(),null,2)],{type:'application/json'}),'TetherLock-assembly-progress.json');return;}
    if(kind==='image'){
      if(this.exporting)return;this.exporting=true;this.playing=false;this.renderPlayer();const step=this.step;
      try{await document.fonts.load('20px TLBlueprint');const png=await capturePNG(this.scene,2560,1440),bitmap=await createImageBitmap(png),canvas=document.createElement('canvas');canvas.width=2560;canvas.height=1530;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();context.fillStyle='white';context.fillRect(0,1440,2560,90);context.fillStyle='#263d45';context.font='20px TLBlueprint,sans-serif';context.fillText(`${step.id} / ${this.data.version} / ${this.data.assembly.version} / ${this.data.generatedAt}`,24,1468);context.fillText('CAD '+this.data.cadFingerprint,24,1497);context.fillText('人工组装记录；动画不代表实物合格',1700,1497);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('本步图片无法生成');saveBlob(blob,`TetherLock-${step.id}-${this.data.version}-${this.data.cadFingerprint.slice(0,12)}.png`);}finally{this.exporting=false;}return;
    }
    if(kind==='print'){const w=window.open('','_blank');if(!w)throw new Error('请允许打印窗口');w.document.write(printableAssembly(this.data,this.font));w.document.close();await w.document.fonts.ready;w.print();}
  }
}
