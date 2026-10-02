"""Reproduce the independent review's additional moving-drive checks."""
from pathlib import Path
import concurrent.futures, hashlib, json, os, subprocess

root=Path(__file__).resolve().parents[2]
probe=root/'docs/reviews/v3-cad-evidence/travel-probe.scad'
out=root/'artifacts/v3/review'
out.mkdir(parents=True,exist_ok=True)
oscad=os.environ.get('OPENSCAD',str(root/'.tools/squashfs-root/AppRun'))

def check(t):
    path=out/f'travel-{t}.stl'
    path.unlink(missing_ok=True)
    p=subprocess.run([oscad,'-o',str(path),'-D',f'travel={t}',str(probe)],
                     capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    (out/f'travel-{t}.log').write_text(p.stderr)
    return {'travel_mm':t,'pass':not path.exists() and 'Current top level object is empty' in p.stderr and 'ERROR:' not in p.stderr}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(check,[0.5,1.5,3,5,9,10,11,12,13,13.5]))
hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [probe,*sorted((root/'cad/v3').glob('*.scad'))]}
summary={'scope':'additional discrete drive-group motion checks; not a continuous sweep proof','results':results,'source_sha256':hashes,'failures':[r for r in results if not r['pass']]}
(root/'artifacts/v3/review-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print('Independent review checks:',len(results),'Failures:',len(summary['failures']))
if summary['failures']:raise SystemExit(1)
