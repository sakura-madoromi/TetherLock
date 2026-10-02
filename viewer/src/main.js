import './style.css';
import { icon } from './icons.js';
import { defaults, sanitizeSettings, sanitizeCamera, controlPose, motionPose, clamp } from './state.js';
import { WorkbenchScene } from './scene.js';
import { buildDrawing } from './drawing.js';
import { AssemblyGuide } from './assembly.js';
import { EngineeringPanel } from './engineering.js';
import { saveBlob, capturePNG, drawingPNG, printDrawing, exportViews, exportGLB, startRecording } from './exports.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let state = sanitizeSettings(defaults), manifest, scene, player = null, recording = null, busy = false;
let search = '', filter = 'all', currentTab = 'motion', cachedDrawing = '', drawTimer, drawRevision = 0;
let phase = 0, motionKind = 'cycle', drawingZoom = 1, noticeTimer;
let engineering, assembly;
const initialHash = location.hash;
const chip = (name, label, extra = '') => `<button class="icon-button ${extra}" data-action="${name}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
const range = (key, label, min, max, step, unit = '') => `<label class="range-field"><span>${label}<output data-output="${key}"></output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}" data-unit="${unit}" /></label>`;
const toggle = (key, label, detail = '') => `<label class="toggle-row"><span>${label}${detail ? `<small>${detail}</small>` : ''}</span><input type="checkbox" data-setting="${key}" aria-label="${label}" /><span class="switch" aria-hidden="true"></span></label>`;

