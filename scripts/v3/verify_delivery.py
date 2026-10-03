"""Verify actual archive contents, frozen data and current-source evidence."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,re,struct,zipfile
root=Path(__file__).resolve().parents[2];out=root/'generated/v3';checks=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def check(name,condition):
 checks.append(dict(name=name,pass_=bool(condition)))
 if not condition:print('FAIL',name)
data=json.loads((root/'apps/workbench/public/engineering.json').read_text());manifest=json.loads((root/'apps/workbench/public/manifest.json').read_text());generation=json.loads((out/'blueprints/generation.json').read_text())
for name in ['CAD','Workbench','Blueprints']:
 with zipfile.ZipFile(out/f'TetherLock-V3-{name}.zip') as z:check(name+' CRC',z.testzip() is None)
for filename in ['verification.json','window/verification.json','hinge-hall/verification.json','review-verification.json','references/verification.json','assembly-paths/verification.json','purchased-specs/verification.json','engineering-verification.json']:
 proof=json.loads((out/filename).read_text());source=proof.get('source_export_sha256',proof.get('source_sha256',{}));check(filename+' has current source evidence',bool(source) and all(sha((root/name).read_bytes())==value for name,value in source.items()));check(filename+' no failures',not proof['failures'])
with zipfile.ZipFile(out/'TetherLock-V3-CAD.zip') as z:
 release=json.loads(z.read('generated/v3/delivery-manifest.json'));check('CAD manifest fingerprint',release['cadFingerprint']==data['cadFingerprint'] and release['dataFingerprint']==data['dataFingerprint'])
 for name,value in release['files_sha256'].items():check('CAD archive / '+name,sha(z.read(name))==value and sha((root/name).read_bytes())==value)
 check('CAD print set equals current verified files',set(n for n in z.namelist() if n.startswith('generated/v3/print/') and n.endswith('.stl'))=={f'generated/v3/print/{id}.stl' for id in data['printParts']})
 check('CAD frozen engineering data',json.loads(z.read('generated/v3/engineering/data.json'))==data)
with zipfile.ZipFile(out/'TetherLock-V3-Blueprints.zip') as z:
 check('Blueprint frozen engineering data',json.loads(z.read('engineering-data.json'))==data)
 check('Blueprint pages equal actual generation catalog',{n for n in z.namelist() if n.startswith('drawings/')}=={f'drawings/{p["id"]}.svg' for p in generation['pages']})
 for p in generation['pages']:check('Blueprint archived actual page '+p['id'],sha(z.read('drawings/'+p['id']+'.svg'))==p['sha256'])
 check('Blueprint required lists / assembly / factory / license / hashes',all(n in z.namelist() for n in ['catalog.json','source-fingerprints.json','lists/complete-bom.csv','lists/purchase-bom.csv','lists/print-list.csv','lists/tools-spares.csv','assembly-printable.html','fabrication/acrylic-1to1.svg','fabrication/acrylic-1to1.dxf','fonts/LICENSE-Noto-CJK.txt']))
with zipfile.ZipFile(out/'TetherLock-V3-Workbench.zip') as z:
 for p in sorted((root/'generated/workbench/dist').rglob('*')):
  if p.is_file():check('Workbench actual built file '+str(p.relative_to(root/'generated/workbench/dist')),z.read(str(p.relative_to(root/'generated/workbench/dist')))==p.read_bytes())
 check('Workbench frozen engineering data',json.loads(z.read('engineering.json'))==data)
 for name in ['CAD','Blueprints']:check('Workbench exact nested '+name+' package',z.read(f'downloads/TetherLock-V3-{name}.zip')==(out/f'TetherLock-V3-{name}.zip').read_bytes())
 check('Workbench model and print quantities',len([n for n in z.namelist() if n.startswith('models/')])==len(data['productParts']) and len([n for n in z.namelist() if n.startswith('print/')])==len(data['printParts']))
 check('current CAD download enabled',manifest['cadPackageCurrent'])
for filename in ['purchased-specs/browser/browser-results.json','engineering-workbench/browser/results.json']:
 proof=json.loads((out/filename).read_text());check(filename+' passed',proof['pass']);check(filename+' current runtime sources',bool(proof.get('source_sha256')) and all(sha((root/name).read_bytes())==value for name,value in proof['source_sha256'].items()))
for filename,w,h in [('engineering-workbench/browser/A04.png',3840,2715),('engineering-workbench/browser/M03.png',2560,1530),('purchased-specs/browser/preview-4k.png',3840,2160)]:
 b=(out/filename).read_bytes();check(filename+' PNG dimensions',b[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',b[16:24])==(w,h))
for filename in ['engineering-workbench/browser/A04.pdf']:
 b=(out/filename).read_bytes();boxes=re.findall(rb'/MediaBox\s*\[([^]]+)\]',b);check(filename+' actual A3 PDF',b[:4]==b'%PDF' and len(boxes)==1 and all(abs(float(v)*25.4/72-target)<.3 for v,target in zip(boxes[0].split()[2:],[420,297])))
report=dict(generatedAt=datetime.now(timezone.utc).isoformat(),cadFingerprint=data['cadFingerprint'],dataFingerprint=data['dataFingerprint'],complete=all(c['pass_'] for c in checks),checks=checks,failures=[c for c in checks if not c['pass_']],packages={name:dict(file=f'generated/v3/TetherLock-V3-{name}.zip',sha256=sha((out/f'TetherLock-V3-{name}.zip').read_bytes()),bytes=(out/f'TetherLock-V3-{name}.zip').stat().st_size) for name in ['CAD','Workbench','Blueprints']},unresolved=data['unresolved'],source_sha256={str(Path(__file__).relative_to(root)):sha(Path(__file__).read_bytes())})
(out/'purchased-specs/delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('Delivery audit:',len(checks),'checks;',len(report['failures']),'failures')
if report['failures']:raise SystemExit(1)
