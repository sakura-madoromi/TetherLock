// Mesh projections in actual CAD millimeters. Feature-line visibility uses a
// sampled orthographic depth buffer. This is a reference drawing, not B-rep CAD.
const bases = {
  top: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  front: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  right: [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  iso: [[-.707107, .707107, 0], [-.408248, -.408248, .816497], [.57735, .57735, .57735]],
};
const dot = (p, v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
// Feature edges alone omit smooth surfaces. Adjacent front/back facing triangles
// provide the view-dependent silhouette of rounded corners and cylinders.
function silhouetteEdges(positions, normal) {
  const shared=new Map();
  const key=p=>p.map(n=>Math.round(n*10000)).join(',');
  for(let i=0;i+8<positions.length;i+=9){
    const a=Array.from(positions.slice(i,i+3)),b=Array.from(positions.slice(i+3,i+6)),c=Array.from(positions.slice(i+6,i+9));
    const u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
    const d=dot([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],normal);
    const face=d>1e-8?1:d< -1e-8?-1:0;
    for(const [p,q] of [[a,b],[b,c],[c,a]]){
      const kp=key(p),kq=key(q),id=kp<kq?`${kp}|${kq}`:`${kq}|${kp}`;
      const item=shared.get(id)||{p,q,positive:false,negative:false,parallel:false};
      item.positive||=face>0;item.negative||=face<0;item.parallel||=face===0;shared.set(id,item);
    }
  }
  const result=[];
  for(const edge of shared.values())if(edge.positive&&edge.negative||edge.parallel&&(edge.positive||edge.negative))result.push(...edge.p,...edge.q);
  return result;
}
export const escapeXML = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
export function measureExtent(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of meshes) for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]);
  }
  if (!Number.isFinite(min[0])) throw new Error('没有可见零件，无法生成工程视图');
  return { min, max, size: max.map((n, i) => n - min[i]) };
}
export function projectView(meshes, view, { resolution = 620 } = {}) {
  const basis = bases[view] || bases.top;
  const convert = p => basis.map(v => dot(p, v));
  const vertices = meshes.map(m => {
    const p = [];
    for (let i = 0; i < m.positions.length; i += 3) p.push(convert(m.positions.slice(i, i + 3)));
    return p;
  });
  const all = vertices.flat(), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of all) for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = hi.map((v, k) => Math.max(0.01, v - lo[k]));
  const pixel = Math.max(...size) / resolution;
  const w = Math.ceil(size[0] / pixel) + 5, h = Math.ceil(size[1] / pixel) + 5;
  const depth = new Float32Array(w * h).fill(-Infinity);
  const raster = p => [(p[0] - lo[0]) / pixel + 2, (p[1] - lo[1]) / pixel + 2, p[2]];
  for (let m = 0; m < vertices.length; m++) {
    if (meshes[m].transparent) continue;
    const points = vertices[m];
    for (let i = 0; i + 2 < points.length; i += 3) {
      const [a, b, c] = points.slice(i, i + 3).map(raster);
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-7) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
        const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
        if (u >= -0.002 && v >= -0.002 && u + v <= 1.002) {
          const z = u * a[2] + v * b[2] + (1 - u - v) * c[2];
          const index = y * w + x; if (z > depth[index]) depth[index] = z;
        }
      }
    }
  }
  const visible = [], hidden = [];
  const test = p => {
    const q = raster(p), x = Math.round(q[0]), y = Math.round(q[1]);
    // A small world-space tolerance covers boundary rasterization.
    return x < 0 || x >= w || y < 0 || y >= h || q[2] >= depth[y * w + x] - Math.max(0.12, pixel * 0.7);
  };
  for (const mesh of meshes) {
    const e = [...(mesh.edges || []),...silhouetteEdges(mesh.positions,basis[2])];
    for (let i = 0; i + 5 < e.length; i += 6) {
      const a = convert(e.slice(i, i + 3)), b = convert(e.slice(i + 3, i + 6));
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (pixel * 1.5)));
      let from = a, wasVisible = test(a);
      for (let j = 1; j <= count; j++) {
        const p = a.map((n, k) => n + (b[k] - n) * j / count);
        const nextVisible = test(p);
        if (nextVisible !== wasVisible) {
          (wasVisible ? visible : hidden).push([from, p]); from = p; wasVisible = nextVisible;
        }
        if (j === count) (wasVisible ? visible : hidden).push([from, b]);
      }
    }
  }
  return { visible, hidden, min: lo, max: hi, size };
}
const f = n => Number(n).toFixed(2);
export function buildDrawing(meshes, { title = 'TetherLock V3', lid = 0, travel = 0, explode = 0, hiddenLines = false } = {}) {
  const extent = measureExtent(meshes);
  const views = Object.fromEntries(Object.keys(bases).map(v => [v, projectView(meshes, v)]));
  const fit = Math.min(240 / views.top.size[0], 118 / views.top.size[1], 58 / views.front.size[1], 120 / views.right.size[0]);
  const scale = [1, 0.5, 0.25, 0.2, 0.1, 0.05].find(s => s <= fit + 0.00001) || Math.max(0.001, fit);
  const date = new Date().toISOString().slice(0, 10);
  const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297">',
    '<rect width="420" height="297" fill="white"/><g font-family="Arial, Noto Sans CJK SC, sans-serif" fill="#202b36">',
    '<rect x="7" y="7" width="406" height="283" fill="none" stroke="#435366" stroke-width=".3"/>',
    `<text x="16" y="19" font-size="5.2" font-weight="bold">${escapeXML(title)} / 结构参考图</text>`,
    '<text x="406" y="19" text-anchor="end" font-size="2.8">V3 · mm · A3 横向</text>'];
  const dimension = (x0, y0, x1, y1, label, vertical = false) => {
    const nx = vertical ? 12 : 0, ny = vertical ? 0 : -9;
    svg.push(`<path d="M${f(x0)} ${f(y0)}l${nx} ${ny} M${f(x1)} ${f(y1)}l${nx} ${ny} M${f(x0+nx)} ${f(y0+ny)}L${f(x1+nx)} ${f(y1+ny)}" fill="none" stroke="#52687b" stroke-width=".18"/>`);
    const cx = (x0+x1)/2+nx, cy=(y0+y1)/2+ny;
    svg.push(`<text x="${f(cx)}" y="${f(cy-1.5)}" font-size="3" text-anchor="middle"${vertical ? ` transform="rotate(-90 ${f(cx)} ${f(cy)})"` : ''}>${f(label)}</text>`);
  };
  function panel(name, cx, cy, width, height, customScale) {
    const v = views[name], s = customScale || scale;
    const ox = cx + (width-v.size[0]*s)/2, oy = cy+(height-v.size[1]*s)/2;
    const point = p => [ox+(p[0]-v.min[0])*s, oy+(v.max[1]-p[1])*s];
    const path = lines => lines.map(([a,b]) => { const q=point(a),r=point(b); return `M${f(q[0])},${f(q[1])}L${f(r[0])},${f(r[1])}`; }).join('');
    if (hiddenLines) svg.push(`<path d="${path(v.hidden)}" fill="none" stroke="#99a4b0" stroke-width=".12" stroke-dasharray="1.1 .8"/>`);
    svg.push(`<path d="${path(v.visible)}" fill="none" stroke="#293746" stroke-width=".18" stroke-linecap="round"/>`);
    const label = {top:'俯视 / +Z',front:'前视 / +Y',right:'侧视 / +X',iso:'等轴测'}[name];
    svg.push(`<text x="${cx}" y="${cy+height+5}" font-size="3.2">${label}${name==='iso' ? ` · 1:${f(1/s)}` : ''}</text>`);
    if (name !== 'iso') {
      dimension(ox,oy,ox+v.size[0]*s,oy,v.size[0]);
      dimension(ox+v.size[0]*s,oy,ox+v.size[0]*s,oy+v.size[1]*s,v.size[1],true);
    }
  }
  panel('top',20,42,240,118);
  panel('front',20,191,240,58);
  panel('right',279,191,120,58);
  const isoScale=Math.min(120/views.iso.size[0],118/views.iso.size[1]);
  panel('iso',279,42,120,118,Math.min(0.5,isoScale));
  svg.push('<path d="M7 266H413 M278 266V290 M347 266V290" fill="none" stroke="#435366" stroke-width=".25"/>',
    `<text x="13" y="273" font-size="3.2">可见件包络：${extent.size.map(n=>n.toFixed(1)).join(' × ')} mm</text>`,
    `<text x="13" y="280" font-size="2.8">当前姿态：盖 ${Number(lid).toFixed(1)}° / 栓 ${Number(travel).toFixed(1)} mm / 拆解 ${Math.round(explode*100)}%</text>`,
    '<text x="13" y="286" font-size="2.6">STL特征线与采样遮挡投影；未标制造公差。剖切不应用于此三视图；透明窗只显示轮廓。</text>',
    `<text x="284" y="274" font-size="3">比例 1:${f(1/scale)}</text><text x="284" y="282" font-size="2.8">${date}</text>`,
    `<text x="353" y="274" font-size="3">TL–V3–REF</text><text x="353" y="282" font-size="2.8">${meshes.length} 个可见件 · 1 / 1</text>`,
    '</g></svg>');
  return svg.join('\n');
}
