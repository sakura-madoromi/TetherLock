import { test } from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../../viewer/src/state.js').catch(() => ({}));

test('opening and locking controls keep the bolt out of an open lid', () => {
  assert.equal(typeof api.controlPose, 'function', 'V3 motion controls are not implemented');
  assert.deepEqual(api.controlPose({ lid: 0, travel: 14 }, 'lid', 60), { lid: 60, travel: 0 });
  assert.deepEqual(api.controlPose({ lid: 60, travel: 0 }, 'travel', 14), { lid: 0, travel: 14 });
});

test('the complete cycle never opens while the bolt is engaged', () => {
  assert.equal(typeof api.motionPose, 'function', 'V3 coordinated motion is not implemented');
  for (let i = 0; i <= 1000; i++) {
    const pose = api.motionPose(i / 1000, 'cycle');
    assert.ok(pose.lid >= 0 && pose.lid <= 105);
    assert.ok(pose.travel >= 0 && pose.travel <= 14);
    assert.ok(pose.lid === 0 || pose.travel === 0, `unsafe cycle at ${i}`);
  }
  assert.deepEqual(api.motionPose(0, 'cycle'), { lid: 0, travel: 14 });
  assert.deepEqual(api.motionPose(1, 'open'), { lid: 105, travel: 0 });
  assert.deepEqual(api.motionPose(1, 'close'), { lid: 0, travel: 14 });
});

test('lid rotation keeps the actual hinge stationary and raises the front', () => {
  assert.equal(typeof api.transformPoint, 'function', 'CAD transforms are not implemented');
  const hinge = api.transformPoint([20, -55, 51], 'lid', { lid: 90, travel: 0, explode: 0 });
  assert.deepEqual(hinge, [20, -55, 51]);
  const front = api.transformPoint([0, 60, 51], 'lid', { lid: 90, travel: 0, explode: 0 });
  assert.ok(Math.abs(front[1] + 55) < 1e-8);
  assert.ok(Math.abs(front[2] - 166) < 1e-8);
  assert.deepEqual(api.transformPoint([103, 5, 38], 'drive', { lid: 0, travel: 14, explode: 0 }), [103, 19, 38]);
});

test('restored settings reject unsafe or non-finite pose data', () => {
  assert.equal(typeof api.sanitizeSettings, 'function', 'view settings validation is not implemented');
  const clean = api.sanitizeSettings({ lid: 300, travel: 14, explode: NaN, clipAxis: 'W', hidden: ['base_box', 9] });
  assert.equal(clean.lid, 105);
  assert.equal(clean.travel, 0);
  assert.equal(clean.explode, 0);
  assert.equal(clean.clipAxis, 'Z');
  assert.deepEqual(clean.hidden, ['base_box']);
});

test('imported camera requires complete finite vectors and a useful viewing volume', () => {
  assert.equal(typeof api.sanitizeCamera, 'function');
  const good={position:[290,350,270],target:[0,0,25],zoom:1,orthoHeight:310};
  assert.deepEqual(api.sanitizeCamera(good),good);
  for(const invalid of [{...good,position:[]},{...good,target:[0,0]},
    {...good,position:[Infinity,0,0]},{...good,zoom:1e100},{...good,orthoHeight:-10},
    {...good,position:good.target},null]) assert.equal(api.sanitizeCamera(invalid),null);
});

test('old view configurations enable both independent reference defaults and exclude them from GLB', () => {
  const old=api.sanitizeSettings({reference:false});
  assert.equal(old.phone,true);assert.equal(old.card,true);assert.equal(old.includeReferences,false);
  const separate=api.sanitizeSettings({phone:false,card:true,includeReferences:true});
  assert.equal(separate.phone,false);assert.equal(separate.card,true);assert.equal(separate.includeReferences,true);
  assert.equal(api.sanitizeSettings({phone:'false',card:0}).phone,true);
});
