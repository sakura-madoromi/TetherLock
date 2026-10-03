"""Actual solid probes for purchased variants, including a continuous drive sweep."""
from pathlib import Path
import concurrent.futures,hashlib,json,os,subprocess,sys
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl,volume
out=root/'generated/v3/purchased-specs';out.mkdir(exist_ok=True)
jobs=[]
for length in [54,56]:
 for travel in [0,7,14]:
  jobs.append((f'shaft_{length}_travel_{travel}',f'travel={travel}; intersection(){{shaft();for(p=assembly_parts)named(p);for(p=hardware_parts)if(p!="motor")named(p);}}',{'shaft_l':length}))
for x in [99.5,112.75]:
 jobs.append((f'tie_gauge_{x}',f'intersection(){{electronics_tray();translate([{x+.25},33.5,5.3])cube([2.5,7,2.4]);}}',{}))
for y in [-12,2]:
 for x in [112,115]:
  jobs.append((f'feedback_tie_{x}_{y}',f'intersection(){{lock_base();translate([{x+.25},{y+.5},29.2])cube([2.5,4,3.5]);}}',{}))
jobs.append(('button_terminal_service_space','intersection(){translate([button_panel_x-button_body_l-button_terminal_l-3,button_y-4.425,button_z-2])cube([3,8.85,4]);named("whole");}',{}))
moving=['bolt','nut_carriage','nut_cap','drive_nut']
jobs.append(('continuous_drive_14mm','intersection(){minkowski(){union(){for(p='+json.dumps(moving)+')named(p);moving_fasteners(0);}cube([.000001,stroke,.000001]);}union(){for(p=concat(assembly_parts,hardware_parts))if(!('+ '||'.join('p=="'+p+'"' for p in moving)+'))named(p);fixed_fasteners();lid_fasteners();}}',{}))
def run(job):
 name,body,values=job;src=out/(name+'.scad');dest=out/(name+'.stl');dest.unlink(missing_ok=True)
 src.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";\n'+body+'\n')
 cmd=[os.environ.get('OPENSCAD','openscad'),'-o',str(dest)]
 for k,v in values.items():cmd.extend(['-D',f'{k}={json.dumps(v)}'])
 p=subprocess.run(cmd+[str(src)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
 (out/(name+'.log')).write_text(p.stderr)
 result={'name':name,'pass':False}
 if dest.exists() and p.returncode==0 and 'ERROR:' not in p.stderr:
  v=abs(volume(load_stl(dest)));result.update(volume_mm3=v,**{'pass':v<.0001})
 elif 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr:result.update(volume_mm3=0,**{'pass':True})
 else:result['error']=p.stderr[-1200:]
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,jobs))
files=[*sorted((root/'hardware/v3/cad').glob('*.scad')),Path(__file__)]
report={'scope':'nominal rigid solid checks: seller shaft length 54/56mm; 2.5mm tie passage; 3mm terminal service clearance; continuous conservative 14mm drive sweep. Nut/thread dimensions remain candidate; switch trigger and printed strength not measured.','results':results,'failures':[r for r in results if not r['pass']],'source_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for fail in report['failures']:print('FAIL',fail)
print('Purchased-spec checks:',len(results),'Failures:',len(report['failures']))
if report['failures']:raise SystemExit(1)
