import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const archive = join(root, 'artifacts/v3/TetherLock-V3-Workbench.zip');
const output = join(root, 'dist');
const files = unzipSync(await readFile(archive));

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
