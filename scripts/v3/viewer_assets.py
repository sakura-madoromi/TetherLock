"""Package verified world-pose CAD meshes for the V3 web workbench."""
from pathlib import Path
import hashlib, json, math, os, shutil, struct, subprocess, sys, zipfile

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl,bbox,volume
proof=json.loads((root/'artifacts/v3/verification.json').read_text())
assert not proof['failures'], 'Resolve CAD verification failures first'
for file,expected in proof['source_export_sha256'].items():
    assert hashlib.sha256((root/file).read_bytes()).hexdigest()==expected, f'Stale CAD verification: {file}; run export_verify.py'
public=root/'viewer/public'; models=public/'models'; models.mkdir(parents=True,exist_ok=True)
results={r['name']:r for r in proof['results']}
display={p['id']:p for p in json.loads((root/'engineering/part-display.json').read_text())['parts']}
def binary(mesh):
    data=bytearray(b'TetherLock V3 verified CAD mesh'.ljust(80,b'\0')+struct.pack('<I',len(mesh)))
    for a,b,c in mesh:
        u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        mag=math.sqrt(sum(x*x for x in n));n=[x/mag if mag else 0 for x in n]
        data+=struct.pack('<12fH',*n,*a,*b,*c,0)
    return data

entries=[]
def add(name,file,kind,expected=None,qty=1):
    mesh=load_stl(file);bounds=bbox(mesh);vol=abs(volume(mesh))
    if expected:
        assert abs(vol-expected['volume_mm3'])<0.001, f'Unexpected geometry: {name}'
        assert all(abs(bounds[k][i]-expected['bbox'][k][i])<0.001 for k in range(3) for i in range(2)), name
    data=binary(mesh);(models/f'{name}.stl').write_bytes(data)
    identity=display[name]
    entries.append({**identity,'kind':kind,'quantity':qty,'file':f'models/{name}.stl','printFile':f'print/{name}.stl' if kind=='printed' else None,
      'bounds':bounds,'size':[round(hi-lo,3) for lo,hi in bounds],'volume':round(vol,3),'triangles':len(mesh),
      'sha256':hashlib.sha256(data).hexdigest(),'source':str(file.relative_to(root))})

for name in proof['metadata']['assembly_parts']:
    key='pose_'+name;add(name,root/f'artifacts/v3/{key}.stl','printed',results[key])
for name in proof['metadata']['hardware_parts']:
    key='hardware_'+name;add(name,root/f'artifacts/v3/{key}.stl','hardware',results[key],qty=6 if name=='inserts_fixed' else 4 if name=='inserts_lid' else 1)
cache=root/'artifacts/v3/viewer-assets';cache.mkdir(exist_ok=True)
oscad=os.environ.get('OPENSCAD',str(root/'.tools/squashfs-root/AppRun'))
fastener_counts=json.loads((root/'artifacts/v3/fasteners.json').read_text())['group_counts']
for kind,qty in fastener_counts.items():
    name=f'fasteners_{kind}';wrapper=cache/f'{name}.scad';dest=cache/f'{name}.stl'
    wrapper.write_text(f'include <{root}/cad/v3/assembly.scad>\nview="metadata";\n'+{'fixed':'fixed_fasteners();','drive':'moving_fasteners(0);','lid':'lid_fasteners();'}[kind]+'\n')
    p=subprocess.run([oscad,'-o',str(dest),str(wrapper)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    assert p.returncode==0 and 'ERROR:' not in p.stderr,p.stderr
    add(name,dest,'fastener',qty=qty)
(public/'print').mkdir(exist_ok=True)
for p in (root/'stl/v3').glob('*.stl'):shutil.copy2(p,public/'print'/p.name)
# These folders contain generated assets; remove superseded four-clamp files.
for p in models.glob('*.stl'):
    if p.name not in {entry['id']+'.stl' for entry in entries}:p.unlink()
for p in (public/'print').glob('*.stl'):
    if p.stem not in proof['metadata']['print_parts']:p.unlink()
(public/'downloads').mkdir(exist_ok=True)
cad_package_current=False
package=root/'artifacts/v3/TetherLock-V3-CAD.zip'
if package.exists():
    with zipfile.ZipFile(package) as archive:
        cad_package_current=all(str(p.relative_to(root)) in archive.namelist() and archive.read(str(p.relative_to(root)))==p.read_bytes() for p in [*list((root/'cad/v3').glob('*.scad')),*list((root/'engineering').glob('*.json')),root/'docs/design/v3-bom.csv'])
download=public/'downloads/TetherLock-V3-CAD.zip'
if cad_package_current:shutil.copy2(package,download)
else:download.unlink(missing_ok=True)
blueprint=root/'artifacts/v3/TetherLock-V3-Blueprints.zip'
if blueprint.exists():
    with zipfile.ZipFile(blueprint) as archive:
        exported=json.loads(archive.read('engineering-data.json'))
        current=json.loads((public/'engineering.json').read_text())
        assert exported==current,'Stale blueprint package: run node scripts/v3/blueprints.mjs'
    shutil.copy2(blueprint,public/'downloads'/blueprint.name)
shutil.copy2(root/'docs/design/v3-bom.csv',public/'downloads/v3-bom.csv')
manifest={'version':json.loads((public/'engineering.json').read_text())['version'],'units':'mm','cadPackageCurrent':cad_package_current,'closedSize':[240,120,55],'storageSize':[185,95,40],
 'stroke':14,'hinge':[0,-55,51],'checks':len(proof['results']),'sourceSHA256':{p:h for p,h in proof['source_export_sha256'].items() if p.endswith('.scad')},
 'groups':[{'id':key,'label':label} for key,label in [('shell','外壳与铰链'),('lid','顶盖与锁扣'),('lock','锁驱动机构'),('electronics','电子与显示'),('battery','电池维护'),('fasteners','紧固件')]],
 'printParts':proof['metadata']['print_parts'],'parts':entries}
(public/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(f'V3 viewer assets: {len(entries)} meshes, {sum(p["triangles"] for p in entries):,} triangles; verified CAD sources match.')