$('#app').innerHTML = `
<header class="app-header">
  <div class="brand"><div class="brand-mark">${icon('box',24)}</div><div><strong>TETHERLOCK <span>V3</span></strong><small>结构与运动工作台</small></div></div>
  <nav class="workspace-tabs" aria-label="工作模式"><button data-mode="studio" class="active">${icon('cube',16)}三维预览</button><button data-mode="drawing">${icon('file',16)}工程资料</button><button data-mode="assembly">${icon('layers',16)}组装指导</button></nav>
  <div class="header-actions"><span class="verified"><i></i>真实 CAD</span>${chip('info','使用说明')}<button class="button primary" data-action="quick-export">${icon('download',16)}<span>导出 PNG</span></button></div>
</header>
<main class="workspace">
  <aside class="left-panel panel" aria-label="零件管理">
    <div class="panel-title"><span>装配结构</span><span class="count" id="part-count">—</span></div>
    <label class="search-field">${icon('search',16)}<input id="part-search" placeholder="搜索零件 / 名称" aria-label="搜索零件" /><kbd>/</kbd></label>
    <div class="filter-tabs"><button data-filter="all" class="active">全部</button><button data-filter="printed">打印件</button><button data-filter="hardware">外购件</button></div>
    <div class="tree-tools"><span id="visible-count">正在读取 CAD</span><button data-action="show-all">全部显示</button></div>
    <div class="part-tree" id="part-tree"></div>
    <section class="inspector" id="inspector"><div class="eyebrow">零件检查</div><p class="empty-inspector">在模型或列表中选一个零件<br/>查看尺寸、独立预览与打印文件</p></section>
    <div class="source-footer"><span class="source-indicator"></span><div><strong>V3 / 名义几何已核对</strong><small id="source-stats">正在加载几何清单</small></div><a href="downloads/TetherLock-V3-CAD.zip" download title="下载CAD包" aria-label="下载CAD包">${icon('download',16)}</a></div>
  </aside>
  <section class="stage" aria-label="模型工作区">
    <div class="stage-header"><div><span class="eyebrow" id="stage-eyebrow">ASSEMBLY / V3</span><h1 id="stage-title">让结构，清楚可见。</h1></div><div class="stage-header-right"><span class="pose-badge" id="pose-badge"><i></i>闭合 · 已上锁</span><button class="icon-button mobile-parts" data-action="toggle-parts" aria-label="打开零件列表">${icon('layers')}</button></div></div>
    <div class="viewport" id="viewport"><div class="canvas-toolbar"><div class="camera-presets" aria-label="相机预设"><button data-camera="iso" class="active">等轴测</button><button data-camera="top">俯视</button><button data-camera="front">前视</button><button data-camera="right">侧视</button></div><div class="view-tools">${chip('focus','适应视图 · F')}${chip('ruler','两点测量 · M')}${chip('bookmark','保存当前视角')}${chip('reset','复位模型')}</div></div>
      <div class="loading-card" id="loading"><div class="loader-mark">${icon('box',36)}</div><strong>正在载入真实 V3 结构</strong><span id="loading-status">校验 CAD 与分件资源</span><div class="progress-track"><i id="load-progress"></i></div></div>
      <div class="stage-spec"><strong>240 <span>×</span> 120 <span>×</span> 55 <small>mm</small></strong><span>闭合整机 / 14 mm 锁栓行程</span></div>
      <div class="axis-gizmo" aria-label="坐标与视角"><svg viewBox="0 0 90 90"><path d="M44 48 76 39" stroke="#b9604c"/><path d="M44 48 19 35" stroke="#64896e"/><path d="M44 48V14" stroke="#4c7c9e"/><circle cx="44" cy="48" r="3" fill="#627480"/></svg><button data-camera="right" class="axis-x">X</button><button data-camera="front" class="axis-y">Y</button><button data-camera="top" class="axis-z">Z</button></div>
      <div class="viewport-hint" id="viewport-hint">拖动旋转 · 滚轮缩放 · 双击聚焦</div>
    </div>
    <div class="drawing-workspace" id="drawing-workspace" hidden><div class="drawing-toolbar"><span>${icon('file',16)}<strong>A3 / 结构参考图</strong></span><div><button class="icon-button" data-action="zoom-out" aria-label="缩小图纸">−</button><span id="drawing-zoom">适应窗口</span><button class="icon-button" data-action="zoom-in" aria-label="放大图纸">+</button><button class="text-button" data-action="refresh-drawing">更新图纸</button></div></div><div class="paper-scroll"><div id="drawing-paper"><div class="drawing-placeholder">从实际可见网格生成三视图…</div></div></div><div class="drawing-note">尺寸随当前姿态和可见零件变化。图纸为 STL 投影参考，不含制造公差。</div></div>
    <div class="motion-bar"><button class="play-button" data-action="play" aria-label="播放活动演示">${icon('play',16)}</button><div class="timeline-title"><strong id="timeline-title">活动演示</strong><span id="timeline-phase">退栓 → 开盖 → 闭盖 → 上锁</span></div><input type="range" data-setting="timeline" min="0" max="1000" step="1" value="0" aria-label="运动时间线"/><span id="timeline-percent">0%</span><button class="text-button" data-action="record">${icon('video',15)}<span>录制</span></button></div>
  </section>
  <aside class="right-panel panel" aria-label="预览设置">
    <nav class="tool-tabs" aria-label="设置分类"><button data-tab="motion" class="active">${icon('move',16)}运动</button><button data-tab="display">${icon('settings',16)}显示</button><button data-tab="export">${icon('download',16)}导出</button></nav>
    <div class="tools-scroll">
      <section class="tool-page" data-page="motion">
        <div class="section-heading"><span>机构运动</span><span class="tiny-tag">顺序联动</span></div>
        <div class="pose-presets"><button data-pose="closed"><span class="pose-mini closed"></span><strong>闭合</strong><small>栓入 · 盖合</small></button><button data-pose="open"><span class="pose-mini open"></span><strong>打开</strong><small>栓退 · 105°</small></button><button data-pose="exploded"><span class="pose-mini exploded"></span><strong>拆解</strong><small>分件展开</small></button></div>
        ${range('lid','盖板角度',0,105,0.5,'°')}${range('travel','锁栓位置',0,14,0.1,' mm')}${range('explode','爆炸距离',0,1,0.01,'%')}
        <div class="motion-actions"><button class="button" data-action="open-motion">${icon('play',14)}开锁 · 开盖</button><button class="button" data-action="close-motion">${icon('play',14)}闭盖 · 上锁</button></div>
        <div class="separator"></div><div class="section-heading"><span>演示控制</span></div>
        ${range('speed','演示速度',0.25,2.5,0.25,'×')}${toggle('loop','循环播放')}
        <div class="mechanism-note"><span>${icon('info',16)}</span><p>开盖前自动退栓，锁栓前进时自动合盖。动画展示几何运动；开锁时间和带载性能仍需实测。</p></div>
        <div class="separator"></div><div class="section-heading"><span>视角收藏</span><button class="text-button" data-action="bookmark">添加</button></div><div id="bookmarks" class="bookmarks"><span class="muted small">保存当前构图，之后一键恢复。</span></div>
      </section>
      <section class="tool-page" data-page="display" hidden>
        <div class="section-heading"><span>视觉风格</span></div><div class="style-presets"><button data-style="studio" class="active"><i class="swatch-studio"></i>工作室</button><button data-style="technical"><i class="swatch-technical"></i>工程灰</button><button data-style="blueprint"><i class="swatch-blueprint"></i>蓝图</button><button data-style="xray"><i class="swatch-xray"></i>X 射线</button></div>
        <label class="select-field"><span>投影方式</span><select data-setting="projection" aria-label="投影方式"><option value="perspective">透视 · 展示</option><option value="orthographic">正交 · 检查</option></select></label>
        ${range('opacity','外壳不透明度',0.08,1,0.01,'%')}${toggle('edges','特征边线')}${toggle('grid','地面参考网格')}${toggle('labels','主要零件标注')}${toggle('reference','储物验收块','185 × 95 × 40 mm')}${toggle('phone','显示手机','iPhone 17 Pro Max · 裸机含相机凸起')}${toggle('card','显示银行卡','ID-1 · 虚构卡面')}
        <div class="separator"></div><div class="section-heading"><span>剖切检查</span>${icon('clip',16)}</div>${toggle('clip','启用剖切')}
        <div id="clip-controls"><div class="segmented" aria-label="剖切轴"><button data-clip-axis="X">X</button><button data-clip-axis="Y">Y</button><button data-clip-axis="Z" class="active">Z</button></div>${range('clipValue','剖切位置',-150,200,0.5,' mm')}${toggle('clipReverse','反转保留方向')}<p class="small muted">橙色线为真实截交轮廓；切面未填充。PNG保留剖切，三视图绘制完整可见件。</p></div>
        <div class="separator"></div><div class="section-heading"><span>表面测量</span><button class="text-button" data-action="clear-measures">清除</button></div><button class="button full" data-action="ruler">${icon('ruler',16)}选择两个表面点</button><p class="small muted" id="measurement-status">距离使用真实毫米坐标；测量端点随零件运动。</p>
      </section>
      <section class="tool-page" data-page="export" hidden>
        <div class="section-heading"><span>预览图</span><span class="tiny-tag">纯模型画面</span></div><div class="export-preview"><span class="export-cube">${icon('box',44)}</span><div><strong>你的构图，直接出图。</strong><small>含当前姿态、材质与剖切</small></div></div>
        <label class="select-field"><span>图片尺寸</span><select id="export-resolution" aria-label="图片尺寸"><option value="2560,1440">2K · 2560 × 1440</option><option value="3840,2160">4K · 3840 × 2160</option><option value="2400,2400">方形 · 2400 × 2400</option></select></label><label class="toggle-row"><span>透明背景</span><input id="transparent" type="checkbox" aria-label="透明背景"/><span class="switch"></span></label>
        <button class="button primary full" data-action="export-png">${icon('image',16)}导出当前 PNG</button><button class="button full" data-action="export-views">${icon('layers',16)}五视角图片包 ZIP</button>
        <div class="separator"></div><div class="section-heading"><span>工程参考图</span><span class="tiny-tag">A3 / mm</span></div><label class="select-field"><span>图纸标题</span><input id="drawing-title" value="TetherLock V3" maxlength="70" aria-label="图纸标题"/></label>${toggle('hiddenLines','工程图显示隐藏线')}
        <div class="export-grid"><button class="button" data-action="export-svg">${icon('file',15)}矢量 SVG</button><button class="button" data-action="export-drawing-png">${icon('image',15)}图纸 PNG</button></div><button class="button full" data-action="print">${icon('printer',16)}打印 / 保存 PDF</button><p class="small muted">三视图 + 等轴测；标注当前可见件包络、姿态与比例。PNG为3840 × 2715。</p>
        <div class="separator"></div><div class="section-heading"><span>模型与动画</span></div><button class="button full" data-action="record">${icon('video',16)}<span>录制一次运动 WebM</span></button>${toggle('includeReferences','GLB 包含尺寸参照','默认排除，勾选时仅导出当前显示的参照')}<button class="button full" data-action="export-glb">${icon('cube',16)}导出当前模型 GLB</button><div class="export-grid"><button class="button" data-action="save-settings">${icon('bookmark',14)}保存视图</button><button class="button" data-action="import-settings">${icon('file',14)}载入视图</button></div><input id="settings-file" type="file" accept=".json,application/json" hidden/><button class="button full" data-action="share">${icon('link',15)}复制当前视图链接</button>
        <div class="separator"></div><div class="export-grid"><a class="button" href="downloads/TetherLock-V3-CAD.zip" download>${icon('download',15)}CAD 包</a><a class="button" href="downloads/v3-bom.csv" download>${icon('file',15)}BOM</a></div>
      </section>
    </div><div class="panel-bottom">${icon('info',14)}先核对实物尺寸，再打印试装。</div>
  </aside>
<section id="assembly-workspace" class="assembly-workspace" hidden></section>
</main>
<footer class="status-bar"><div><i class="ready-dot"></i><span id="status">准备加载 CAD</span></div><span id="selection-status">Z 向上 / 单位 mm</span><span class="status-help">结构样机 · 运动为示意</span><button class="mobile-settings" data-action="toggle-settings">设置 ${icon('settings',14)}</button></footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<dialog id="help-dialog"><div class="dialog-header"><span class="eyebrow">TETHERLOCK / WORKBENCH</span><button class="icon-button" data-action="close-help" aria-label="关闭说明">${icon('close')}</button></div><h2>从结构检查，到直接出图。</h2><p>这里的模型来自 V3 已验证的实际 CAD 分件。外购件是待采购核对的尺寸包络。</p><div class="help-grid"><div><strong>查看与检查</strong><p>拖动旋转，右键平移，滚轮缩放。单击选件、双击聚焦；左侧可以隐藏或隔离零件。打开标注、参考块或剖切，检查装配空间。</p></div><div><strong>运动与测量</strong><p>用开锁/闭锁按钮播放联动，时间线可逐帧拖动。启用测量后点两个表面点，距离以mm显示并跟随分件。</p></div><div><strong>预览与工程图</strong><p>图片导出不含工作台界面。工程图以当前姿态、可见零件生成三视图和等轴测，实际测量尺寸；支持SVG、PNG及浏览器保存PDF。</p></div><div><strong>动画与文件</strong><p>WebM录制三维视口中的一个完整运动循环。GLB使用米单位，并保留可见件和当前姿态；剖切仅影响画面。视图JSON可跨设备载入。</p></div></div><div class="shortcut-grid"><kbd>1—6</kbd>相机预设<kbd>F</kbd>适应视图<kbd>M</kbd>两点测量<kbd>E</kbd>导出PNG<kbd>空格</kbd>播放/暂停<kbd>Esc</kbd>退出隔离</div><p class="help-boundary">工程图基于STL特征线与采样遮挡，未包含制造公差；力学、FDM配合和≤15秒开锁仍需实物验收。部分分件需要支撑，整件外壳有效打印面积至少240×120 mm。</p></dialog>`;

