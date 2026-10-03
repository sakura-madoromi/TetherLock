import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { resource } from '../assets/prepare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const file = 'assets/deliverables/v3/TetherLock-V3-Workbench.zip';
// The deployment upload contains only the resource inventory and hydrated ZIP.
const registry = JSON.parse(resource('assets/manifest.json'));
const archive = join(root, file);
const output = join(root, 'generated/workbench/deploy');
const files = unzipSync(resource(file, registry.files[file]));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

let count = 0;
for (const [name, data] of Object.entries(files)) {
  if (name.endsWith('/')) continue;
  const target = resolve(output, name);
  if (target !== output && !target.startsWith(`${output}/`)) {
    throw new Error(`Unsafe archive path: ${name}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  count += 1;
}

console.log(`Vercel static preview: extracted ${count} files from ${relative(root, archive)}`);
