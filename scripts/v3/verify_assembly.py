"""Continuous translation sweeps for the installation paths used by the guide.

Minkowski sum with a thin segment is conservative (1nm transverse thickness),
not a series of sampled animation frames. This checks nominal rigid geometry;
removed service screws, full retraction and 105-degree lid are preconditions.
"""
from pathlib import Path
import concurrent.futures,hashlib,json,os,subprocess,sys
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl,volume
out=root/'generated/v3/assembly-paths';out.mkdir(exist_ok=True)
steps=json.loads((root/'hardware/v3/engineering/assembly-steps.json').read_text())
expected={
 'S18':(['hinge_pin'],[[-180,0,0],[0,0,0]],'world'),
 'S19':(['hinge_guard_left','hinge_guard_right'],[[0,10,30],[0,10,0],[0,0,0]],'world'),
 'M02':(['window_grille','acrylic'],[[0,0,0],[0,0,-30]],'lid'),
 'M03':(['hinge_guard_left','hinge_guard_right'],[[0,0,0],[0,10,0],[0,10,30]],'world'),
 'M04':(['hinge_pin'],[[0,0,0],[-180,0,0]],'world')}
for s in steps['steps']:
 if s['animation']['kind']=='installation':
  a=s['animation'];assert (a['partIds'],a['keyframes'],a['frame'])==expected[s['id']],s['id'];assert s['targetPose']==dict(lid=105,travel=0,explode=0)
eps='.000001'
jobs=[]
for side in ['left','right']:
 jobs.append((f'guard_{side}_forward',f'minkowski(){{named("hinge_guard_{side}");cube([{eps},10,{eps}]);}}','keeper_service_surround'))
 jobs.append((f'guard_{side}_lift',f'translate([0,10,0])minkowski(){{named("hinge_guard_{side}");cube([{eps},{eps},30]);}}','keeper_service_surround'))
jobs.append(('pin_left_180',f'translate([-180,0,0])minkowski(){{hinge_pin();cube([180,{eps},{eps}]);}}','pin_service_surround'))
jobs.append(('window_local_down_30',f'lid_turn(105)translate([0,0,-30])minkowski(){{union(){{window_grille();acrylic();}}cube([{eps},{eps},30]);}}','window_service_surround'))
def run(job):
 name,body,surround=job;src=out/(name+'.scad');dest=out/(name+'.stl');dest.unlink(missing_ok=True)
 src.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";lid_angle=105;travel=0;\nintersection(){{{body}named("{surround}");}}\n')
 p=subprocess.run([os.environ.get('OPENSCAD','openscad'),'-o',str(dest),str(src)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
 (out/(name+'.log')).write_text(p.stderr)
 r=dict(name=name,pass_=False)
 if dest.exists() and p.returncode==0 and 'ERROR:' not in p.stderr:
  v=abs(volume(load_stl(dest)));r.update(volume_mm3=v,pass_=v<.0001)
 elif not dest.exists() and 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr:r.update(volume_mm3=0,pass_=True)
 else:r['error']=p.stderr[-1500:]
 print(name,r['pass_'],r.get('volume_mm3'),flush=True);return r
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,jobs))
sha={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((root/'hardware/v3/cad').glob('*.scad')),root/'hardware/v3/engineering/assembly-steps.json',Path(__file__)]}
report=dict(scope='continuous conservative Minkowski translation sweep; nominal rigid geometry only; no strength or torque claim',source_sha256=sha,segmentTransverseThickness_mm=.000001,intersectionVolumeTolerance_mm3=.0001,stepIds=list(expected),results=results,failures=[r for r in results if not r['pass_']])
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print('Continuous guide sweeps:',len(results),'Failures:',len(report['failures']))
if report['failures']:raise SystemExit(1)
