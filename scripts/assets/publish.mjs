// Promote validated outputs into the versioned snapshot. Run after the CAD audits.
import fs from 'node:fs';
import path from 'node:path';
import {root,hash,resource} from './prepare.mjs';
import {register} from './registry.mjs';

const read=file=>JSON.parse(resource(file));
const proof=read('generated/v3/verification.json');
if(proof.quick || proof.failures.length) throw Error('A complete passing CAD verification is required');
for(const [file,expected] of Object.entries(proof.source_export_sha256)) if(hash(resource(file))!==expected) throw Error(`Stale CAD proof: ${file}`);
for(const file of ['window/verification.json','hinge-hall/verification.json','review-verification.json','references/verification.json','assembly-paths/verification.json','purchased-specs/verification.json']) {
  const audit=read(`generated/v3/${file}`);
  if(audit.failures.length) throw Error(`Resolve audit failures: ${file}`);
  for(const [source,expected] of Object.entries(audit.source_sha256)) if(hash(resource(source))!==expected) throw Error(`Stale audit: ${source}`);
}
const manifest=read('apps/workbench/public/manifest.json');
const engineering=read('generated/v3/engineering/data.json');
for(const [file,expected] of Object.entries(engineering.dataSourceSHA256)) if(hash(resource(file))!==expected) throw Error(`Stale engineering snapshot: ${file}`);
function copy(from,to) {fs.mkdirSync(path.dirname(path.join(root,to)),{recursive:true});fs.copyFileSync(path.join(root,from),path.join(root,to));}
for(const part of manifest.parts) {
  if(hash(resource(`apps/workbench/public/${part.file}`))!==part.sha256) throw Error(`Mesh mismatch: ${part.id}`);
  copy(`apps/workbench/public/${part.file}`,`assets/cad/v3/assembly/${part.id}.stl`);
  part.file=`assembly/${part.id}.stl`;
}
for(const id of manifest.printParts) copy(`generated/v3/print/${id}.stl`,`assets/cad/v3/print/${id}.stl`);
fs.writeFileSync(path.join(root,'assets/cad/v3/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
copy('generated/v3/engineering/data.json','assets/cad/v3/engineering.json');
// The complete measured proof is a source-linked snapshot, not an intermediate mesh dump.
copy('generated/v3/verification.json','assets/cad/v3/verification.json');
register();
console.log(`Published ${manifest.parts.length} shared CAD meshes and validated engineering data`);
