"""Actual STL interference checks for fixed storage references and lid motion."""
from pathlib import Path
import concurrent.futures, hashlib, json, os, subprocess, sys
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl, bbox, volume, manifold_report
out=root/'generated/v3/references';out.mkdir(exist_ok=True)
oscad=os.environ.get('OPENSCAD','openscad')
jobs=[]
for name in ['phone','card']:
    jobs.append((name, f'reference_{name}();', 'solid'))
    jobs.append((name+'_fixed_clear',f'intersection(){{reference_{name}();for(p=assembly_parts)if(p!="lid"&&p!="window_grille"&&p!="latch"&&p!="latch_retainer")named(p);for(p=hardware_parts)if(p!="acrylic"&&p!="cover_magnet"&&p!="inserts_lid")named(p);}}','empty'))
    for angle in [0,.25,.5,1,5,15,30,45,60,75,90,105]:
        jobs.append((f'{name}_lid_{angle}',f'lid_angle={angle};intersection(){{reference_{name}();named("moving_lid");}}','empty'))
jobs.append(('phone_card_clear','intersection(){reference_phone();reference_card();}','empty'))
def run(job):
    name,body,expect=job;source=out/f'{name}.scad';dest=out/f'{name}.stl';dest.unlink(missing_ok=True)
    source.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";\n'+body+'\n')
    p=subprocess.run([oscad,'-o',str(dest),str(source)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    (out/f'{name}.log').write_text(p.stderr)
    r={'name':name,'expect':expect,'pass':False}
    if dest.exists() and p.returncode==0 and 'ERROR:' not in p.stderr:
        mesh=load_stl(dest);r.update(volume_mm3=abs(volume(mesh)),bbox=bbox(mesh));r['pass']=r['volume_mm3']>.001 and not any(manifold_report(mesh)[:3]) if expect=='solid' else r['volume_mm3']<.0001
    elif 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr:
        r['pass']=expect=='empty'
    else:r['error']=p.stderr[-1000:]
    return r
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,jobs))
by={r['name']:r for r in results};dims=json.loads((root/'hardware/v3/engineering/references.json').read_text())
for name in ['phone','card']:
    b=by[name].get('bbox');d=dims[name];target=d['lowestZ'] if name=='phone' else d['bottomZ']
    results.append({'name':name+'_fixed_height','pass':bool(b) and abs(b[2][0]-target)<.002,'target':target,'actual':b})
    results.append({'name':name+'_inside_storage','pass':bool(b) and b[0][0]>=-115.5 and b[0][1]<=69.5 and b[1][0]>=-47.5 and b[1][1]<=47.5 and b[2][0]>=5 and b[2][1]<=45})
files=[root/'hardware/v3/engineering/references.json',*sorted((root/'hardware/v3/cad').glob('*.scad'))]
report={'scope':'nominal reference solids, fixed storage fit and discrete lid poses; no physical phone/drop test', 'results':results,'failures':[r for r in results if not r['pass']], 'source_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(out/'verification.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print('Reference checks:',len(results),'Failures:',len(report['failures']))
for r in report['failures']:print(r)
if report['failures']:raise SystemExit(1)
