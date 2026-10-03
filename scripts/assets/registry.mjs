import fs from 'node:fs';
import path from 'node:path';
import { root, hash } from './prepare.mjs';

export function register() {
  const previous = fs.existsSync(path.join(root,'assets/manifest.json')) ? JSON.parse(fs.readFileSync(path.join(root,'assets/manifest.json'))) : {copies:[]};
  const files = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && file !== 'assets/manifest.json') {
        const bytes = fs.readFileSync(path.join(root,file));
        if (bytes.subarray(0,43).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw Error(`Hydrate LFS before registering: ${file}`);
        files[file] = {sha256:hash(bytes),bytes:bytes.length};
      }
    }
  }
  walk('assets');
  const registry={version:1,files,copies:previous.copies};
  fs.writeFileSync(path.join(root,'assets/manifest.json'),JSON.stringify(registry,null,2)+'\n');
  console.log(`Registered ${Object.keys(files).length} resources`);
}