function notice(message, duration = 4200) {
  clearTimeout(noticeTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  if (duration) noticeTimer = setTimeout(() => { $('#toast').hidden = true; }, duration);
}

function syncControls() {
  for (const input of $$('[data-setting]')) {
    const key = input.dataset.setting;
    if (key === 'timeline') { input.value = Math.round(phase * 1000); continue; }
    if (input.type === 'checkbox') input.checked = Boolean(state[key]); else input.value = state[key];
  }
  for (const output of $$('[data-output]')) {
    const key = output.dataset.output, value = state[key];
    output.textContent = ['explode', 'opacity'].includes(key) ? `${Math.round(value * 100)}%` : key === 'lid' ? `${value.toFixed(1)}°` : key === 'speed' ? `${value.toFixed(2)}×` : `${value.toFixed(1)} mm`;
  }
  $$('[data-style]').forEach(b => b.classList.toggle('active', b.dataset.style === state.style));
  $$('[data-clip-axis]').forEach(b => b.classList.toggle('active', b.dataset.clipAxis === state.clipAxis));
  $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  $$('[data-action="ruler"]').forEach(b => b.classList.toggle('active', state.measure));
  $('#clip-controls').classList.toggle('disabled-section', !state.clip);
  $('#pose-badge').innerHTML = `<i></i>${state.explode > 0 ? '拆解 · ' + Math.round(state.explode * 100) + '%' : state.lid > 0 ? '开盖 · ' + state.lid.toFixed(0) + '°' : state.travel > 0 ? '闭合 · 栓 ' + state.travel.toFixed(1) + ' mm' : '闭合 · 已退栓'}`;
  $('#viewport-hint').textContent = state.measure ? '测量模式 · 依次选择两个表面点' : state.isolated ? '独立零件 · Esc 退出隔离' : '拖动旋转 · 滚轮缩放 · 双击聚焦';
  $$('[data-action="play"]').forEach(b => { b.innerHTML = icon(player?.playing ? 'pause' : 'play', 16); b.setAttribute('aria-label', player?.playing ? '暂停活动演示' : '播放活动演示'); });
  $('#timeline-percent').textContent = `${Math.round(phase * 100)}%`;
  $('#timeline-phase').textContent = player ? (state.lid > 0 ? player.kind === 'close' || phase > .62 && player.kind === 'cycle' ? '盖板正在闭合' : '盖板正在打开' : state.travel > 0 ? phase > .8 ? '锁栓进入承窝' : '锁栓正在退回' : '锁栓已完全退回') : '退栓 → 开盖 → 闭盖 → 上锁';
  $('#assembly-workspace').hidden=state.mode!=='assembly';document.body.classList.toggle('assembly-active',state.mode==='assembly');
  $('#viewport').hidden = state.mode === 'drawing'; $('#drawing-workspace').hidden = state.mode !== 'drawing';
  $('#stage-title').textContent = state.mode === 'drawing' ? '尺寸，来自真实结构。' : '让结构，清楚可见。';
  $('#stage-eyebrow').textContent = state.mode === 'drawing' ? 'DRAWING / A3 · mm' : state.isolated ? 'PART INSPECTION / V3' : 'ASSEMBLY / V3';
}

function apply({ tree = false, section = true, drawing = true } = {}) {
  scene?.apply({ section }); syncControls();
  if (tree) { renderTree(); renderInspector(); }
  if (drawing) { cachedDrawing = ''; if (state.mode === 'drawing') scheduleDrawing(); }
}

function switchMode(mode) {
  if(mode===state.mode)return;stopMotion();if(assembly?.active)assembly.leave();state.mode=mode;syncControls();if(mode==='assembly')assembly.enter();else{apply();if(mode==='studio')scene.resize();}
}

function stopMotion() { if (player) player.playing = false; syncControls(); }

function selectPart(id) {
  if(busy)return;
  state.selected = manifest.parts.some(p => p.id === id) ? id : null;
  apply({ tree: true, drawing: false });
  const part = manifest.parts.find(p => p.id === state.selected);
  $('#selection-status').textContent = part ? part.label : 'Z 向上 / 单位 mm';
}

function renderTree() {
  if (!manifest) return;
  const root = $('#part-tree'), fragments = [];
  for (const group of manifest.groups) {
    const parts = manifest.parts.filter(p => p.group === group.id && (filter === 'all' || (filter === 'hardware' ? p.kind !== 'printed' : p.kind === 'printed')) && (!search || `${p.id} ${p.label}`.toLowerCase().includes(search)));
    if (!parts.length) continue;
    const allHidden = parts.every(p => state.hidden.includes(p.id));
    fragments.push(`<details class="part-group" open><summary><span>${icon('chevron',12)}${group.label}<small>${parts.length}</small></span><button class="tree-eye" data-group="${group.id}" aria-label="切换${group.label}可见性" title="切换整组可见性">${icon(allHidden ? 'eyeOff' : 'eye',14)}</button></summary><div>`);
    for (const p of parts) {
      const hidden = state.hidden.includes(p.id);
      fragments.push(`<div class="part-row ${state.selected === p.id ? 'selected' : ''} ${hidden ? 'muted-part' : ''}"><button class="part-select" data-part="${p.id}" title="${p.label} (${p.id})"><i style="--part-color:${p.color}"></i><span>${p.label}</span>${p.kind === 'printed' ? '<small>P</small>' : ''}</button><button class="tree-eye" data-hide="${p.id}" aria-label="${hidden ? '显示' : '隐藏'}${p.label}" title="${hidden ? '显示' : '隐藏'}">${icon(hidden ? 'eyeOff' : 'eye',14)}</button></div>`);
    }
    fragments.push('</div></details>');
  }
  root.innerHTML = fragments.join('') || '<div class="empty-search">没有找到匹配零件</div>';
  $('#visible-count').textContent = `${manifest.parts.filter(p => !state.hidden.includes(p.id) && (!state.isolated || state.isolated === p.id)).length} / ${manifest.parts.length} 可见`;
}

function renderInspector() {
  const p = manifest?.parts.find(p => p.id === state.selected), host = $('#inspector');
  if (!p) { host.innerHTML = '<div class="eyebrow">零件检查</div><p class="empty-inspector">在模型或列表中选一个零件<br/>查看尺寸、独立预览与打印文件</p>'; return; }
  host.innerHTML = `<div class="eyebrow">${p.kind === 'printed' ? '打印件' : p.kind === 'fastener' ? '紧固件' : '外购尺寸包络'}</div><h3>${p.label}</h3><span class="part-id">${p.id}</span><div class="part-dimensions">${p.size.map(n=>n.toFixed(1)).join(' × ')} <small>mm</small></div><div class="part-metrics"><span>${p.triangles.toLocaleString()} 三角面</span><span>数量 ${p.quantity}</span></div><div class="inspector-actions"><button class="button" data-action="isolate">${icon('box',14)}${state.isolated ? '显示全部' : '独立查看'}</button><button class="button" data-action="focus-selected">${icon('focus',14)}聚焦</button></div>${p.printFile ? `<a class="print-link" href="${p.printFile}" download>${icon('download',13)}下载打印姿态 STL</a>` : '<p class="small muted">购买前核对型号、尺寸和固定方式。</p>'}`;
}

function bookmarks() { try { const value = JSON.parse(localStorage.getItem('tl-v3-bookmarks') || '[]'); return Array.isArray(value) ? value.slice(0, 6) : []; } catch { return []; } }
function renderBookmarks() {
  const list = bookmarks(), host = $('#bookmarks'); host.innerHTML = '';
  if (!list.length) { host.innerHTML = '<span class="small muted">保存当前构图，之后一键恢复。</span>'; return; }
  list.forEach((view, index) => {
    const row = document.createElement('div'); row.className = 'bookmark-row';
    const load = document.createElement('button'); load.textContent = `视角 ${index+1} · ${Number(view.state?.lid || 0).toFixed(0)}°`;
    load.addEventListener('click', () => {try{restoreView(view);}catch(e){notice(`无法载入视角：${e.message}`);}});
    const remove = document.createElement('button'); remove.className = 'icon-button'; remove.innerHTML = icon('close',12); remove.setAttribute('aria-label', `删除视角 ${index+1}`);
    remove.addEventListener('click',()=>{ const items=bookmarks();items.splice(index,1);localStorage.setItem('tl-v3-bookmarks',JSON.stringify(items));renderBookmarks(); });
    row.append(load,remove);host.append(row);
  });
}

function viewConfig() { return { version: 3, units: 'mm', state: { ...state, hidden: [...state.hidden] }, camera: scene.cameraState(), sourceSHA256: manifest.sourceSHA256 }; }
function restoreView(view) {
  if(busy||recording){notice('请等待当前导出或录制完成');return;}
  if(view?.camera&&!sanitizeCamera(view.camera))throw new Error('相机配置无效：需要完整坐标和有效缩放范围');
  stopMotion(); state = sanitizeSettings(view.state || view); scene.setProjection(state.projection); apply({ tree: true });
  if (view.camera) scene.restoreCamera(view.camera); else scene.frame();
}

function scheduleDrawing() { clearTimeout(drawTimer); drawTimer = setTimeout(() => generateDrawing().catch(e=>notice(e.message)), 180); }
async function generateDrawing() {
  if (!scene) return '';
  const revision=++drawRevision;
  $('#drawing-paper').classList.add('updating');
  await new Promise(resolve=>requestAnimationFrame(resolve));
  try {
    const svg=buildDrawing(scene.snapshot(), { ...state, title: $('#drawing-title').value });
    if (revision === drawRevision) { cachedDrawing=svg; $('#drawing-paper').innerHTML=svg; $('#drawing-paper').classList.remove('updating'); }
    return svg;
  } catch (e) { $('#drawing-paper').classList.remove('updating'); $('#drawing-paper').textContent=e.message; throw e; }
}

const imageSettings = () => [...$('#export-resolution').value.split(',').map(Number), $('#transparent').checked];
async function task(label, fn) {
  if (busy || recording) { notice('请等待当前导出完成'); return; }
  busy = true; const wasPlaying = Boolean(player?.playing); stopMotion();
  const controlsEnabled=scene.controls.enabled;scene.controls.enabled=false;
  document.body.classList.add('exporting'); notice(label,0);
  try { await fn(); notice('已生成下载文件'); }
  catch(e) { console.error(e); notice(e.message || '导出失败',6500); }
  finally {busy=false;scene.controls.enabled=controlsEnabled;document.body.classList.remove('exporting');if(wasPlaying && player)player.playing=true;syncControls();}
}

function beginMotion(kind) {
  if (!scene || busy) return;
  if(state.mode==='drawing'){state.mode='studio';syncControls();scene.resize();}
  stopMotion(); motionKind=kind;phase=0;
  const initial=motionPose(0,kind);state.explode=0;
  // Fit the opened extent once so the lid stays in frame throughout the cycle.
  Object.assign(state,{lid:105,travel:0});scene.apply();scene.frame();
  Object.assign(state,initial);apply({drawing:false});
  player={kind,playing:true,duration:kind==='cycle'?10000:5000};
  syncControls();
}

async function recordMotion() {
  if(recording){recording.stop();return;}
  if(busy)return;
  const saved=viewConfig();
  try {
    state.mode='studio';syncControls();scene.resize();beginMotion('cycle');
    recording=startRecording(scene.renderer.domElement);
    $$('[data-action="record"]').forEach(b=>{b.classList.add('recording');b.innerHTML=`${icon('video',15)}<span>停止录制</span>`;});
    notice('正在录制一次完整运动；可调整镜头，点击「停止录制」提前结束',0);
    const blob=await recording.done;
    saveBlob(blob,'TetherLock-V3-motion.webm');notice('运动 WebM 已生成');
  } catch(e){console.error(e);notice(e.message,6500);}
  finally{recording=null;restoreView(saved);$$('[data-action="record"]').forEach(b=>{b.classList.remove('recording');b.innerHTML=`${icon('video',15)}<span>录制</span>`;});}
}

const actions = {
  'info':()=>$('#help-dialog').showModal(),'close-help':()=>$('#help-dialog').close(),
  'focus':()=>scene.frame(),'focus-selected':()=>scene.frame(state.selected),
  'reset':()=>{stopMotion();state=sanitizeSettings(defaults);phase=0;scene.clearMeasurements();scene.setProjection(state.projection);apply({tree:true});scene.preset('iso');},
  'show-all':()=>{state.hidden=[];state.isolated=null;apply({tree:true});},
  'isolate':()=>{state.isolated=state.isolated?null:state.selected;apply({tree:true});scene.frame();},
  'ruler':()=>{state.measure=!state.measure;scene.pendingMeasure=null;apply({drawing:false});},
  'clear-measures':()=>scene.clearMeasurements(),
  'open-motion':()=>beginMotion('open'),'close-motion':()=>beginMotion('close'),
  'play':()=>{if(player && phase<1){player.playing=!player.playing;syncControls();}else beginMotion('cycle');},
  'record':recordMotion,
  'bookmark':()=>{try{const list=bookmarks();if(list.length>=6)list.shift();list.push(viewConfig());localStorage.setItem('tl-v3-bookmarks',JSON.stringify(list));renderBookmarks();notice('当前构图与设置已保存');}catch{notice('此浏览器不允许保存本地视角');}},
  'zoom-in':()=>{drawingZoom=Math.min(3,drawingZoom+.25);$('#drawing-paper').style.width=`${drawingZoom*100}%`;$('#drawing-zoom').textContent=`${Math.round(drawingZoom*100)}%`;},
  'zoom-out':()=>{drawingZoom=Math.max(.5,drawingZoom-.25);$('#drawing-paper').style.width=`${drawingZoom*100}%`;$('#drawing-zoom').textContent=`${Math.round(drawingZoom*100)}%`;},
  'refresh-drawing':()=>generateDrawing(),
  'quick-export':()=>state.mode==='assembly'?assembly.action('image'):state.mode==='drawing'?actions['export-drawing-png']():actions['export-png'](),
  'export-png':()=>task('正在生成高清 PNG…',async()=>saveBlob(await capturePNG(scene,...imageSettings()),'TetherLock-V3-preview.png')),
  'export-views':()=>task('正在生成五个视角…',async()=>saveBlob(await exportViews(scene,imageSettings(),m=>notice(m,0)),'TetherLock-V3-views.zip')),
  'export-svg':()=>engineering?.section==='blueprints'?engineering.export('svg'):task('正在生成矢量工程参考图…',async()=>saveBlob(new Blob([cachedDrawing || await generateDrawing()],{type:'image/svg+xml'}),'TetherLock-V3-drawing.svg')),
  'export-drawing-png':()=>engineering?.section==='blueprints'?engineering.export('png'):task('正在生成工程图 PNG…',async()=>saveBlob(await drawingPNG(cachedDrawing||await generateDrawing()),'TetherLock-V3-drawing.png')),
  'print':()=>{if(engineering?.section==='blueprints'){engineering.export('print');return;}if(cachedDrawing)printDrawing(cachedDrawing);else{state.mode='drawing';apply();notice('图纸生成后，再点击打印 / 保存 PDF');}},
  'export-glb':()=>task('正在生成可见模型 GLB…',async()=>saveBlob(await exportGLB(scene,state.includeReferences),'TetherLock-V3-pose.glb')),
  'save-settings':()=>saveBlob(new Blob([JSON.stringify(viewConfig(),null,2)],{type:'application/json'}),'TetherLock-V3-view.json'),
  'import-settings':()=>$('#settings-file').click(),
  'share':async()=>{const hash=btoa(JSON.stringify(viewConfig()));const url=new URL(location.href);url.hash='view='+hash;try{await navigator.clipboard.writeText(url.href);notice('当前视图链接已复制；同一预览站点即可恢复');}catch{saveBlob(new Blob([url.href],{type:'text/plain'}),'TetherLock-V3-view-link.txt');}},
  'toggle-parts':()=>{document.body.classList.toggle('show-parts');document.body.classList.remove('show-settings');},
  'toggle-settings':()=>{document.body.classList.toggle('show-settings');document.body.classList.remove('show-parts');},
};

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(busy&&!button.dataset.tab){notice('导出中，当前构图和姿态已固定');return;}
  if(recording&&!button.dataset.camera&&!button.dataset.tab&&!button.dataset.style&&
    !['record','focus','toggle-settings','toggle-parts','info','close-help'].includes(button.dataset.action)){
    notice('录制期间保持完整运动；可调整镜头或点击「停止录制」');return;
  }
  if(button.dataset.action){if(!scene && !['info','close-help'].includes(button.dataset.action))return;try{const result=actions[button.dataset.action]?.();result?.catch?.(e=>notice(e.message));}catch(e){notice(e.message);}return;}
  if(button.dataset.mode){switchMode(button.dataset.mode);return;}
  if(button.dataset.tab){currentTab=button.dataset.tab;$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));$$('[data-page]').forEach(p=>p.hidden=p.dataset.page!==currentTab);return;}
  if(button.dataset.camera){scene.preset(button.dataset.camera);$$('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===button.dataset.camera));return;}
  if(button.dataset.part){selectPart(button.dataset.part);return;}
  if(button.dataset.hide){const id=button.dataset.hide;state.hidden=state.hidden.includes(id)?state.hidden.filter(x=>x!==id):[...state.hidden,id];apply({tree:true});return;}
  if(button.dataset.group){event.preventDefault();const ids=manifest.parts.filter(p=>p.group===button.dataset.group).map(p=>p.id);const hidden=ids.every(id=>state.hidden.includes(id));state.hidden=hidden?state.hidden.filter(id=>!ids.includes(id)):[...new Set([...state.hidden,...ids])];apply({tree:true});return;}
  if(button.dataset.filter){filter=button.dataset.filter;$$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderTree();return;}
  if(button.dataset.style){state.style=button.dataset.style;apply({drawing:false});return;}
  if(button.dataset.clipAxis){state.clipAxis=button.dataset.clipAxis;state.clipValue=state.clipAxis==='X'?72:state.clipAxis==='Y'?0:32;apply({drawing:false});return;}
  if(button.dataset.pose){stopMotion();phase=0;state.isolated=null;Object.assign(state,button.dataset.pose==='open'?{lid:105,travel:0,explode:0}:button.dataset.pose==='exploded'?{lid:0,travel:0,explode:1}:{lid:0,travel:14,explode:0});apply({tree:true});scene.preset('iso');}
});

