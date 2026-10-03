"""Export hardware and connection IDs from the actual canonical CAD tables."""
from pathlib import Path
import json, os, subprocess

def export(root):
    out=root/'generated/v3';out.mkdir(exist_ok=True)
    wrapper=out/'fastener-metadata.scad'
    wrapper.write_text(f'include <{root}/hardware/v3/cad/assembly.scad>\nview="metadata";\necho([for(k=["fixed","drive","lid"]) [k,fastener_specs(k),fastener_ids(k)]]);\n')
    p=subprocess.run([os.environ.get('OPENSCAD','openscad'),'-o',str(out/'fastener-metadata.csg'),str(wrapper)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    assert p.returncode==0 and 'ERROR:' not in p.stderr,p.stderr
    groups=json.loads([l[6:] for l in p.stderr.splitlines() if l.startswith('ECHO: ')][-1])
    specs=[];connections=[];counts={}
    for name,group,ids in groups:
        assert len(group)==len(ids),f'{name}: connection names no longer match CAD table'
        specs.extend(group);counts[name]=len(group)
        for ident,s in zip(ids,group):
            connections.append(dict(id=ident,group=name,position=s[:3],length=s[3],diameter=s[4],head='countersunk' if s[5] else 'normal',rotationX=s[6],owners=s[8],materialId=f'screw-M{s[4]}x{s[3]}-'+('CS' if s[5] else 'PAN')))
    assert len({c['id'] for c in connections})==len(connections),'Duplicate CAD connection ID'
    result={'schema':['x','y','z','length','diameter','flush','rotationX','headless','owners'],'pose':{'travel_mm':0,'lid_angle':0},'group_counts':counts,'specs':specs,'connections':connections}
    (out/'fasteners.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result

if __name__=='__main__':
    result=export(Path(__file__).resolve().parents[2]);print('CAD connections:',len(result['connections']))
