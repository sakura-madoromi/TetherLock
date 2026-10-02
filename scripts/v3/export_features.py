"""Export nominal cut features by instrumenting the actual CAD hole helpers.

Coordinates are assembly design coordinates at travel=0/lid=0. Tool overtravel
is kept separate from usable physical bore depth. No STL hole-size inference.
"""
from pathlib import Path
import hashlib,json,os,subprocess

def export(root):
    out=root/'artifacts/v3';wrapper=out/'feature-metadata.scad'
    wrapper.write_text(f'include <{root}/cad/v3/assembly.scad>\nview="metadata";\n'+'''
for(mode=["print-pilot","assembly-clearance"]) {
 for(n=print_parts) let($export_features=true,$feature_part=n,$print_bores=mode=="print-pilot") {
  echo(["TL_PART",n,mode]);named(n);
 }
}
''')
    p=subprocess.run([os.environ.get('OPENSCAD',str(root/'.tools/squashfs-root/AppRun')),'-o',str(wrapper.with_suffix('.csg')),str(wrapper)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    assert p.returncode==0 and 'ERROR:' not in p.stderr,p.stderr
    records={};mode=None;part=None
    for line in p.stderr.splitlines():
        if not line.startswith('ECHO: '):continue
        entry=json.loads(line[6:])
        if entry[0]=='TL_PART':
            part,mode=entry[1:];records.setdefault(part,{'print-pilot':[],'assembly-clearance':[]})
        elif entry[0]=='TL_FEATURE':
            _,owner,axis,center,diameter,length,kind,details=entry
            assert owner==part,(owner,part)
            records[owner][mode].append(dict(axis=axis,center=center,diameter=diameter,cutToolLength=length,kind=kind,details=details))
    for owner,states in records.items():
        assert len(states['print-pilot'])==len(states['assembly-clearance']),owner
        for i,(a,b) in enumerate(zip(states['print-pilot'],states['assembly-clearance'])):
            a['id']=b['id']=f'{owner}-hole-{i+1:02}'
            a['assemblyDiameter']=b['diameter']
            a['coordinateBasis']='assembly design coordinates; no print rotation applied'
            a['depthNote']='CAD切除工具长度含越界让位，不等于实物钻孔深度。铜螺母目标深度和剩余壁厚见装配特征。'
    result=dict(version='1',units='mm',coordinatePose={'lid':0,'travel':0},parts=records,sourceSHA256={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'cad/v3').glob('*.scad'))})
    (out/'features.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    return result
if __name__=='__main__':
    d=export(Path(__file__).resolve().parents[2]);print('Nominal features:',sum(len(p['print-pilot']) for p in d['parts'].values()),'in',len(d['parts']),'print parts')
