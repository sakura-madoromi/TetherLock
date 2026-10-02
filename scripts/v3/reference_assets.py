"""Generate conservative CAD reference solids from the shared dimension data."""
from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[2]
source = root / 'engineering/references.json'
data = json.loads(source.read_text())
p, c = data['phone'], data['card']
back = p['lowestZ'] + p['cameraPlateau'] + p['cameraGlass']
code = f'''// Generated from engineering/references.json; do not edit.
// SHA256 {hashlib.sha256(source.read_bytes()).hexdigest()}
// Visual corner/platform profiles are approximate. Dimensions are nominal mm.
module reference_phone() {{
 translate([{p['center'][0]},{p['center'][1]},0]) union() {{
  translate([0,0,{back}]) linear_extrude(height={p['body'][2]})
   offset(r=12) square([{p['body'][0]-24},{p['body'][1]-24}],center=true);
  translate([{-p['body'][0]/2+26},0,{p['lowestZ']+p['cameraGlass']}])
   linear_extrude(height={p['cameraPlateau']}) offset(r=9) square([28,56],center=true);
'''
for long, short in p['lensCentersFromTopLeft']:
    code += f"  translate([{-p['body'][0]/2+long},{-p['body'][1]/2+short},{p['lowestZ']}]) cylinder(d={p['lensDiameter']},h={p['cameraGlass']},$fn=64);\n"
for top, length, side in [[34.28,6.9,-1],[48.43,11.2,-1],[62.63,11.2,-1],[55.53,17.7,1],[111.82,17.1,1]]:
    code += f"  translate([{-p['body'][0]/2+top-length/2},{side*(p['body'][1]/2+.225)-.225},{back+4.375-1.33}]) cube([{length},.45,2.66]);\n"
code += f''' }}
}}
module reference_card() {{
 translate([{c['center'][0]},{c['center'][1]},{c['bottomZ']}])
 linear_extrude(height={c['size'][2]}) offset(r=3.18)
 square([{c['size'][0]-6.36},{c['size'][1]-6.36}],center=true);
}}
'''
(root / 'cad/v3/references.scad').write_text(code)
print('CAD dimension reference solids generated')
