import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { sliceMesh, pointInSection, sectionPath } from '../../viewer/src/sections.js';
test('real box section forms a closed loop, and combined inner loops produce holes',()=>{
  const outer=new BoxGeometry(10,8,6).toNonIndexed().getAttribute('position').array;
  const inner=new BoxGeometry(4,2,6).toNonIndexed().getAttribute('position').array;
  const section=sliceMesh([...outer,...inner],'Z',0);
  assert.equal(section.loops.length,2);assert.equal(section.closed,true);
  assert.equal(pointInSection([4,0],section.loops),true);assert.equal(pointInSection([0,0],section.loops),false);assert.equal(pointInSection([7,0],section.loops),false);
  assert.equal((sectionPath(section).match(/Z/g)||[]).length,2);
});
test('open triangle soups cannot masquerade as complete manufacturing sections',()=>{
  assert.throws(()=>sliceMesh([0,0,-1,1,0,1,0,1,1],'Z',0),/未闭合|分叉/);
});
