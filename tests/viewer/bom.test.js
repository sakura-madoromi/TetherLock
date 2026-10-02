import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterMaterials, materialsCSV, printableMaterials } from '../../viewer/src/bom.js';
const data=JSON.parse(readFileSync('artifacts/v3/engineering/data.json'));
test('material master covers CAD print files, canonical screw counts and excluded accessories',()=>{
  assert.equal(data.parts.length,19);
  const screws=data.materials.filter(r=>r.id.startsWith('screw-'));
  assert.equal(screws.reduce((n,r)=>n+r.installedQuantity,0),data.connections.length);
  for(const r of data.materials.filter(r=>['coupons','tools','spares'].includes(r.category)))assert.equal(r.installedQuantity,0);
  assert.ok(!data.materials.some(r=>r.id.includes('reference')||r.id.includes('window_pad')));
  assert.ok(data.unresolved.length>0);assert.ok(data.costs.device>100);
});
test('BOM searches specs and keeps categories separate',()=>{
  assert.ok(filterMaterials(data.materials,'149×82','purchased').some(r=>r.id==='acrylic'));
  assert.equal(filterMaterials(data.materials,'','print').length,19);
  assert.equal(filterMaterials(data.materials,'not-a-real-item').length,0);
});
test('complete CSV preserves provenance and printable table has repeated headers and explicit unverified items',()=>{
  const csv=materialsCSV(data);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes(data.cadFingerprint));assert.ok(csv.includes('battery_protection'));
  const paper=printableMaterials(data);assert.ok(paper.includes('table-header-group'));assert.ok(paper.includes('break-inside:avoid'));assert.ok(paper.includes('未解决'));assert.ok(paper.includes('待报价'));
});
