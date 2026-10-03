// Generate deterministic fixed-state mechanical blueprints outside the browser.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { EdgesGeometry } from 'three';
import { BlueprintSet } from '../../apps/workbench/src/blueprint.js';
const data=JSON.parse(await readFile('generated/v3/engineering/data.json','utf8'));
const manifest=JSON.parse(await readFile('apps/workbench/public/manifest.json','utf8'));
for(const [file,sha] of Object.entries(data.sourceSHA256))if(createHash('sha256').update(await readFile(file)).digest('hex')!==sha)throw new Error('Stale CAD data: '+file);
const font=await readFile('assets/fonts/TLBlueprint.otf');
const meshes=new Map(),loader=new STLLoader();
for(const part of [...data.productParts,...data.printParts.filter(id=>!data.parts.some(p=>p.id===id)).map(id=>({id,file:`print/${id}.stl`,kind:'printed',role:'fixed',explode:[0,0,0]}))]){
  const buffer=await readFile('apps/workbench/public/'+part.file),expected=part.file.startsWith('print/')?data.printFileSHA256[part.file]:manifest.parts.find(p=>p.id===part.id).sha256;
  if(createHash('sha256').update(buffer).digest('hex')!==expected)throw new Error('Mesh mismatch: '+part.id);
  const geometry=loader.parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)),edges=new EdgesGeometry(geometry,30);
  meshes.set(part.id,{...part,positions:Array.from(geometry.getAttribute('position').array),edges:Array.from(edges.getAttribute('position').array)});
}
const set=new BlueprintSet(data,meshes,font.toString('base64')),errors=[],pages=[];
await mkdir('generated/v3/blueprints/drawings',{recursive:true});
for(const page of set.pages){
  try{const svg=set.render(page.id);await writeFile(`generated/v3/blueprints/drawings/${page.id}.svg`,svg);pages.push({id:page.id,bytes:Buffer.byteLength(svg),sha256:createHash('sha256').update(svg).digest('hex')});}
  catch(e){errors.push({id:page.id,reason:e.message});}
}
const factory=set.acrylic();await writeFile('generated/v3/blueprints/acrylic-1to1.svg',factory.svg);await writeFile('generated/v3/blueprints/acrylic-1to1.dxf',factory.dxf);
const evidence={version:data.version,cadFingerprint:data.cadFingerprint,dataFingerprint:data.dataFingerprint,pages:pages,errors,complete:errors.length===0};
await writeFile('generated/v3/blueprints/generation.json',JSON.stringify(evidence,null,2)+'\n');
console.log('Blueprint pages generated:',pages.length,'Errors:',JSON.stringify(errors));
if(!errors.length){const archive=await set.archive();await writeFile('generated/v3/TetherLock-V3-Blueprints.zip',new Uint8Array(await archive.arrayBuffer()));}
