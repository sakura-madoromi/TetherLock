"""Actual STL checks of pin capture, service paths and Hall installation geometry."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, math, os, subprocess, sys

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'scripts/shared'))
from stl_probe import load_stl, bbox, volume, manifold_report
parser = argparse.ArgumentParser()
parser.add_argument('--retention-only', action='store_true')
args = parser.parse_args()
out = root / 'generated/v3/hinge-hall'; out.mkdir(parents=True, exist_ok=True)
oscad = os.environ.get('OPENSCAD', 'openscad')
jobs = []
def add(name, expression, expect='empty', minimum=0):
    jobs.append((name, expression, expect, minimum))

# A plain cover above the pin cannot stop axial escape: these must hit end walls.
for side, shift in [('left', -.7), ('right', .7)]:
    add(side + '_axial_stop', f'intersection(){{translate([{shift},0,0])hinge_pin();named("hinge_guard_{side}");}}', 'solid', .3)
if not args.retention_only:
    for n in ['hinge_guard_left','hinge_guard_right','inserts_fixed','inserts_lid']:
        add(n, f'named("{n}");', 'solid', .01)
    for dx in [-.49, 0, .49]:
        add(f'pin_free_{dx}', f'intersection(){{translate([{dx},0,0])hinge_pin();named("hinge_guard_left");}}')
        add(f'pin_free_right_{dx}', f'intersection(){{translate([{dx},0,0])hinge_pin();named("hinge_guard_right");}}')
    for dy in [-.2,.2]:
        add(f'pin_radial_play_{dy}', f'intersection(){{translate([0,{dy},0])hinge_pin();named("hinge_guard_left");}}')
        add(f'pin_radial_play_right_{dy}', f'intersection(){{translate([0,{dy},0])hinge_pin();named("hinge_guard_right");}}')
    # Slide forward out of the rear pocket, then lift; the open lid overhangs it.
    for dy,dz in [(0,0),(.5,0),(2,0),(5,0),(10,0),(10,2),(10,5),(10,15),(10,30)]:
        add(f'keeper_removal_{dy}_{dz}', f'lid_angle=105;intersection(){{translate([0,{dy},{dz}]){{named("hinge_guard_left");named("hinge_guard_right");}}named("keeper_service_surround");}}')
    for dx in [-250,-180,-60,-5,0,5,60,180,250]:
        add(f'pin_service_{dx}', f'lid_angle=105;intersection(){{translate([{dx},0,0])hinge_pin();named("pin_service_surround");}}')
    add('keeper_driver_access', 'lid_angle=105;keeper_tool_conflicts();')
    for n in ['hinge_guard_left','hinge_guard_right','insert_coupon','keeper_insert_coupon','window_insert_coupon','hinge_bore_coupon']:
        add(n + '_print', f'print_part("{n}");', 'part', .01)
    for n in ['inserts_fixed','inserts_lid']:
        for other in ['base_box','lid','battery_hatch','window_grille','stationary_extras','item']:
            add(n + '_clear_' + other, f'intersection(){{named("{n}");named("{other}");}}')
    # The lid switch is proximity detection. Measure when the *bolt* can traverse.
    for angle in [0,.1,.2,.25,.3,.4,.5,1,2]:
        add(f'latch_alignment_{angle}', f'lid_angle={angle};intersection(){{named("latch");translate([bolt_x-3,6,axis_z-3])cube([6,13,6]);}}', 'measure')

def run(job):
    name, expression, expect, minimum = job
    source = out / f'{name}.scad'; dest = out / f'{name}.stl'; dest.unlink(missing_ok=True)
    source.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";\n' + expression + '\n')
    p = subprocess.run([oscad, '-o', str(dest), str(source)], capture_output=True, text=True,
                       env={**os.environ, 'QT_QPA_PLATFORM':'offscreen'})
    (out / f'{name}.log').write_text(p.stderr)
    r = {'name':name, 'expect':expect, 'pass':False}
    if dest.exists() and p.returncode == 0 and 'ERROR:' not in p.stderr:
        mesh = load_stl(dest); v = abs(volume(mesh)); r.update(volume_mm3=v, bbox=bbox(mesh))
        r['pass'] = True if expect == 'measure' else v < .0001 if expect == 'empty' else v > minimum
        if expect in ['part','solid']:
            r['mesh_errors'] = list(manifold_report(mesh)[:3]); r['pass'] &= not any(r['mesh_errors'])
        if expect == 'part': r['pass'] &= abs(r['bbox'][2][0]) < .002
    elif not dest.exists() and 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr:
        r.update(volume_mm3=0, **{'pass':expect in ['empty','measure']})
    else: r['error'] = p.stderr[-1800:]
    return r

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(run, jobs))
by_name = {r['name']:r for r in results}
if not args.retention_only:
    assert by_name['latch_alignment_0']['volume_mm3'] < .0001
    results.append({'name':'proximity_is_not_latch_alignment', 'pass':by_name['latch_alignment_1']['volume_mm3']>.0001})
    results.append({'name':'latch_clear_at_point_three_deg', 'pass':by_name['latch_alignment_0.3']['volume_mm3']<.0001})
    results.append({'name':'latch_interferes_at_point_four_deg', 'pass':by_name['latch_alignment_0.4']['volume_mm3']>.0001})
    # No Hall/magnet solids remain. Keep an explicit retirement record.
    (out/'hall-positions.json').write_text(json.dumps({'scope':'retired Hall geometry; no magnetic positions in current CAD','positions':[]},indent=2)+'\n')
    assessment={'candidate':None,'technology':'mechanical contacts pending SKU and bracket design',
                'trigger_release_verified':False,'lock_authorization_verified':False,
                'status':'Hall removed; manual electrical bench only; automatic lock disabled until feedback validation'}
    (out/'hall-assessment.json').write_text(json.dumps(assessment,ensure_ascii=False,indent=2)+'\n')
report={'scope':'nominal axial retention, sampled service paths and latch alignment; Hall removed; mechanical feedback pending',
        'results':results,'source_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'hardware/v3/cad').glob('*.scad')},
        'failures':[r for r in results if not r['pass']]}
(out/('retention-red.json' if args.retention_only else 'verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for r in report['failures']: print('FAIL',json.dumps(r,ensure_ascii=False))
print('Hinge/latch checks:',len(results),'Failures:',len(report['failures']),flush=True)
if report['failures']: raise SystemExit(1)