document.addEventListener('input',event=>{
  const input=event.target;
  if(busy||recording&&input.dataset.setting!=='speed'){syncControls();return;}
  if(input.id==='part-search'){search=input.value.trim().toLowerCase();renderTree();return;}
  if(input.id==='drawing-title'){cachedDrawing='';if(state.mode==='drawing')scheduleDrawing();return;}
  const key=input.dataset.setting;if(!key)return;
  if(key==='timeline'){stopMotion();phase=Number(input.value)/1000;Object.assign(state,motionPose(phase,motionKind));state.explode=0;apply();return;}
  const value=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
  if(key==='lid'||key==='travel'){stopMotion();Object.assign(state,controlPose(state,key,value));}
  else{state[key]=value;if(key==='explode')stopMotion();}
  if(key==='projection')scene.setProjection(value);
  apply({drawing:!['opacity','edges','grid','labels','reference','clip','clipAxis','clipValue','clipReverse','speed','loop','measure'].includes(key)});
});

$('#settings-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>200000)throw new Error('视图文件过大');const settings=JSON.parse(await file.text());if(busy||recording)throw new Error('请等待当前导出或录制完成');restoreView(settings);notice('视图配置已载入');}catch(e){notice(`无法载入视图：${e.message}`);}event.target.value='';
});
$('#help-dialog').addEventListener('click',event=>{if(event.target===$('#help-dialog'))$('#help-dialog').close();});
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||event.ctrlKey||event.metaKey||event.altKey||!scene||$('#help-dialog').open)return;
  const key=event.key.toLowerCase();
  if(busy)return;
  if(recording&&!['1','2','3','4','5','6','f'].includes(key)){if(key===' ')event.preventDefault();return;}
  if(['1','2','3','4','5','6'].includes(key)){scene.preset(['iso','top','front','right','back','bottom'][Number(key)-1]);return;}
  if(state.mode==='assembly'){if(key===' '){event.preventDefault();assembly.action('play');}else if(key==='f')assembly.action('focus');else if(key==='e')assembly.action('image');return;}
  if(key===' '){event.preventDefault();actions.play();}else if(key==='f')actions.focus();else if(key==='m')actions.ruler();else if(key==='e')actions['quick-export']();else if(key==='/'){event.preventDefault();$('#part-search').focus();}else if(key==='escape'){state.isolated=null;state.selected=null;state.measure=false;scene.pendingMeasure=null;document.body.classList.remove('show-parts','show-settings');apply({tree:true});}
});

