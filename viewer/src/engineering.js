import { BOMPanel } from './bom.js';
import { BlueprintSet } from './blueprint.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { EdgesGeometry } from 'three';
import { saveBlob, drawingPNG, printDrawing } from './exports.js';

export class EngineeringPanel {
  constructor(host,data,callbacks) {
    this.host=host;this.data=data;this.section='blueprints';this.callbacks=callbacks;
    const nav=document.createElement('nav');nav.className='engineering-tabs';
    nav.innerHTML='<button data-engineering-section="blueprints" class="active">工程蓝图集</button><button data-engineering-section="reference">当前视图参考图</button><button data-engineering-section="bom">物料与打印清单</button>';
    host.prepend(nav);
    const bomHost=document.createElement('div');bomHost.id='engineering-bom';bomHost.className='engineering-page';bomHost.hidden=true;host.append(bomHost);
    this.bom=new BOMPanel(bomHost,data,callbacks);
    const blueprintHost=document.createElement('div');blueprintHost.id='engineering-blueprints';blueprintHost.className='engineering-page blueprint-layout';
    blueprintHost.innerHTML='<div class="blueprint-catalog"></div><div class="blueprint-main"><div class="blueprint-actions"><button data-blueprint-export="svg">本页SVG</button><button data-blueprint-export="png">3840px PNG</button><button data-blueprint-export="print">打印 / PDF</button><button data-blueprint-export="zip">整套ZIP</button><button data-blueprint-export="acrylic-svg">亚克力1:1 SVG</button><button data-blueprint-export="acrylic-dxf">亚克力1:1 DXF</button></div><p class="blueprint-status">正在读取当前CAD、制造特征及本地字体…</p><div class="blueprint-paper"></div></div>';
    host.append(blueprintHost);
    blueprintHost.addEventListener('click',e=>{const target=e.target.closest('[data-blueprint-id]'),action=e.target.closest('[data-blueprint-export]');if(target)this.openDrawing(target.dataset.blueprintId);if(action)this.export(action.dataset.blueprintExport);});
    nav.addEventListener('click',e=>{const b=e.target.closest('[data-engineering-section]');if(b)this.show(b.dataset.engineeringSection);});
    this.show('blueprints');
  }
  async load(scene) {
    const meshes=new Map();
    for(const p of scene.parts.values())meshes.set(p.id,{...this.data.productParts.find(v=>v.id===p.id),positions:Array.from(p.geometry.getAttribute('position').array),edges:Array.from(p.edgeGeometry.getAttribute('position').array)});
    const loader=new STLLoader();
    for(const id of this.data.printParts.filter(id=>!meshes.has(id))){
      const file='print/'+id+'.stl',response=await fetch(new URL(file,document.baseURI));if(!response.ok)throw new Error('缺少试块STL：'+id);
      const bytes=await response.arrayBuffer();
      if(crypto.subtle){const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(sha!==this.data.printFileSHA256[file])throw new Error('试块STL与制造数据不同版：'+id);}
      const geometry=loader.parse(bytes),edges=new EdgesGeometry(geometry,30);meshes.set(id,{id,kind:'printed',role:'fixed',positions:Array.from(geometry.getAttribute('position').array),edges:Array.from(edges.getAttribute('position').array)});geometry.dispose();edges.dispose();
    }
    const response=await fetch(new URL('fonts/TLBlueprint.otf',document.baseURI));if(!response.ok)throw new Error('缺少本地允许嵌入的中文字体');
    const bytes=new Uint8Array(await response.arrayBuffer());
    const fontManifest=await (await fetch(new URL('fonts/manifest.json',document.baseURI))).json();
    if(fontManifest.embeddingFsType!==0)throw new Error('字体不允许嵌入');
    if(crypto.subtle){const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(sha!==fontManifest.sha256)throw new Error('字体文件与声明不一致');}
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
    this.font=btoa(binary);this.blueprints=new BlueprintSet(this.data,meshes,this.font);
    this.host.querySelector('.blueprint-catalog').innerHTML=this.blueprints.pages.map(p=>`<button data-blueprint-id="${p.id}"><b>${p.id}</b> ${p.title}</button>`).join('');
    this.openDrawing('D00');
  }
  openDrawing(id) {
    this.show('blueprints');this.drawingId=id;
    const paper=this.host.querySelector('.blueprint-paper'),status=this.host.querySelector('.blueprint-status');
    try{if(!this.blueprints)throw new Error('制造资料尚未载入');this.svg=this.blueprints.render(id);paper.innerHTML=this.svg;status.textContent=`${id} / ${this.data.version} / ${this.data.unresolved.length}个未解决采购项；标准制造状态固定，参照物排除。`;}
    catch(e){this.svg='';paper.textContent=e.message;status.textContent='该图不可导出：'+e.message;}
    this.host.querySelectorAll('[data-blueprint-id]').forEach(b=>b.classList.toggle('active',b.dataset.blueprintId===id));
  }
  async export(kind) {
    if(this.exporting)return;this.exporting=true;
    try{
      if(!this.blueprints)throw new Error('制造资料尚未载入');
      const drawingId=this.drawingId,svg=this.svg;
      if(kind==='zip'){saveBlob(await this.blueprints.archive((i,total,id)=>this.callbacks.notice?.(`蓝图 ${i+1}/${total}：${id}`,0)),'TetherLock-'+this.data.version+'-Blueprints.zip');}
      else if(kind.startsWith('acrylic')){const file=this.blueprints.acrylic()[kind==='acrylic-svg'?'svg':'dxf'];saveBlob(new Blob([file],{type:kind==='acrylic-svg'?'image/svg+xml':'application/dxf'}),`TetherLock-acrylic-1to1.${kind==='acrylic-svg'?'svg':'dxf'}`);}
      else {if(!svg)throw new Error('该图缺少资料，不能导出');if(kind==='print')printDrawing(svg);else if(kind==='png')saveBlob(await drawingPNG(svg),drawingId+'.png');else saveBlob(new Blob([svg],{type:'image/svg+xml'}),drawingId+'.svg');}
      this.callbacks.notice?.('工程资料已生成');
    }catch(e){this.callbacks.notice?.(e.message,6500);}finally{this.exporting=false;}
  }
  show(section) {
    this.section=section;
    for(const selector of ['.drawing-toolbar','.paper-scroll','.drawing-note'])this.host.querySelector(selector).hidden=section!=='reference';
    this.host.querySelector('#engineering-bom').hidden=section!=='bom';
    this.host.querySelector('#engineering-blueprints').hidden=section!=='blueprints';
    this.host.querySelectorAll('[data-engineering-section]').forEach(b=>b.classList.toggle('active',b.dataset.engineeringSection===section));
  }
  openMaterial(id) {this.show('bom');this.bom.focus(id);}
}
