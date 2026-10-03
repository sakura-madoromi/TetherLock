import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,resource,hash,prepare} from '../../scripts/assets/prepare.mjs';

fs.mkdirSync(path.join(root,'generated/tests'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'generated/tests/resources-'));
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
function fixture(name,bytes) {
  const file=path.join(directory,name);fs.writeFileSync(file,bytes);return path.relative(root,file);
}
test('resource preparation rejects unhydrated LFS pointers',()=>{
  const file=fixture('pointer.stl',`version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 42\n`);
  assert.throws(()=>resource(file),/LFS pointer is not hydrated.*git lfs pull/);
});
test('resource preparation verifies both content and size',()=>{
  const bytes=Buffer.from('verified geometry'),file=fixture('mesh.stl',bytes);
  assert.deepEqual(resource(file,{sha256:hash(bytes),bytes:bytes.length}),bytes);
  assert.throws(()=>resource(file,{sha256:'a'.repeat(64),bytes:bytes.length}),/hash\/size mismatch/);
  assert.throws(()=>resource(file,{sha256:hash(bytes),bytes:bytes.length+1}),/hash\/size mismatch/);
});
test('missing resources produce an actionable error',()=>{
  assert.throws(()=>resource(path.relative(root,path.join(directory,'missing.stl'))),/Missing resource.*git lfs pull/);
});
test('resource paths cannot escape the repository',()=>{
  assert.throws(()=>resource('../outside.stl'),/Unsafe resource path/);
});
test('preparation preserves the exact validated engineering JSON bytes',()=>{
  prepare();
  assert.deepEqual(resource('apps/workbench/public/engineering.json'),resource('assets/cad/v3/engineering.json'));
});
