"""Render V3 views from the assembly source and a measured STL top plan."""
from pathlib import Path
import concurrent.futures, hashlib, json, os, shutil, subprocess, sys

root=Path(__file__).resolve().parents[2]
out=root/'artifacts/v3'
oscad=os.environ.get('OPENSCAD',str(root/'.tools/squashfs-root/AppRun'))
views=[('closed',{'travel':14},60),('open',{'lid_angle':105},60),
       ('exploded',{'view':'exploded'},65),('lock',{'view':'lock','travel':14},50)]

def render(v):
    name,params,angle=v
    cmd=[oscad,'-o',str(out/(name+'.png')),'--imgsize=1600,1000','--viewall','--autocenter',
         '--projection=o','--colorscheme=Tomorrow',f'--camera=0,0,0,{angle},0,205,500']
    for k,x in params.items():cmd+=['-D',f'{k}={json.dumps(x)}']
    p=subprocess.run(cmd+[str(root/'cad/v3/assembly.scad')],capture_output=True,text=True,
                     env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    assert p.returncode==0 and 'ERROR:' not in p.stderr,p.stderr
    return name

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    print('Rendered:',', '.join(pool.map(render,views)))

sys.path.insert(0,str(root/'scripts/shared'))
from stl_probe import load_stl
names={'base_box':'#dbe3ed','lock_base':'#8f9cad','motor':'#e7b85c','bolt':'#2b7ac7',
       'nut_carriage':'#70b7d0','drive_nut':'#dba748','electronics_tray':'#b6c0cc',
       'esp':'#36a783','upper_deck':'#b6c0cc','bridge_board':'#36a783','oled':'#e7b85c',
       'button':'#e7b85c'}
triangles=[]
for name,color in names.items():
    file=out/(('pose_' if name in ['base_box','lock_base','bolt','nut_carriage','electronics_tray','upper_deck'] else 'hardware_')+name+'.stl')
    for tri in load_stl(file):
        a,b,c=tri
        area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        if area>0.0001:triangles.append((sum(v[2] for v in tri)/3,color,tri))
scale=3; x0=420; y0=330
def xy(x,y):return x0+scale*x,y0+scale*y
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="750" viewBox="0 0 1100 750">',
     '<rect width="1100" height="750" fill="#f8fafc"/>',
     '<g font-family="sans-serif" fill="#182838">',
     '<text x="60" y="50" font-size="27">TetherLock V3 · 尺寸与结构</text>',
     '<text x="60" y="81" font-size="15">退栓俯视：来自分件 STL 投影；已移除主盖、机构上盖及压板，以显示传动。</text>']
for z,color,tri in sorted(triangles,key=lambda t:t[0]):
    pts=' '.join(f'{xy(v[0],v[1])[0]:.2f},{xy(v[0],v[1])[1]:.2f}' for v in tri)
    svg.append(f'<polygon points="{pts}" fill="{color}"/>')
x,y=xy(-115.5,-47.5)
svg += [f'<rect x="{x}" y="{y}" width="555" height="285" fill="none" stroke="#437d9e" stroke-dasharray="8 5"/>',
        '<text x="155" y="314" font-size="23">185 × 95 × 40 mm</text>',
        '<text x="220" y="346" font-size="17">储物验收包络</text>',
        '<path d="M60 132V110H780V132 M42 150H25V510H42" fill="none" stroke="#52687b"/>',
        '<text x="372" y="103" font-size="18">240 mm</text>',
        '<text x="14" y="365" font-size="18" transform="rotate(-90 14 365)">120 mm</text>',
        '<text x="802" y="170" font-size="19">整机高度 55 mm</text>',
        '<text x="802" y="218" font-size="16">丝杠 X=84.5</text>',
        '<text x="802" y="245" font-size="16">实心栓 X=103</text>',
        '<text x="802" y="272" font-size="16">机构行程 14 mm</text>',
        '<text x="802" y="318" font-size="16">电池在机构下方</text>',
        '<text x="802" y="345" font-size="16">底部维护盖可拆</text>',
        '<text x="802" y="393" font-size="16">前方电子件分层</text>',
        '<text x="802" y="420" font-size="16">无外露 USB</text>',
        '<text x="60" y="556" font-size="16">后方 ↑　前方 ↓　　蓝：实心锁栓　青：浮动螺母滑块　黄：电机/外购件　绿：电路板</text>',
        '<text x="60" y="599" font-size="18">结构样机 · 采购前核对硬件包络 · 局部支撑打印 · 强度与 ≤15 秒开锁待实测</text>',
        '<text x="60" y="636" font-size="15">尺寸单位 mm；盖、压条和线缆未显示于本俯视图。锁扣及运动关系见总装 CAD。</text>',
        '</g></svg>']
(out/'structure.svg').write_text('\n'.join(svg)+'\n')
converter=shutil.which('rsvg-convert')
if converter:
    subprocess.run([converter,'-o',str(out/'structure.png'),str(out/'structure.svg')],check=True)
else:
    # Never ship a previous revision's raster if no SVG rasterizer is available.
    (out/'structure.png').unlink(missing_ok=True)
hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'cad/v3').glob('*.scad')}
manifest={'source_sha256':hashes,'views':views,'output_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [*(out/(n+'.png') for n,_,_ in views),out/'structure.svg',out/'structure.png'] if p.exists()}}
(out/'render-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
