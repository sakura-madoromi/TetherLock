import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AssemblyProgress, progressSignature } from '../../apps/workbench/src/assembly-progress.js';
import { pathOffset } from '../../apps/workbench/src/assembly.js';
const data=JSON.parse(readFileSync('assets/cad/v3/engineering.json'));
const storage=()=>{const store=new Map();return {getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};};
test('manual completion requires all checks, revokes on unchecking and survives reload',()=>{
 const db=storage(),p=new AssemblyProgress(data,db),s=data.assembly.steps[0];assert.throws(()=>p.complete(s.id),/人工确认/);
 for(const c of s.checks)p.check(c.id,true);assert.deepEqual(p.record.completed,[]);p.complete(s.id);assert.deepEqual(new AssemblyProgress(data,db).record.completed,[s.id]);p.check(s.checks[0].id,false);assert.deepEqual(p.record.completed,[]);
});
test('changed CAD/step fingerprints retain old records without adopting their completion',()=>{
 const db=storage(),p=new AssemblyProgress(data,db),s=data.assembly.steps[0];for(const c of s.checks)p.check(c.id,true);p.complete(s.id);
 const changed={...data,cadFingerprint:'new-cad'},q=new AssemblyProgress(changed,db);assert.equal(q.archived,1);assert.deepEqual(q.record.completed,[]);assert.ok(q.export().records[progressSignature(data)]);
 q.import(p.export());assert.deepEqual(q.record.completed,[]);assert.equal(q.archived,1);
});
test('denied persistence and malformed imports preserve usable current records',()=>{
 const p=new AssemblyProgress(data,{getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('denied')}});p.check(data.assembly.steps[0].checks[0].id,true);assert.equal(p.persistent,false);const before=structuredClone(p.record);assert.throws(()=>p.import({schema:1,records:{bad:{}}}),/缺少/);assert.deepEqual(p.record,before);
});
test('piecewise paths follow verified segments, never cut the keeper pocket corner',()=>{
 const a=data.assembly.steps.find(s=>s.id==='M03').animation;assert.deepEqual(pathOffset(a,0),[0,0,0]);assert.deepEqual(pathOffset(a,.25),[0,10,0]);assert.deepEqual(pathOffset(a,.5),[0,10,10]);assert.deepEqual(pathOffset(a,1),[0,10,30]);
});
