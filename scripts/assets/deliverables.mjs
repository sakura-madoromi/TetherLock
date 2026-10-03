import fs from 'node:fs';
import path from 'node:path';
import {root,resource,hash} from './prepare.mjs';
import {register} from './registry.mjs';

const publish=process.argv.includes('--publish');
if(!publish && !process.argv.includes('--stage')) throw Error('Choose --stage or --publish');
const read=file=>JSON.parse(resource(file));
const engineering=read('assets/cad/v3/engineering.json');
const cad=read('generated/v3/delivery-manifest.json');
if(cad.cadFingerprint!==engineering.cadFingerprint || cad.dataFingerprint!==engineering.dataFingerprint) throw Error('CAD package does not match the resource snapshot');
for(const [file,expected] of Object.entries(cad.files_sha256)) if(hash(resource(file))!==expected) throw Error(`Stale CAD package input: ${file}`);
const generation=read('generated/v3/blueprints/generation.json');
if(!generation.complete || generation.errors.length) throw Error('Blueprint generation failed');
if(publish) {
  const audit=read('generated/v3/purchased-specs/delivery-verification.json');
  if(!audit.complete || audit.failures.length || audit.cadFingerprint!==engineering.cadFingerprint || audit.dataFingerprint!==engineering.dataFingerprint) throw Error('Complete current delivery verification is required');
  for(const [file,expected] of Object.entries(audit.source_sha256)) if(hash(resource(file))!==expected) throw Error(`Stale delivery audit: ${file}`);
  for(const item of Object.values(audit.packages)) {
    const bytes=resource(item.file);
    if(hash(bytes)!==item.sha256 || bytes.length!==item.bytes) throw Error(`Package differs from delivery audit: ${item.file}`);
  }
}
for(const name of publish?['CAD','Blueprints','Workbench']:['CAD','Blueprints']) {
  const file=`TetherLock-V3-${name}.zip`;
  const bytes=resource(`generated/v3/${file}`);
  fs.mkdirSync(path.join(root,'assets/deliverables/v3'),{recursive:true});
  fs.writeFileSync(path.join(root,`assets/deliverables/v3/${file}`),bytes);
}
const manifest=read('assets/cad/v3/manifest.json');
manifest.cadPackageCurrent=true;
fs.writeFileSync(path.join(root,'assets/cad/v3/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
if(publish) fs.copyFileSync(path.join(root,'generated/v3/purchased-specs/delivery-verification.json'),path.join(root,'assets/deliverables/v3/verification.json'));
register();
console.log(publish?'Published verified delivery packages':'Staged current CAD/Blueprints packages for local workbench verification; do not commit until --publish succeeds');
