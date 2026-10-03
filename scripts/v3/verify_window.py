"""Real geometry regression checks for the double grille window; no mocked CAD."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, os, subprocess, sys

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl,bbox,volume,manifold_report
parser=argparse.ArgumentParser();parser.add_argument('--outer-only',action='store_true');args=parser.parse_args()
out=root/'generated/v3/window';out.mkdir(parents=True,exist_ok=True)
oscad=os.environ.get('OPENSCAD','openscad')
jobs=[]
def add(name,expression,expected='empty',minimum=0):jobs.append((name,expression,expected,minimum))
# Removing an outer rib must fail this probe; each cube is wholly inside a rib.
add('outer_five_ribs','intersection(){lid();for(x=[-76,-52,-28,-4,20])translate([x-2,-2,53])cube([4,4,1]);}','solid',79.9)
if not args.outer_only:
    add('six_open_slots','intersection(){lid();for(x=[-90,-64,-40,-16,8,32])translate([x-2,-2,52.1])cube([4,4,2.8]);}')
    add('inner_five_ribs','intersection(){window_grille();for(x=[-76,-52,-28,-4,20])translate([x-2,-2,48])cube([4,4,1]);}','solid',79.9)
    for name in ['lid','window_grille','acrylic']:
        add(name,f'named("{name}");','solid',.01)
    add('inner_print','print_part("window_grille");','part',.01)
    add('ear_top_clear','intersection(){window_grille();for(p=window_clamps)translate([p[0]-2,p[1]-2,49.9])cube([4,4,.6]);}')
    add('ear_support','intersection(){window_grille();for(p=window_clamps)translate([p[0]+2,p[1]-1,49.7])cube([2,2,.2]);}','solid',3.19)
    add('inserts_lid','inserts_lid();','solid',.01)
    add('screws_pane_clear','intersection(){acrylic();lid_fasteners();}')
    add('outer_contact_ribs','intersection(){lid();for(x=window_bar_x)translate([x-1,-2,52])cube([2,4,.05]);}','solid',1.99)
    add('inner_contact_ribs','intersection(){window_grille();for(x=window_bar_x)translate([x-1,-2,50.45])cube([2,4,.05]);}','solid',1.99)

    for a,b in [('acrylic','lid'),('acrylic','window_grille'),('window_grille','lid')]:
        add(f'clear_{a}_{b}',f'intersection(){{named("{a}");named("{b}");}}')
    add('closed_item','intersection(){named("moving_lid");named("item");}')
    add('hard_stops','intersection(){lid();for(p=[[-94,-43],[39,-43],[-94,45],[39,45]])translate([p[0]+2,p[1]-1,50])cube([2,2,.2]);}','solid',3.19)
    add('flush_head_clearance','intersection(){window_grille();for(p=[[-94,-43],[39,-43],[-94,45],[39,45]])translate([p[0],p[1],47.45])cylinder(d=3.8,h=.05,$fn=48);}')
    add('opened_driver_access','lid_angle=105;window_tool_conflicts();')
    for dz in [0,-.5,-2,-5,-15,-30]:
        add(f'install_{dz}',f'lid_angle=105;window_raise={dz};intersection(){{named("window_install");named("window_service_surround");}}')

def run(job):
    name,expression,expected,minimum=job
    source=out/f'{name}.scad';dest=out/f'{name}.stl';dest.unlink(missing_ok=True)
    source.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";\n'+expression+'\n')
    p=subprocess.run([oscad,'-o',str(dest),str(source)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    (out/f'{name}.log').write_text(p.stderr)
    result={'name':name,'expect':expected,'pass':False}
    if dest.exists() and p.returncode==0 and 'ERROR:' not in p.stderr:
        mesh=load_stl(dest);v=abs(volume(mesh));result.update(volume_mm3=v,bbox=bbox(mesh))
        result['pass']=v<.0001 if expected=='empty' else v>minimum
        if expected in ['part','solid']:
            errors=manifold_report(mesh)[:3];result['mesh_errors']=errors;result['pass'] &= not any(errors)
        if expected=='part':result['pass'] &= abs(result['bbox'][2][0])<.002
    elif not dest.exists() and 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr:
        result.update(volume_mm3=0,**{'pass':expected=='empty'})
    else:result['error']=p.stderr[-1500:]
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,jobs))
by_name={r['name']:r for r in results}
if not args.outer_only:
    # Hand-derived stack constraints catch a floating pane or lost storage space.
    for name,target in [('acrylic',[50.5,52]),('window_grille',[47.4,50.5]),('inserts_lid',[49.9,53.9])]:
        r=by_name[name];actual=r.get('bbox',[[0,0]]*3)[2]
        results.append({'name':name+'_z_stack','pass':all(abs(a-b)<.002 for a,b in zip(actual,target)),'actual':actual,'target':target})
    r=by_name['acrylic'];bounds=r.get('bbox',[[0,0]]*3)
    results.append({'name':'unchanged_pane_size','pass':all(abs((b-a)-v)<.002 for (a,b),v in zip(bounds,[149,82,1.5]))})
    r=by_name['window_grille'];results.append({'name':'storage_headroom','pass':r.get('bbox',[[0,0]]*3)[2][0]-45>=2.39})
report={'scope':'direct contact grille geometry and sampled installation; strength and first-print fit require measurement','results':results,
        'source_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'hardware/v3/cad').glob('*.scad')},
        'failures':[r for r in results if not r['pass']]}
(out/('outer-red.json' if args.outer_only else 'verification.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
for r in report['failures']:print('FAIL',json.dumps(r,ensure_ascii=False))
print('Window checks:',len(results),'Failures:',len(report['failures']),flush=True)
if report['failures']:raise SystemExit(1)
