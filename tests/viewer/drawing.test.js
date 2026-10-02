import { test } from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../../viewer/src/drawing.js').catch(() => ({}));

test('engineering extent is measured from geometry, including a changed pose', () => {
  assert.equal(typeof api.measureExtent, 'function', 'engineering geometry projection is not implemented');
  const mesh = { positions: [-120, -60, 0, 120, 60, 55, 0, 0, 5] };
  assert.deepEqual(api.measureExtent([mesh]).size, [240, 120, 55]);
  const open = { positions: [-120, -60, 0, 120, 60, 166] };
  assert.deepEqual(api.measureExtent([open]).size, [240, 120, 166]);
});

test('geometry projection hides rear edges rather than showing a wireframe', () => {
  assert.equal(typeof api.projectView, 'function', 'engineering depth projection is not implemented');
  const mesh = { positions: [-10,-10,2, 10,-10,2, 10,10,2, -10,-10,2, 10,10,2, -10,10,2],
    edges: [-5,0,0, 5,0,0, -10,-10,2, 10,-10,2] };
  const r = api.projectView([mesh], 'top', { resolution: 100 });
  assert.ok(r.visible.length > 0);
  assert.ok(r.hidden.length > 0);
});

test('drawing SVG preserves mm dimensions, escapes titles and has no external assets', () => {
  assert.equal(typeof api.buildDrawing, 'function', 'engineering SVG export is not implemented');
  const mesh = { positions: [-120,-60,0, 120,-60,0, 120,60,55], edges: [-120,-60,0, 120,-60,0] };
  const svg = api.buildDrawing([mesh], { title: '<script>unsafe</script>', lid: 0, travel: 14 });
  assert.ok(svg.includes('width="420mm"'));
  assert.ok(svg.includes('240.0'));
  assert.ok(svg.includes('120.0'));
  assert.ok(svg.includes('55.0'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('https://'));
});

test('smooth cylindrical sides retain both visible silhouette lines without sharp feature edges', () => {
  const n=64;
  for(const offset of [0,Math.PI/n]){
  const positions=[];
  for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n+offset,b=(i+1)*2*Math.PI/n+offset;
    const p=[10*Math.cos(a),10*Math.sin(a)],q=[10*Math.cos(b),10*Math.sin(b)];
    positions.push(...p,0,...q,0,...q,20,...p,0,...q,20,...p,20);
  }
  const r=api.projectView([{positions,edges:[]}],'front');
  for(const x of [-10*Math.cos(offset),10*Math.cos(offset)]) assert.ok(r.visible.some(([a,b])=>Math.abs(a[0]-x)<.01&&Math.abs(b[0]-x)<.01&&Math.abs(a[1]-b[1])>19.9));
  }
});