async function boot() {
  try {
    const response=await fetch(new URL('manifest.json',document.baseURI));
    if(!response.ok)throw new Error('模型清单未生成，请在仓库运行 npm run assets');
    manifest=await response.json();$('#part-count').textContent=manifest.parts.length;
    if(!manifest.cadPackageCurrent)for(const link of $$('a[href="downloads/TetherLock-V3-CAD.zip"]')){link.removeAttribute('href');link.removeAttribute('download');link.title='CAD交付包正在更新，当前旧包不提供下载';link.setAttribute('aria-disabled','true');}
    scene=new WorkbenchScene($('#viewport'),manifest,{getState:()=>assembly?.active?assembly.state:state,onPick:id=>{if(assembly?.active){assembly.state.selected=id;scene.applyMaterials();}else selectPart(id);},canInteract:()=>!busy,
      onMeasure:message=>{$('#measurement-status').textContent=message;notice(message);},
      onProgress:(done,total)=>{$('#loading-status').textContent=`${done} / ${total} 个分件 · 验证文件指纹`;$('#load-progress').style.width=`${done/total*100}%`;}});
    await scene.load();
    const dataResponse=await fetch(new URL('engineering.json',document.baseURI));
    if(!dataResponse.ok)throw new Error('工程物料资料未生成，请运行 npm run assets');
    const data=await dataResponse.json();
    if(Object.keys(data.sourceSHA256).length!==Object.keys(manifest.sourceSHA256).length||Object.entries(data.sourceSHA256).some(([id,sha])=>manifest.sourceSHA256[id]!==sha))throw new Error('工程资料与模型CAD版本不一致，请重新生成资源');
    engineering=new EngineeringPanel($('#drawing-workspace'),data,{
      notice,openPart:id=>{if(!manifest.parts.some(p=>p.id===id)){notice('试块不属于正式总装，可从打印清单下载STL');return;}switchMode('studio');state.hidden=[];state.isolated=null;selectPart(id);scene.resize();scene.frame(id);},
      openDrawing:id=>{switchMode('drawing');engineering.openDrawing(id);},
      openStep:id=>{switchMode('assembly');assembly.select(id);},
    });
    await engineering.load(scene);
    assembly=new AssemblyGuide($('#assembly-workspace'),data,scene,{notice,openMaterial:id=>{switchMode('drawing');engineering.openMaterial(id);},openDrawing:id=>{switchMode('drawing');engineering.openDrawing(id);}},engineering.font);
    $('#loading').hidden=true;
    $('#source-stats').textContent=`${manifest.checks.toLocaleString()}项几何检查 / ${manifest.parts.length}分件`;
    $('#status').textContent=`${manifest.parts.length}个分件就绪 · ${manifest.parts.reduce((sum,p)=>sum+p.triangles,0).toLocaleString()}面`;
    renderTree();renderBookmarks();syncControls();
    if(initialHash.startsWith('#view=')){try{restoreView(JSON.parse(atob(initialHash.slice(6))));}catch{notice('视图链接无效，已载入默认总装');}}
    let last=performance.now(),frameCount=0;
    const animate=now=>{
      requestAnimationFrame(animate);const delta=Math.min(100,now-last);last=now;
      if(scene.capturing)return;
      if(player?.playing&&!busy){
        phase=clamp(phase+delta/player.duration*state.speed,0,1);
        Object.assign(state,motionPose(phase,player.kind));scene.apply({section:++frameCount%4===0});syncControls();cachedDrawing='';
        if(phase>=1){if(recording){player.playing=false;recording.stop();}else if(state.loop&&player.kind==='cycle'){phase=0;}else{player.playing=false;syncControls();}}
      }
      if(state.mode==='assembly')assembly.tick(delta);else if(state.mode==='studio')scene.render();
    };
    requestAnimationFrame(animate);
  } catch(error) {
    console.error(error);$('#loading').innerHTML=`${icon('info',30)}<strong>预览无法载入</strong><span id="boot-error"></span><button class="button" onclick="location.reload()">重新加载</button>`;
    $('#boot-error').textContent=error.message;$('#status').textContent='资源或WebGL加载失败';
  }
}
boot();
