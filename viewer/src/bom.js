import { saveBlob } from './exports.js';

const labels={print:'正式打印件',purchased:'采购零件',consumables:'装机消耗品',tools:'工具与充电器',coupons:'试块',spares:'备件',services:'外包服务'};
const statuses={nominal:'设计名义值','documentation-checked':'资料已核对','physical-confirmation':'待实测',unresolved:'未解决'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=v=>`¥${Number(v).toFixed(2)}`;
export function filterMaterials(rows,query='',category='all') {
  const q=query.trim().toLocaleLowerCase();
  return rows.filter(r=>(category==='all'||r.category===category)&&(!q||[r.id,r.name,r.specification,r.candidate,r.note,...r.parts].join(' ').toLocaleLowerCase().includes(q)));
}
export function materialsCSV(data,rows=data.materials) {
  const columns=['version','generatedAt','cadFingerprint','dataFingerprint','id','name','category','installedQuantity','purchaseQuantity','unit','specification','candidate','alternatives','parts','connections','mounting','unitPrice','installedSubtotal','packageQuantity','packagePrice','status','source','acceptance','note'];
  const quote=v=>'"'+String(Array.isArray(v)?v.join(' | '):v??'').replace(/"/g,'""')+'"';
  return '\ufeff'+columns.map(quote).join(',')+'\r\n'+rows.map(r=>columns.map(k=>quote(['version','generatedAt','cadFingerprint','dataFingerprint'].includes(k)?data[k]:r[k])).join(',')).join('\r\n')+'\r\n';
}
export function printableMaterials(data) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>TetherLock 物料清单</title><style>@page{size:A3 landscape;margin:12mm}body{font:10pt sans-serif}table{border-collapse:collapse;width:100%}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #666;padding:2mm;vertical-align:top}small{font-size:8pt}h1{font-size:16pt}</style></head><body><h1>TetherLock ${esc(data.version)} · 完整物料、打印、工具及备件清单</h1><p>生成 ${esc(data.generatedAt)} · CAD ${esc(data.cadFingerprint)}<br>费用均为估算；设备 ${price(data.costs.device)}，采购整包 ${price(data.costs.purchase)}，工具/充电器 ${price(data.costs.tools)}。目标约¥100，当前超额需核对低价模块。外包费用待报价。</p><table><thead><tr><th>编号/类别</th><th>名称/规格/候选</th><th>装机/建议采购</th><th>费用</th><th>安装/替代/验收</th><th>状态与来源</th></tr></thead><tbody>${data.materials.map(r=>`<tr><td>${esc(r.id)}<br>${labels[r.category]}</td><td>${esc(r.name)}<br>${esc(r.specification)}<br>${esc(r.candidate)}</td><td>${r.installedQuantity} / ${r.purchaseQuantity} ${esc(r.unit)}</td><td>装机 ${price(r.installedSubtotal)}<br>整包 ${price(r.packagePrice)}</td><td>${esc(r.mounting)}<br>${esc(r.alternatives)}<br>${esc(r.acceptance)}</td><td>${statuses[r.status]}<br>${esc(r.note)}<br><small>${r.source.map(esc).join('<br>')}</small></td></tr>`).join('')}</tbody></table><p>打印首样PETG、0.4mm喷嘴、0.2mm层高；整件主体需至少240×120mm有效平台并额外预留裙边/夹具空间。试块与工具装机数量为0；耗材用量以切片覆盖预算估计。用户完成记录不等于实物自动验收。</p></body></html>`;
}

export class BOMPanel {
  constructor(host,data,{openPart,openDrawing,openStep,notice}={}) {
    this.host=host;this.data=data;this.query='';this.category='all';this.quantity='installedQuantity';
    this.callbacks={openPart,openDrawing,openStep,notice};
    host.innerHTML=`<div class="bom-summary"><div><strong>${price(data.costs.device)}</strong><span>设备装机估算 / 目标约¥100</span></div><div><strong>${price(data.costs.purchase)}</strong><span>零件及消耗品整包支出</span></div><div><strong>${price(data.costs.tools)}</strong><span>工具与充电器 / 已有可复用</span></div></div><p class="engineering-warning">${data.unresolved.length} 项未解决。当前可靠资料候选导致预算超额；设备成本含消耗品估算，外包费待报价。${data.unresolved.map(r=>esc(r.id)).join('、')}需核对或适配；未选定板件不得视为已验证装配。</p><div class="bom-tools"><label>搜索<input data-bom-search placeholder="编号、名称、规格、候选"/></label><label>类别<select data-bom-category><option value="all">全部清单</option>${Object.entries(labels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label>显示数量<select data-bom-quantity><option value="installedQuantity">装机数量</option><option value="purchaseQuantity">建议采购数量</option></select></label></div><div class="bom-exports"><button data-bom-export="all">完整CSV</button><button data-bom-export="purchase">仅采购CSV</button><button data-bom-export="print">打印清单CSV</button><button data-bom-export="paper">可打印表格</button></div><p class="small muted">版本 ${esc(data.version)} · 单位mm · CAD ${esc(data.cadFingerprint.slice(0,16))} · 点击一行展开安装、替代条件、来源与验收。名义制造值与网格包络量测分列。</p><div class="bom-rows"></div>`;
    host.addEventListener('input',e=>{if(e.target.matches('[data-bom-search]')){this.query=e.target.value;this.render();}});
    host.addEventListener('change',e=>{if(e.target.matches('[data-bom-category]'))this.category=e.target.value;else if(e.target.matches('[data-bom-quantity]'))this.quantity=e.target.value;else return;this.render();});
    host.addEventListener('click',e=>{
      const exportButton=e.target.closest('[data-bom-export]');
      if(exportButton){
        const kind=exportButton.dataset.bomExport;
        if(kind==='paper'){const w=window.open('','_blank');if(!w){notice?.('请允许打开打印窗口');return;}w.document.write(printableMaterials(data));w.document.close();setTimeout(()=>w.print(),500);}
        else{const rows=kind==='purchase'?data.materials.filter(r=>['purchased','consumables'].includes(r.category)):kind==='print'?data.materials.filter(r=>r.category==='print'):data.materials;saveBlob(new Blob([materialsCSV(data,rows)],{type:'text/csv;charset=utf-8'}),`TetherLock-${data.version}-${kind}.csv`);}return;
      }
      const part=e.target.closest('[data-bom-part]'),drawing=e.target.closest('[data-bom-drawing]'),step=e.target.closest('[data-bom-step]');
      if(part)openPart?.(part.dataset.bomPart);if(drawing)openDrawing?.(drawing.dataset.bomDrawing);if(step)openStep?.(step.dataset.bomStep);
    });this.render();
  }
  render() {
    const rows=filterMaterials(this.data.materials,this.query,this.category);
    this.host.querySelector('.bom-rows').innerHTML=rows.length?rows.map(r=>{
      const print=this.data.parts.find(p=>p.id===r.id),drawings=this.data.drawingCatalog.filter(d=>d.parts?.some(p=>r.parts.includes(p)));
      return `<details id="bom-${esc(r.id)}" class="bom-row"><summary><code>${esc(r.id)}</code><strong>${esc(r.name)}</strong><span>${r[this.quantity]} ${esc(r.unit)}</span><span class="material-status status-${r.status}">${statuses[r.status]}</span><span>${price(r.installedSubtotal)}</span></summary><div class="bom-detail"><p><b>规格：</b>${esc(r.specification)}</p><p><b>主候选：</b>${esc(r.candidate)}<br><b>替代条件：</b>${esc(r.alternatives)}</p><p><b>装机 / 建议采购：</b>${r.installedQuantity} / ${r.purchaseQuantity} ${esc(r.unit)}；单价 ${price(r.unitPrice)}，装机小计 ${price(r.installedSubtotal)}；整包数量 ${r.packageQuantity}，支出 ${price(r.packagePrice)}</p><p><b>固定：</b>${esc(r.mounting)}<br><b>收货验收：</b>${esc(r.acceptance)}<br><b>待确认：</b>${esc(r.note)}</p><p><b>来源：</b>${r.source.map(s=>s.startsWith('https://')?`<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>`:esc(s)).join(' · ')||'设计名义要求 / 待供货资料'}</p>${print?`<p>STL装配包络量测：${print.measuredSize.join(' × ')} mm；材料 ${esc(print.material)}；${esc(print.orientation)}；${esc(print.support)}。<a href="${print.printFile}" download>打印STL</a></p>`:''}<div class="bom-links">${r.parts.map(id=>`<button data-bom-part="${esc(id)}">零件 ${esc(id)}</button>`).join('')}${drawings.map(d=>`<button data-bom-drawing="${d.id}">图纸 ${d.id}</button>`).join('')}${(r.steps||[]).map(id=>`<button data-bom-step="${id}">步骤 ${id}</button>`).join('')}</div><p class="small">紧固位置：${(r.connections||[]).map(esc).join('、')||'按相关装配图定位'}</p></div></details>`;
    }).join(''):'<p>没有匹配物料。</p>';
  }
  focus(id) {
    this.query='';this.category='all';this.host.querySelector('[data-bom-search]').value='';this.host.querySelector('[data-bom-category]').value='all';this.render();
    const row=this.host.querySelector('#bom-'+CSS.escape(id));if(row){row.open=true;row.scrollIntoView({block:'center',behavior:'smooth'});}
  }
}
