import { projectView, measureExtent, escapeXML as e } from './drawing.js';
import { transformPoint } from './state.js';
import { sliceMesh, sectionPath } from './sections.js';
import { materialsCSV } from './bom.js';
import { printableAssembly } from './assembly.js';
import { zipSync, strToU8 } from 'fflate';

const number=n=>Number(n).toFixed(2).replace(/\.00$/,'');
const statusNames={nominal:'设计名义值','documentation-checked':'资料已核对','physical-confirmation':'待实测',unresolved:'未解决'};
const kindNames={pilot:'打印螺钉预孔',clearance:'通孔/让位切除',insert:'铜螺母预孔',countersink:'沉头切除',box:'方体设计特征'};

export function wrapText(value,width,font=2.5) {
  const result=[];
  for(const paragraph of String(value??'').split('\n')){
    let line='',used=0;
    for(const c of paragraph){const advance=font*(c.charCodeAt(0)>255?1.05:/[MW@]/.test(c)?.95:.62);if(used+advance>width&&line){result.push(line);line='';used=0;}line+=c;used+=advance;}
    result.push(line);
  }
  return result;
}
class Paper {
  constructor(page,data,font,total,index) {
    this.page=page;this.data=data;this.font=font;this.total=total;this.index=index;this.scaleLabel='按各视图标注';this.items=[];
  }
  text(x,y,value,size=3,anchor='start') {this.items.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${e(value)}</text>`);}
  lines(x,y,value,width,size=2.7,leading=4) {const lines=wrapText(value,width,size);for(const [i,line] of lines.entries())this.text(x,y+i*leading,line,size);return lines.length*leading;}
  line(x,y,a,b,attrs='') {this.items.push(`<path d="M${x},${y}L${a},${b}" fill="none" stroke="#111" stroke-width=".2" ${attrs}/>`);}
  dimension(x,y,a,b,label) {
    this.line(x,y,a,b);const dx=a-x,dy=b-y,len=Math.hypot(dx,dy)||1,nx=-dy/len*1.2,ny=dx/len*1.2;
    for(const [px,py] of [[x,y],[a,b]])this.line(px-nx,py-ny,px+nx,py+ny);
    this.text((x+a)/2,(y+b)/2-2,label,2.7,'middle');
  }
  arrow(x,y,a,b,label) {this.line(x,y,a,b,'marker-end="url(#arrow)"');this.text((x+a)/2,(y+b)/2-2,label,2.8,'middle');}
  table(headers,widths,rows,y=45,font=2.5) {
    let x=12;const leading=font*1.45;
    headers.forEach((h,i)=>{this.text(x+2,y+5,h,font);x+=widths[i];});this.line(12,y,408,y);this.line(12,y+8,408,y+8);y+=8;
    for(const row of rows){
      const cells=row.map((c,i)=>wrapText(c,widths[i]-4,font)),height=Math.max(...cells.map(c=>c.length))*leading+4;
      if(y+height>263)throw new Error(`${this.page.id} 表格行超出纸张，请分页`);
      x=12;cells.forEach((cell,i)=>{cell.forEach((s,k)=>this.text(x+2,y+3.5+k*leading,s,font));this.line(x,y,x,y+height);x+=widths[i];});this.line(x,y,x,y+height);y+=height;this.line(12,y,408,y);
    }
    return y;
  }
  finish(metadata={}) {
    const d=this.data,p=this.page;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"><metadata>${e(JSON.stringify({version:d.version,generatedAt:d.generatedAt,cadFingerprint:d.cadFingerprint,dataFingerprint:d.dataFingerprint,id:p.id,units:'mm',page:this.index+1,total:this.total,...metadata}))}</metadata><defs><style>@font-face{font-family:TLBlueprint;src:url(data:font/otf;base64,${this.font}) format('opentype')}text{font-family:TLBlueprint,sans-serif;fill:#111}</style><marker id="arrow" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><path d="M0,0L5,2.5L0,5" fill="none" stroke="#111" stroke-width=".6"/></marker><pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V2" stroke="#111" stroke-width=".15"/></pattern></defs><rect width="420" height="297" fill="white"/><rect x="7" y="7" width="406" height="283" fill="none" stroke="#111" stroke-width=".3"/><text x="13" y="19" font-size="5">${e(p.id+' · '+p.title)}</text><text x="13" y="27" font-size="2.6">固定工程资料 / ＋Y为前，Z向上；俯视右为−X、下为＋Y，前视从＋Y观察；接口以CAD名义坐标为准。</text><text x="13" y="34" font-size="2.5">结构名义图；候选模块与待实测项保持可见。未通过实物强度、寿命、到位检测及≤15秒验收。</text>${this.items.join('')}<path d="M7,269H413M276,269V290M346,269V290" fill="none" stroke="#111" stroke-width=".25"/><text x="13" y="276" font-size="2.6">CAD ${e(d.cadFingerprint)}</text><text x="13" y="282" font-size="2.4">版本 ${e(d.version)} / 生成 ${e(d.generatedAt)} / 数据 ${e(d.dataFingerprint.slice(0,16))}</text><text x="13" y="287" font-size="2.2">名义尺寸≠首件保证公差；PETG、0.4mm喷嘴、0.2mm层高为起点；模块处按待测说明验收。</text><text x="280" y="276" font-size="2.6">单位 mm / A3 420×297</text><text x="280" y="283" font-size="2.5">比例 ${e(this.scaleLabel)}</text><text x="350" y="276" font-size="2.8">${e(p.id)} / ${this.index+1} / ${this.total}</text><text x="350" y="283" font-size="2.3">${e(p.material||'打印PETG；金属/板件见BOM')}</text></svg>`;
  }
}
function paginate(headers,widths,rows,{font=2.5,available=210}={}) {
  const pages=[];let page=[],used=0;
  for(const row of rows){const height=Math.max(...row.map((c,i)=>wrapText(c,widths[i]-4,font).length))*font*1.45+4;if(height>available)throw new Error('资料单行过长，无法完整分页');if(page.length&&used+height>available){pages.push(page);page=[];used=0;}page.push(row);used+=height;}
  if(page.length)pages.push(page);return pages;
}
const excludeCover=['lid','window_grille','acrylic','inserts_lid','fasteners_lid','latch','latch_retainer'];
const groups={
 A04:['lid','window_grille','acrylic','inserts_lid','fasteners_lid'],
 A05:['base_box','lid','hinge_pin','hinge_guard_left','hinge_guard_right','inserts_fixed','fasteners_fixed'],
 A06:['lock_base','guide_cap','motor_clamp','motor','drive_nut','nut_carriage','nut_cap','bolt','latch','latch_retainer'],
 A07:['base_box','battery_hatch','battery_holder','battery_connector','inserts_fixed'],
 A08:['electronics_tray','esp','power_board','esp_clip','upper_deck','bridge_board','upper_clip','oled','oled_bridge','button','board_pads'],
 C01:['fit_bar','fit_gauge','hinge_bore_coupon'],C02:['insert_coupon','keeper_insert_coupon','window_insert_coupon'],C03:[],
};
export class BlueprintSet {
  constructor(data,meshes,font) {
    this.data=structuredClone(data);this.meshes=meshes;this.font=font;this.pages=[];this.cache=new Map();this.projections=new Map();
    for(const topic of data.drawingCatalog)this.addTopic(topic);
    this.addDirectory();
  }
  addDirectory() {
    const headers=['图号 / 页码','资料主题','零件ID / 用途'],widths=[60,235,101],topic=this.pages.find(p=>p.id==='D00');
    let count=1;
    for(let attempt=0;attempt<5;attempt++){
      const pages=this.pages.filter(p=>!p.id.startsWith('D00-'));
      const directory=[...Array(count-1)].map((_,i)=>({...topic,id:'D00-'+(i+2).toString().padStart(2,'0'),title:'图纸目录续页'}));
      const all=[pages[0],...directory,...pages.slice(1)];
      const rows=all.map((p,i)=>[`${p.id} / ${i+1}`,p.title,(p.parts||[]).join('、')||'固定主题资料']);
      const chunks=paginate(headers,widths,rows,{available:145});
      if(chunks.length!==count){count=chunks.length;continue;}
      const first=all[0];first.directoryRows=chunks[0];first.directoryHeaders=headers;first.directoryWidths=widths;
      for(let i=1;i<count;i++)Object.assign(all[i],{type:'table',headers,widths,rows:chunks[i]});this.pages=all;return;
    }
    throw new Error('图纸目录分页未稳定');
  }
  addTopic(topic) {
    const add=(suffix='',extra={})=>this.pages.push({...topic,id:topic.id+suffix,...extra});
    if(topic.id==='B01'||topic.id==='B02'||topic.id==='B03'){
      const selected=this.data.materials.filter(r=>topic.id==='B01'?['purchased','consumables'].includes(r.category):topic.id==='B02'?r.category==='print':['tools','coupons','spares','services'].includes(r.category));
      const widths=[48,90,54,101,103],headers=['编号 / 名称','规格 / 主候选 / 替代','数量 / 估算费用','安装 / 验收 / 关联件','状态 / 待测 / 来源'];
      const rows=selected.map(r=>[`${r.id}\n${r.name}`,`${r.specification}\n候选：${r.candidate}\n替代：${r.alternatives}`,`装机 ${r.installedQuantity} ${r.unit}\n采购 ${r.purchaseQuantity}\n单价 ¥${r.unitPrice.toFixed(2)}\n装机 ¥${r.installedSubtotal.toFixed(2)}\n整包 ${r.packageQuantity} / ¥${r.packagePrice.toFixed(2)}`,`${r.mounting}\n验收：${r.acceptance}\n零件：${r.parts.join('、')}`,`${statusNames[r.status]}\n${r.note}\n来源：${r.source.join('\n')}`]);
      paginate(headers,widths,rows).forEach((rows,i)=>add(i?'-'+(i+1).toString().padStart(2,'0'):'',{type:'table',headers,widths,rows}));return;
    }
    if(['E02','E04'].includes(topic.id)) {
      const headers=topic.id==='E02'?['网络 / 主控逻辑名','模块端子 / 功能','接线与核对要求']:['步骤 / 台架条件','操作与测量','验收 / 待解决门槛'];
      const widths=[75,135,186],rows=topic.id==='E02'?this.data.electrical.signals.map(r=>[r[0]+' / '+r[1],r[2],r[3]]):this.data.electrical.bench.map(r=>[r[0]+' / '+r[1],r[2],r[3]]);
      paginate(headers,widths,rows,{available:175}).forEach((rows,i)=>add(i?'-'+(i+1).toString().padStart(2,'0'):'',{type:'electrical-table',headers,widths,rows}));return;
    }
    if(topic.id==='E01'||topic.id==='E03') {
      add();const headers=topic.id==='E01'?['电源编号','源端子','目的端子','连接要求']:['线束编号','起点 / 终点','走线与避让','线材 / 验收'];
      const widths=topic.id==='E01'?[25,82,105,184]:[25,77,159,135],rows=topic.id==='E01'?this.data.electrical.power:this.data.electrical.routes;
      let suffix=2;paginate(headers,widths,rows,{available:192}).forEach(rows=>add('-'+(suffix++).toString().padStart(2,'0'),{type:'electrical-table',headers,widths,rows}));
      if(topic.id==='E03')paginate(['线号 / 信号','颜色约定','起点 → 终点','端子/针位','走线/核对'],[45,38,108,105,100],this.data.electrical.wires,{available:175}).forEach(rows=>add('-'+(suffix++).toString().padStart(2,'0'),{type:'electrical-table',headers:['线号 / 信号','颜色约定','起点 → 终点','端子/针位','走线/核对'],widths:[45,38,108,105,100],rows,title:'逐线起止、颜色、针位与路径'}));return;
    }
    if(topic.id==='C03'){add('',{type:'table',headers:['检测接口','状态','下一步'],widths:[90,120,186],rows:[['退栓 / GPIO3','霍尔取消；当前无实体反馈','选择机械开关、支架和触发件；测触发与释放'],['闭锁 / GPIO4','霍尔取消；当前无实体反馈','检查全行程、过行程和断线；不能仅用电机定时判定'],['合盖 / GPIO5','当前只作人工台架','触发范围必须在锁扣无阻通过范围内；未验证前不授权自动闭锁']]});return;}
    add();
    if(topic.id.startsWith('P')){
      const id=topic.parts[0],features=this.data.nominalFeatures?.[id]?.['print-pilot'];
      if(!features){this.pages[this.pages.length-1].error='缺少CAD制造特征：'+id;return;}
      const headers=['特征 / 类型','基准坐标 X、Y、Z（装配坐标）','名义参数 / 尺寸依据','制造/装配说明'],widths=[74,96,112,114];
      const rows=features.map((f,i)=>[`${i+1} / ${kindNames[f.kind]||f.kind}`,f.center.map(number).join('，')+(f.axis==='BOX'?`\n${f.details[1]==='cut'?'切除方体':'实体方体'}`:`\n轴向 ${f.axis}`),f.axis==='BOX'?`X×Y×Z=${f.details[0].map(number).join('×')}\nCAD参数`:`${f.kind==='countersink'?`Ø${number(f.diameter)}→Ø${number(f.details[0])}`:`打印 Ø${number(f.diameter)}`}\n装配让位 Ø${number(f.assemblyDiameter)}\n切除工具长 ${number(f.cutToolLength)}`,f.axis==='BOX'?'设计实体/切除原语的名义尺寸；最终轮廓由布尔运算决定。':'CAD切除工具含越界让位，不作为实物钻深。预孔/铜螺母按试块调整；金属螺纹不打印。']);
      rows.push(...this.data.thermalInserts.filter(t=>t.owner===id).map(t=>['M2铜螺母目标 / '+t.connectionIds.join('、'),t.center.map(number).join('，')+'\n'+t.direction,`外Ø${t.outerDiameter}×${t.length}；Z${number(t.center[2])}～${number(t.center[2]+t.length)}\n端向余料${t.remainingAxial}；径向最薄${t.remainingRadial}`,t.wallNote+' 打印预孔按C02试块调整；内螺纹为采购金属件。']));
      const connections=this.data.connections.filter(c=>c.owners.includes(id));
      rows.push(...connections.map(c=>[c.id,c.position.map(number).join('，'),c.materialId+`\n安装绕X旋转 ${c.rotationX}°`,'安装位置来自CAD紧固配置；螺钉头型、长度、铜螺母深度及可用壁厚按装配图复核。']));
      paginate(headers,widths,rows,{available:201}).forEach((rows,i)=>add('-'+(i+2).toString().padStart(2,'0'),{type:'table',headers,widths,rows,title:topic.title+' / CAD特征与连接坐标',partId:id}));
    }
    if(topic.id==='A02'){
      const headers=['序号','零件ID / 名称','数量 / 类型','安装与物料关联'],widths=[22,125,62,187];
      const rows=this.data.productParts.map((p,i)=>[i+1,`${p.id}\n${p.label}`,`${p.quantity} / ${p.kind}`,this.data.materials.filter(r=>r.parts.includes(p.id)).map(r=>r.id).join('、')]);
      paginate(headers,widths,rows).forEach((rows,i)=>add('-'+(i+2).toString().padStart(2,'0'),{type:'table',headers,widths,rows,title:'总装零件序号与装配物料表'}));
    }
  }
  pick(ids=null,pose={lid:0,travel:0,explode:0}) {
    const collection=ids?ids.map(id=>{const m=this.meshes.get(id);if(!m)throw new Error('缺少图纸网格：'+id);return m;}):this.data.productParts.map(p=>this.meshes.get(p.id));
    return collection.map(m=>{
      const convert=array=>{const out=[];for(let i=0;i<array.length;i+=3)out.push(...transformPoint(Array.from(array.slice(i,i+3)),m.role||'fixed',pose,m.explode||[0,0,0]));return out;};
      return {...m,positions:convert(m.positions),edges:convert(m.edges||[])};
    });
  }
  panel(paper,meshes,view,x,y,w,h,{dimensions=true,maxScale=1,caption}={}) {
    const key=meshes.map(m=>m.id).join(',')+'|'+view+'|'+JSON.stringify(meshes.map(m=>m.positions.slice(0,3)));
    let v=this.projections.get(key);if(!v){v=projectView(meshes,view,{resolution:400});this.projections.set(key,v);}
    const fit=Math.min(w/v.size[0],h/v.size[1],maxScale),scale=[1,0.5,0.25,0.2,0.1,0.05].find(s=>s<=fit+1e-7)||fit;
    const ox=x+(w-v.size[0]*scale)/2,oy=y+(h-v.size[1]*scale)/2;
    const point=a=>[ox+(a[0]-v.min[0])*scale,oy+(v.max[1]-a[1])*scale];
    const path=v.visible.map(([a,b])=>{const q=point(a),r=point(b);return `M${q.map(number).join(',')}L${r.map(number).join(',')}`;}).join('');
    paper.items.push(`<path d="${path}" fill="none" stroke="#111" stroke-width=".18"/>`);
    paper.text(x,y+h+5,`${caption||{top:'俯视 ＋Z',front:'前视 ＋Y',right:'右视 ＋X',iso:'等轴测'}[view]} / 1:${number(1/scale)}`,2.6);
    if(dimensions){paper.dimension(ox,oy-5,ox+v.size[0]*scale,oy-5,`${number(v.size[0])} 网格包络`);paper.text(ox+v.size[0]*scale+2,oy+v.size[1]*scale/2,number(v.size[1]),2.5);}
    return {point,view:v,scale};
  }
  section(paper,meshes,axis,value,x,y,w,h,{crop,caption}={}) {
    const sections=meshes.map(m=>({id:m.id,kind:m.kind,section:sliceMesh(m.positions,axis,value)})).filter(s=>s.section.loops.length);
    if(!sections.length)throw new Error(`${axis}=${value} 没有可绘制的截面`);
    const points=sections.flatMap(s=>s.section.loops.flat()),bounds=crop||[Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))];
    const scale=Math.min(w/(bounds[1]-bounds[0]),h/(bounds[3]-bounds[2])),project=p=>[x+(p[0]-bounds[0])*scale,y+h-(p[1]-bounds[2])*scale];
    const clip='clip-'+paper.items.length;paper.items.push(`<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#${clip})">`);
    for(const s of sections)paper.items.push(`<path data-section-part="${s.id}" data-section-axis="${axis}" data-section-value="${value}" data-closed-loops="${s.section.loops.length}" d="${sectionPath(s.section,project)}" fill="${s.kind==='printed'?'url(#hatch)':'none'}" fill-rule="evenodd" stroke="#111" stroke-width=".18" ${s.kind==='hardware'?'stroke-dasharray="1 .5"':''}/>`);
    paper.items.push('</g>');paper.text(x,y+h+5,`${caption||'真实截面'} / ${axis}=${value} / 1:${number(1/scale)}`,2.6);
    paper.text(x,y+h+9,'剖面线仅在打印实体内；虚线为采购候选包络，不能当成内部实物剖面。',2.4);
    return sections;
  }
  render(id) {
    if(this.cache.has(id))return this.cache.get(id);
    const page=this.pages.find(p=>p.id===id);if(!page)throw new Error('图号不存在：'+id);if(page.error)throw new Error(page.error);
    const paper=new Paper(page,this.data,this.font,this.pages.length,this.pages.indexOf(page)),nom=this.data.nominalDimensions;
    if(page.type==='electrical-table'){paper.lines(13,44,this.data.electrical.pinGate,390,2.7,4);paper.table(page.headers,page.widths,page.rows,65);}
    else if(page.type==='table')paper.table(page.headers,page.widths,page.rows,page.partId?52:45);
    else if(id==='D00'){
      paper.lines(13,44,`CAD几何检查 ${this.data.verification.geometryChecks} 项；名义结构检查通过不表示采购模块、实物到位检测、强度或开锁时间已验证。`,390);
      paper.lines(13,59,`基准：盒底Z=0；铰链Y=${nom.hinge[0]}、Z=${nom.hinge[1]}；丝杠X=${nom.lockAxis[0]}；锁栓X=${nom.lockAxis[1]}。CAD参数制造值与STL网格包络量测分别标识。`,390);
      paper.table(page.directoryHeaders,page.directoryWidths,page.directoryRows,73);
      paper.lines(13,235,`未解决：${this.data.unresolved.map(r=>r.id).join('、')}。设备估算¥${this.data.costs.device.toFixed(2)} / 目标约¥100；价格待询价。长表与零件制造特征采用附页，完整页码由冻结目录驱动。`,390,2.6,4);
    }else if(id.startsWith('P')){
      const part=this.data.parts.find(p=>p.id===page.parts[0]);if(!part)throw new Error('零件图元数据缺失');const meshes=this.pick([part.id]);
      this.panel(paper,meshes,'top',22,53,226,87);this.panel(paper,meshes,'iso',285,53,105,87,{dimensions:false});this.panel(paper,meshes,'front',22,173,226,55);this.panel(paper,meshes,'right',285,173,105,55);
      paper.lines(13,242,`${part.id} / 正式数量${part.quantity} / 备用建议${part.spareSuggestion} / ${part.material} / ${part.orientation}。${part.support}。孔位、壁厚/台阶原语与紧固坐标见本图附页；包络量测不能替代孔径制造要求。`,390,2.7,4);
    }else if(id==='A01'||id==='A02'){
      const meshes=this.pick(null,{lid:0,travel:14,explode:id==='A02'?1:0});
      if(id==='A01'){
        this.panel(paper,meshes,'top',22,53,226,87);this.panel(paper,meshes,'iso',285,53,105,87,{dimensions:false});this.panel(paper,meshes,'front',22,173,226,55);this.panel(paper,meshes,'right',285,173,105,55);
        paper.lines(13,243,`设计名义外形 ${nom.closedSize.join('×')}；储物验收包络185×95×40，最低Z=5；锁栓行程${nom.stroke}mm，开盖105°。制造数据不随预览姿态、隐藏、爆炸或参照开关变化。`,390);
      }else{
        const panel=this.panel(paper,meshes,'iso',15,46,380,187,{dimensions:false,maxScale:.5,caption:'固定总装爆炸图；非安装路径'});
        for(const [i,m] of meshes.entries()){
          const ex=measureExtent([m]),center=ex.min.map((a,k)=>(a+ex.max[k])/2),p=[-.707107*center[0]+.707107*center[1],-.408248*center[0]-.408248*center[1]+.816497*center[2]],q=panel.point(p);
          paper.items.push(`<circle cx="${q[0]}" cy="${q[1]}" r="2.6" fill="white" stroke="#111" stroke-width=".2"/>`);paper.text(q[0],q[1]+.9,i+1,2.4,'middle');
        }
        paper.lines(13,247,'序号与数量详见A02附页；连接位置与螺钉型号引用F连接编号和B01。画面位移用于爆炸说明，不证明实体安装扫掠。',390);
      }
    }else if(id==='A03'){
      const ids=this.data.productParts.filter(p=>!excludeCover.includes(p.id)).map(p=>p.id),meshes=this.pick(ids);
      this.panel(paper,meshes,'top',15,50,380,72,{caption:'固定内部布局：移除主盖组件'});
      this.section(paper,this.pick(),'Y',.001,15,148,230,68,{caption:'纵剖A—A'});this.section(paper,this.pick(),'X',103.001,277,148,115,68,{caption:'横剖B—B'});
      paper.lines(13,246,'剖切位置：A—A为Y=0.001（接近中心）；B—B为X=103.001（锁栓轴附近）。Z5～45为储物验收高度；电池位于驱动层下方，前方电子分层。',390);
    }else if(['A04','A05','A06','A07','A08'].includes(id)){
      const meshes=this.pick(groups[id]);this.panel(paper,meshes,'top',20,51,375,69,{caption:'固定相关零件集合'});
      if(id==='A04'){
        this.section(paper,meshes,'Y',.001,18,148,375,30,{crop:[-105,50,46,55],caption:'C—C 栅条/窗片直接接触'});
        this.section(paper,meshes,'Y',-43,18,196,220,32,{crop:[-105,-80,46,55],caption:'D—D 固定耳、铜螺母与螺钉'});
        paper.lines(250,197,`层次Z：内栅${nom.windowStack[0]}～${nom.windowStack[1]}；固定耳顶${nom.windowStack[2]}；亚克力${nom.windowStack[3]}～${nom.windowStack[4]}；外栅至${nom.windowStack[5]}。铜螺母长${nom.insert[1]}，向外热装，目标49.9～53.9，顶面余料1.1；螺钉啮合3.5。`,145,2.7,4);
        paper.lines(13,247,'四耳承载预紧；清理接触面、多点测板厚，交叉轻拧至限位。若晃动、翘曲或顶压，改接触高度重打内栅，不强迫窗片弯曲。横向每侧1mm间隙。',390,2.6,4);
      }else if(id==='A05'){
        this.section(paper,meshes,'Y',-54.999,18,148,375,42,{crop:[-115,90,43,56],caption:'E—E 钢销与交错轴套 / Y=−54.999'});
        this.section(paper,meshes,'Y',-50.501,18,210,135,30,{crop:[-114,-102,43,55],caption:'F—F 左端盖及铜螺母 / Y=−50.501'});
        paper.lines(174,209,`钢销Ø2×${nom.hingePin[1]}，起点X=${nom.hingePin[0]}；轴孔Ø${nom.hingePin[2]}，两端名义间隙${nom.hingePin[3]}。端盖先向＋Y滑出，再向＋Z取下；开盖退栓后才拆钢销。固定轴套${JSON.stringify(nom.fixedKnuckles)}；盖轴套${JSON.stringify(nom.movingKnuckles)}。`,219,2.7,4);
      }else if(id==='A06'){
        this.section(paper,meshes,'X',84.501,18,148,175,52,{caption:'G—G 丝杠与浮动螺母'});
        this.section(paper,meshes,'X',103.001,218,148,175,52,{caption:'H—H 锁栓与锁扣'});
        paper.arrow(90,225,90,210,'＋Y闭锁 / 14mm');
        paper.lines(13,245,`丝杠X=${nom.lockAxis[0]}、锁栓X=${nom.lockAxis[1]}、轴高Z=${nom.lockAxis[2]}；开盖前完全退栓。螺母槽外接圆${nom.nutPocket[0]}，轴向厚${nom.nutPocket[2]}；导向间隙名义${nom.guide[3]}。M4法兰螺母为待实测候选；机械到位检测未完成。`,390,2.7,4);
      }else if(id==='A07'){
        this.section(paper,meshes,'X',103.001,18,147,210,83,{caption:'I—I 电池与维护口'});
        paper.arrow(256,172,256,225,'向−Z取出');
        paper.lines(278,150,'先断电，拆四颗M2×8沉头，拔整对电池接头，再向底部取出电池座。保护板/接头适配未确认时禁止强装。取出后用独立充电器；盒内无充电路径。电池包络不是电芯内部结构。',113,2.7,4);
      }else{
        this.section(paper,meshes,'Y',38.001,18,148,220,83,{caption:'J—J 分层电子安装'});
        paper.lines(258,149,'电子层名义布局；候选模块长方体只是安装空间，器件高度、排针、焊线、保护板与接头需实物确认。完整规格、尺寸冲突及候选状态见B01全部续页；电源/信号/线束及验收见E01～E04。',137,2.7,4);
      }
    }else if(id.startsWith('C')){
      const ids=groups[id];ids.forEach((part,i)=>{const meshes=this.pick([part]);this.panel(paper,meshes,'iso',15+i*130,51,118,78,{caption:part});const features=this.data.nominalFeatures[part]?.['print-pilot']||[];paper.lines(15+i*130,147,features.filter(f=>f.axis!=='BOX').map(f=>`${f.axis}孔：(${f.center.map(number)}) Ø${number(f.diameter)}`).join('\n')||'尺寸与定位挡边来自本试块CAD；量测真实磁铁/板件与安装距离。',118,2.7,4);});
      paper.lines(13,230,id==='C01'?'锁栓试孔6.4/6.6/6.8；钢销试孔2.2/2.4/2.6。清除象脚和孔口，记录自由滑动及间隙，首样结果决定配合参数。':id==='C02'?'铜螺母试孔2.8/2.9/3.0；型号外Ø3.2、长4。核对垂直度、目标深度、剩余壁厚、变形及复拆保持力。不得声称一般公差已经由打印机保证。':'霍尔间隙量规0.5/1/2/4。测触发、释放、板件/磁铁位置，并对照锁扣可通过范围；芯片电气兼容不等于合盖可靠。',390,2.7,4);
    }else if(id==='F01'){
      const [l,w,t]=nom.windowPane;paper.items.push(`<rect x="25" y="70" width="${l}" height="${w}" fill="none" stroke="#111" stroke-width=".25"/>`);paper.dimension(25,63,25+l,63,`${l} 名义`);paper.text(178,111,`${w} 名义`,3);paper.dimension(25,184,125,184,'100mm 比例校验线');paper.scaleLabel='1:1（按100%打印校验）';paper.lines(226,72,`亚克力 ${l}×${w}×${t}mm，无钻孔。边缘去毛刺、尖角倒钝，卡尺多点测板厚。单独加工SVG/DXF为毫米1:1轮廓，附100mm校验线；浏览器缩放不代表实际加工比例。先试装，不通过拧紧强迫弯曲。`,170,3,5);
    }else if(id==='F02'){
      const l=nom.hingePin[1];paper.items.push(`<rect x="30" y="100" width="${l}" height="2" fill="none" stroke="#111" stroke-width=".25"/>`);paper.dimension(30,93,30+l,93,`${l} 名义`);paper.text(219,103,'Ø2 钢销',3);paper.scaleLabel='1:1';paper.lines(25,145,`采购Ø2×${l}钢销；锯切后去毛刺、端头倒钝并检查直线度，不削薄有效轴径。连续轴孔名义Ø${nom.hingePin[2]}；两端各${nom.hingePin[3]}mm间隙，轴孔先用试块核对。无需独立轴环或紧定螺钉。`,370,3,5);
    }else if(id.startsWith('E')){
      if(!this.data.electrical)throw new Error(`${id} 电气资料尚未固定，不能导出伪完整图纸`);
      this.electrical(paper,id);
    }else throw new Error('尚无图纸生成器：'+id);
    const svg=paper.finish({fixedPose:true,referenceExcluded:true,selectedPartIds:page.parts});this.cache.set(id,svg);return svg;
  }
  electrical(paper,id) {
    const d=this.data.electrical;
    if(id==='E01') {
      const box=(x,y,w,h,label)=>{paper.items.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width=".25"/>`);paper.lines(x+3,y+7,label,w-6,3,4.5);};
      box(15,61,64,27,'18650 单节\nB+ / B−');box(99,61,75,27,'保护板（未适配）\nB端电芯 / P端负载');box(194,61,86,27,'配对电池接头\n＋ / − = 系统母线');
      paper.arrow(79,74,99,74,'P01');paper.arrow(174,74,194,74,'P02');
      box(46,121,110,32,'S7V8F3 VIN / GND\nVOUT = 3.3V / GND');box(226,121,120,32,'DRV8833 VIN / GND\nAOUT1 / 2 → 电机');
      paper.arrow(211,88,102,121,'P04');paper.arrow(247,88,282,121,'P03');
      box(46,179,125,29,'3V3 → ESP、OLED\n共地：仅保护后P−');box(238,179,101,29,'N20 3V 丝杠电机\n方向/堵转/PWM待测');
      paper.arrow(101,153,101,179,'P05 / P06');paper.arrow(286,153,286,179,'P07');
      paper.lines(15,226,d.usb+' '+d.pending,390,2.7,4);
    } else if(id==='E03') {
      const ids=this.data.productParts.filter(p=>!excludeCover.includes(p.id)).map(p=>p.id);
      this.panel(paper,this.pick(ids),'top',20,51,370,110,{caption:'线束安装区 / 内部固定布局'});
      paper.lines(15,184,'固定走线区：右侧电池/维护口→前方电子双层托盘；锁模块外侧→电机端子；前壁→OLED与按钮。所有电气线束在底壳侧，机械检测待选型，禁止跨钢销铰链。',390,3,5);
      paper.lines(15,218,'路线为操作说明，详细分支、线材、颜色、逐线起止、接头针位、余量和避让见E03全部续页。最终线束必须按实物最高端子包络做全行程、开盖和维护扫掠检查；未采购板件不画成已验证实体。',390,3,5);
    } else throw new Error('电气页类型未定义：'+id);
  }
  acrylic() {
    const [l,w]=this.data.nominalDimensions.windowPane,d=this.data;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="125mm" viewBox="0 0 190 125"><metadata>${e(JSON.stringify({version:d.version,generatedAt:d.generatedAt,cadFingerprint:d.cadFingerprint,units:'mm',scale:'1:1',size:[l,w]}))}</metadata><style>@font-face{font-family:TLBlueprint;src:url(data:font/otf;base64,${this.font}) format('opentype')}text{font-family:TLBlueprint}</style><g fill="none" stroke="black" stroke-width=".2"><rect id="acrylic-outline" x="10" y="18" width="${l}" height="${w}"/><path id="scale-check" d="M10,110H110M10,108V112M110,108V112"/></g><text x="10" y="12" font-size="3">${l}×${w}×${this.data.nominalDimensions.windowPane[2]}mm / 无钻孔 / 1:1</text><text x="115" y="111" font-size="3">100mm校验线</text><text x="10" y="121" font-size="1.6">${e(d.version+' / '+d.generatedAt+' / CAD '+d.cadFingerprint)}</text></svg>`;
    const pair=(code,value)=>`${code}\r\n${value}\r\n`;
    let dxf=pair(999,`TetherLock ${d.version} ${d.generatedAt} CAD ${d.cadFingerprint}`)+pair(0,'SECTION')+pair(2,'HEADER')+pair(9,'$INSUNITS')+pair(70,4)+pair(0,'ENDSEC')+pair(0,'SECTION')+pair(2,'ENTITIES');
    dxf+=pair(0,'LWPOLYLINE')+pair(100,'AcDbEntity')+pair(8,'ACRYLIC')+pair(100,'AcDbPolyline')+pair(90,4)+pair(70,1);
    for(const [x,y] of [[0,0],[l,0],[l,w],[0,w]])dxf+=pair(10,x)+pair(20,y);
    dxf+=pair(0,'LINE')+pair(8,'CALIBRATION')+pair(10,0)+pair(20,-15)+pair(11,100)+pair(21,-15)+pair(0,'ENDSEC')+pair(0,'EOF');return {svg,dxf};
  }
  async archive(onProgress=()=>{}) {
    const files={};
    for(const [i,page] of this.pages.entries()){onProgress(i,this.pages.length,page.id);files[`drawings/${page.id}.svg`]=strToU8(this.render(page.id));await new Promise(resolve=>setTimeout(resolve,0));}
    for(const [name,categories] of [['complete-bom',null],['purchase-bom',['purchased','consumables']],['print-list',['print']],['tools-spares',['tools','coupons','spares','services']]])files[`lists/${name}.csv`]=strToU8(materialsCSV(this.data,categories?this.data.materials.filter(r=>categories.includes(r.category)):this.data.materials));
    files['assembly-printable.html']=strToU8(printableAssembly(this.data,this.font));
    files['fonts/LICENSE-Noto-CJK.txt']=strToU8(this.data.fontLicense);
    files['source-fingerprints.json']=strToU8(JSON.stringify({CAD:this.data.sourceSHA256,engineering:this.data.dataSourceSHA256,print:this.data.printFileSHA256,assembly:this.data.assemblyFingerprint},null,2));
    files['README.txt']=strToU8('TetherLock '+this.data.version+' / CAD '+this.data.cadFingerprint+'\nA3 SVG包含本地嵌入中文字体；按100%打印并核对100mm比例线。图目录由catalog.json冻结。BOM金额为估算，未解决模块/预算冲突见engineering-data.json与B01；控制固件、强度、低压和≤15秒待实测。assembly-printable.html为整套人工组装说明，可离线打开打印。\n');
    const factory=this.acrylic();files['fabrication/acrylic-1to1.svg']=strToU8(factory.svg);files['fabrication/acrylic-1to1.dxf']=strToU8(factory.dxf);
    files['catalog.json']=strToU8(JSON.stringify({version:this.data.version,cadFingerprint:this.data.cadFingerprint,generatedAt:this.data.generatedAt,pages:this.pages},null,2));files['engineering-data.json']=strToU8(JSON.stringify(this.data,null,2));
    return new Blob([zipSync(files,{level:6})],{type:'application/zip'});
  }
}
