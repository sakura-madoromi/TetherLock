"""TetherLock V3: fresh STL exports and actual assembled-geometry checks."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, math, os, subprocess, sys, time

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--quick', action='store_true')
args = parser.parse_args()
source = root / 'cad/v3/assembly.scad'
assert source.exists(), 'V3 assembly source missing: CAD has not been implemented'
sys.path.insert(0, str(root / 'scripts/shared'))
from stl_probe import load_stl, bbox, volume, manifold_report
oscad = os.environ.get('OPENSCAD', str(root / '.tools/squashfs-root/AppRun'))
out = root / 'artifacts/v3'
out.mkdir(parents=True, exist_ok=True)
stls = root / 'stl/v3'
stls.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'QT_QPA_PLATFORM':'offscreen'}

def call(path, values):
    cmd = [oscad, '-o', str(path)]
    for k,v in values.items(): cmd += ['-D', f'{k}={json.dumps(v)}']
    return subprocess.run(cmd+[str(source)],capture_output=True,text=True,env=env)

p = call(out/'metadata.csg', {'view':'metadata'})
assert p.returncode == 0 and 'ERROR:' not in p.stderr, p.stderr
meta = dict(json.loads(next(line[6:] for line in p.stderr.splitlines() if line.startswith('ECHO: '))))
# stl/v3 is generated output. Retire parts removed from the assembly metadata.
for stale in stls.glob('*.stl'):
    if stale.stem not in meta['print_parts']:stale.unlink()

def connected(mesh):
    parent = list(range(len(mesh))); seen = {}
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i, tri in enumerate(mesh):
        for vertex in tri:
            key = tuple(round(v,5) for v in vertex)
            if key in seen: parent[find(i)] = find(seen[key])
            else: seen[key] = i
    return len({find(i) for i in range(len(mesh))})

jobs=[]
def job(name, values, expectation='empty', folder=out): jobs.append((name,values,expectation,folder))
for name in meta['print_parts']:
    job(name, {'view':'print','part':name}, 'part', stls)
for name in meta['assembly_parts']:
    job('pose_'+name, {'view':'part','part':name}, 'solid')
for name in meta['hardware_parts']:
    job('hardware_'+name, {'view':'part','part':name}, 'solid')
job('closed', {'view':'assembly'}, 'assembly')
job('released_base_bolt', {'view':'intersection','a':'base_box','b':'bolt'})
job('released_lock_bolt', {'view':'intersection','a':'lock_base','b':'bolt'})
job('release_item', {'view':'intersection','a':'base_box','b':'item'})
job('closed_item_lid', {'view':'intersection','a':'moving_lid','b':'item'})
job('negative_locked_open', {'view':'intersection','a':'moving_lid','b':'bolt','travel':meta['stroke'],'lid_angle':1}, 'collision')
job('load_float_clear', {'view':'intersection','a':'bolt','b':'nut_carriage','travel':meta['stroke'],'bolt_shift_z':0.25})
job('load_screw_clear', {'view':'intersection','a':'bolt','b':'shaft','travel':meta['stroke'],'bolt_shift_z':0.25})
job('load_guide_contact', {'view':'intersection','a':'bolt','b':'guide_cap','travel':meta['stroke'],'bolt_shift_z':0.35}, 'collision')
for dz in [-0.25,0.25]:
    for dx in [-0.25,0.25]:
        for b in ['nut_carriage','shaft','guide_cap','lock_base']:
            job(f'float_{dx}_{dz}_{b}', {'view':'intersection','a':'bolt','b':b,'travel':meta['stroke'],'bolt_shift_z':dz,'bolt_shift_x':dx})
for t in [0,meta['stroke']/2,meta['stroke']]:
    job(f'fasteners_{t}', {'view':'fastener_check','travel':t})
    job(f'tool_access_{t}', {'view':'tool_check','travel':t,'lid_angle':105})
for dz in [0,5,15,30,80]:
    job(f'drive_install_{dz}', {'view':'intersection','a':'drive_install','b':'drive_install_surround','drive_raise':dz,'lid_angle':105})
for dz in [0,1,2,4,8]:
    job(f'nut_insert_{dz}', {'view':'intersection','a':'drive_nut','b':'nut_insert_surround','nut_raise':dz})
for t in [0,2,4,6,8,meta['stroke']]:
    for pair in [('bolt','lock_base'),('bolt','guide_cap'),('bolt','latch'),('nut_carriage','lock_base'),('nut_cap','guide_cap'),('nut_carriage','bolt'),('drive_nut','nut_carriage'),('motor','nut_carriage')]:
        job(f'travel_{t}_{pair[0]}_{pair[1]}',{'view':'intersection','a':pair[0],'b':pair[1],'travel':t})
if not args.quick:
    # Broad phase uses actual mesh bounds to avoid exporting obviously separate pairs.
    pass

def run(item):
    name, values, expected, folder = item
    path = folder/(name+'.stl'); path.unlink(missing_ok=True)
    p = call(path, values)
    (out/(name+'.log')).write_text(p.stderr)
    empty = 'Current top level object is empty' in p.stderr
    if path.exists() and p.returncode == 0 and not empty:
        mesh = load_stl(path); vol=abs(volume(mesh)); bounds=bbox(mesh)
        r={'name':name,'volume_mm3':round(vol,6),'bbox':bounds,'expect':expected}
        if expected in ['solid','part','assembly']:
            edges=manifold_report(mesh)[:3]; r['mesh_errors']=edges
            # Standard hardware and assemblies can intentionally contain multiple pieces.
            if expected=='part':
                r['connected_surfaces']=connected(mesh)
                r['pass']=vol>0 and not any(edges) and r['connected_surfaces']==1 and abs(bounds[2][0])<0.002
            elif expected=='assembly':
                r['pass']=vol>0 and all(bounds[i][0]>=meta['closed_min'][i]-0.002 and bounds[i][1]<=meta['closed_max'][i]+0.002 for i in range(3))
            else: r['pass']=vol>0 and not any(edges)
        else: r['pass'] = (vol>0.0001) if expected=='collision' else vol<0.0001
    elif empty and not path.exists() and 'ERROR:' not in p.stderr:
        r={'name':name,'volume_mm3':0,'expect':expected,'pass':expected=='empty'}
    else:
        r={'name':name,'expect':expected,'pass':False,'error':p.stderr[-2000:]}
    return r

def batch(items):
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(run,items))
results=batch(jobs)
if not args.quick:
    initial={r['name']:r for r in results}
    pairs=[]
    nodes=meta['assembly_parts']+meta['hardware_parts']
    def bounds(name): return initial[('pose_' if name in meta['assembly_parts'] else 'hardware_')+name].get('bbox')
    moving={'bolt','nut_carriage','nut_cap','drive_nut','bolt_magnet'}
    for t in [0,meta['stroke']/2,meta['stroke']]:
        def shifted(name):
            raw=bounds(name)
            return [[lo+(t if k==1 and name in moving else 0),hi+(t if k==1 and name in moving else 0)] for k,(lo,hi) in enumerate(raw)] if raw else None
        for i,a in enumerate(nodes):
            for b in nodes[i+1:]:
                ba,bb=shifted(a),shifted(b)
                if ba is None or bb is None:continue
                if all(min(ba[k][1],bb[k][1])-max(ba[k][0],bb[k][0])>0.0001 for k in range(3)):
                    pairs.append((f'pair_{t}_{a}_{b}',{'view':'intersection','a':a,'b':b,'travel':t},'empty',out))
    # Uniform 1 degree samples, plus 0.25/0.5 degree near closure.
    # Explicitly a sampling check, not a continuous swept-volume proof.
    for angle in [0.25,0.5]+list(range(106)):
        for a,b in [('moving_lid','base_box'),('moving_lid','lock_all'),('moving_lid','electronics_all'),('moving_lid','fixed_fasteners'),('moving_lid','stationary_extras')]:
            pairs.append((f'open_{angle}_{a}_{b}',{'view':'intersection','a':a,'b':b,'lid_angle':angle},'empty',out))
    for dz in [0,10,20,40,80]:
        pairs.append((f'item_path_{dz}',{'view':'intersection','a':'whole','b':'item','lid_angle':105,'item_raise':dz},'empty',out))
    for dz in [0,-5,-15,-30,-80]:
        pairs.append((f'battery_path_{dz}',{'view':'intersection','a':'battery_service_surround','b':'battery_holder','battery_raise':dz},'empty',out))
    print('Full verification additional exports:',len(pairs),flush=True)
    results += batch(pairs)

manifest={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in (root/'cad/v3').glob('*.scad')}
manifest.update({str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in stls.glob('*.stl')})
summary={'scope':'structural CAD prototype; hardware provisional; opening checked by discrete samples',
         'quick':args.quick,'metadata':meta,'results':results,'source_export_sha256':manifest,
         'failures':[r for r in results if not r['pass']]}
(out/('quick-results.json' if args.quick else 'verification.json')).write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n')
for r in summary['failures']:print('FAIL',json.dumps(r,ensure_ascii=False))
print('Checks:',len(results),'Failures:',len(summary['failures']),flush=True)
if summary['failures']:raise SystemExit(1)
