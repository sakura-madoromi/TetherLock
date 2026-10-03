import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pointer = Buffer.from('version https://git-lfs.github.com/spec/v1\n');
export function resource(file, expected) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) throw Error(`Unsafe resource path: ${file}`);
  if (!fs.existsSync(absolute)) throw Error(`Missing resource: ${file}; run git lfs pull`);
  const bytes = fs.readFileSync(absolute);
  if (bytes.subarray(0, pointer.length).equals(pointer)) throw Error(`LFS pointer is not hydrated: ${file}; run git lfs pull`);
  if (expected && (hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes)) throw Error(`Resource hash/size mismatch: ${file}`);
  return bytes;
}
export function check() {
  const registry = JSON.parse(resource('assets/manifest.json'));
  for (const [file, expected] of Object.entries(registry.files)) resource(file, expected);
  return registry;
}
export function prepare() {
  const registry = check();
  const manifest = JSON.parse(resource('assets/cad/v3/manifest.json'));
  const engineeringBytes = resource('assets/cad/v3/engineering.json');
  const engineering = JSON.parse(engineeringBytes);
  for (const proof of [manifest.sourceSHA256, engineering.sourceSHA256, engineering.dataSourceSHA256]) {
    for (const [file, expected] of Object.entries(proof)) {
      if (hash(resource(file)) !== expected) throw Error(`Source changed: ${file}; regenerate and validate CAD/engineering assets before publishing`);
    }
  }
  function write(file, bytes) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true});
    fs.writeFileSync(path.join(root, file), bytes);
  }
  for (const copy of registry.copies) {
    if (!registry.files[copy.source]) throw Error(`Unregistered copy: ${copy.source}`);
    if (!copy.target.startsWith('apps/') || copy.target.split('/').includes('..')) throw Error(`Unsafe copy destination: ${copy.target}`);
    write(copy.target, resource(copy.source, registry.files[copy.source]));
  }
  const runtime = structuredClone(manifest);
  for (const part of runtime.parts) {
    const file = `assets/cad/v3/${part.file}`;
    const bytes = resource(file, registry.files[file]);
    if (hash(bytes) !== part.sha256) throw Error(`CAD mesh hash mismatch: ${part.id}`);
    part.file = `models/${part.id}.stl`;
    for (const app of ['workbench', 'simulator']) write(`apps/${app}/public/${part.file}`, bytes);
  }
  for (const id of manifest.printParts) {
    const file = `assets/cad/v3/print/${id}.stl`;
    const bytes = resource(file, registry.files[file]);
    if (hash(bytes) !== engineering.printFileSHA256[`print/${id}.stl`]) throw Error(`Print mesh hash mismatch: ${id}`);
    write(`apps/workbench/public/print/${id}.stl`, bytes);
  }
  for (const app of ['workbench','simulator']) write(`apps/${app}/public/manifest.json`, JSON.stringify(runtime, null, 2)+'\n');
  // Preserve the exact validated bytes (Python and JS format floating values differently).
  write('apps/workbench/public/engineering.json', engineeringBytes);
  write('apps/workbench/public/downloads/v3-bom.csv', resource('docs/design/v3-bom.csv'));
  for (const name of ['CAD','Blueprints']) {
    const file = `TetherLock-V3-${name}.zip`;
    write(`apps/workbench/public/downloads/${file}`, resource(`assets/deliverables/v3/${file}`, registry.files[`assets/deliverables/v3/${file}`]));
  }
  console.log(`Prepared ${runtime.parts.length} shared CAD meshes and ${manifest.printParts.length} print files; ${Object.keys(registry.files).length} resources verified`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) console.log(`Verified ${Object.keys(check().files).length} resources`);
  else prepare();
}
