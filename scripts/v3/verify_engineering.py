"""Audit delivered engineering data and actual generated SVG/CSV artifacts."""
from pathlib import Path
import csv,hashlib,json,re,xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[2];out=root/'generated/v3';data=json.loads((out/'engineering/data.json').read_text());generation=json.loads((out/'blueprints/generation.json').read_text());checks=[]
def check(name,condition):
 checks.append(dict(name=name,pass_=bool(condition)))
 if not condition:print('FAIL',name)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for group in ['sourceSHA256','dataSourceSHA256','printFileSHA256']:
 for file,expected in data[group].items():check('current '+file,sha((root/'apps/workbench/public'/file) if group=='printFileSHA256' else root/file)==expected)
rows={r['id']:r for r in data['materials']};parts={p['id'] for p in data['productParts']};formal={p['id'] for p in data['parts']};drawings={d['id'] for d in data['drawingCatalog']};stepids={s['id'] for s in data['assembly']['steps']}
check('19 formal / 25 print / 37 model / 33 connections after retirement',len(formal)==19 and len(data['printParts'])==25 and len(parts)==37 and len(data['connections'])==33)
check('retired Hall and button retainer excluded',not {'home_sensor','lock_sensor','cover_sensor','bolt_magnet','cover_magnet','sensor_pads','button_retainer'} & parts)
check('reference models excluded from BOM and product parts',not {'phone','card'}&parts and not any(r['id'] in ['phone','card'] for r in rows.values()))
check('tools / coupons / spares / services excluded from installed count',all(r['installedQuantity']==0 for r in rows.values() if r['category'] in ['tools','coupons','spares','services']))
check('screw counts match CAD connection material IDs',all(r['installedQuantity']==sum(c['materialId']==r['id'] for c in data['connections']) for r in rows.values() if r['id'].startswith('screw-')))
assigned=[c for s in data['assembly']['steps'] if s['id'].startswith('S') for c in s['connections']];check('each of 33 connections assigned exactly once',len(assigned)==33 and len(set(assigned))==33 and set(assigned)=={c['id'] for c in data['connections']})
for s in data['assembly']['steps']:
 check(s['id']+' references',set(s['parts']+s['installedBefore'])<=parts and set(s['drawings'])<=drawings and all(r['id'] in rows and r['quantity']>0 and r['unit'] for r in s['materials']) and set(s['tools'])<=rows.keys())
 check(s['id']+' manual-only completion',s['completion']=='manual-only' and len(s['checks'])>0 and all(c['required'] and c['label'] for c in s['checks']))
check('all materials link to valid steps',all(set(r.get('steps',[]))<=stepids for r in rows.values()))
check('print orientation/support/spare metadata complete',all(p['orientation'] and p['support'] and isinstance(p['spareSuggestion'],int) for p in data['parts']))
pilot=data['nominalDimensions']['insert'][2]
assembly=data['nominalDimensions']['insert'][0]+0.05
check('insert pilot and assembly bores remain distinct',
      all(f['diameter']==pilot and f['assemblyDiameter']==assembly for part in data['nominalFeatures'].values() for f in part['print-pilot'] if f['kind']=='insert') and
      all(f['diameter']==assembly for part in data['nominalFeatures'].values() for f in part['assembly-clearance'] if f['kind']=='insert'))
check('all physical measurements initially empty',all(not r[k] for r in csv.DictReader((root/'docs/design/v3-physical-acceptance.csv').open(encoding='utf-8-sig')) for k in ['实测值/单位','方法/仪器','日期','执行人','结论','问题与调整']))
check('physical CSV has nine real rows',len(list(csv.DictReader((root/'docs/design/v3-physical-acceptance.csv').open(encoding='utf-8-sig'))))==9)
check('full CSV equals canonical master plus screw types',len(list(csv.DictReader((out/'engineering/complete-bom.csv').open(encoding='utf-8-sig'))))==len(json.loads((root/'hardware/v3/engineering/materials.json').read_text())['rows'])+len({c['materialId'] for c in data['connections']}))
font=TTFont(root/'assets/fonts/TLBlueprint.otf');cmap=font.getBestCmap();check('font allows embedding',font['OS/2'].fsType==0);missing=set();ns={'s':'http://www.w3.org/2000/svg'};sections=0
check('all blueprint topics actually generated',generation['complete'] and not generation['errors'] and len(generation['pages'])>=41)
for i,p in enumerate(generation['pages']):
 file=out/f'blueprints/drawings/{p["id"]}.svg';check(p['id']+' exact generated page hash',sha(file)==p['sha256']);svg=ET.fromstring(file.read_text());meta=json.loads(svg.find('s:metadata',ns).text)
 check(p['id']+' current fixed metadata',meta['cadFingerprint']==data['cadFingerprint'] and meta['dataFingerprint']==data['dataFingerprint'] and meta['fixedPose'] and meta['referenceExcluded'] and meta['page']==i+1 and meta['total']==len(generation['pages']))
 check(p['id']+' A3 millimeter sheet',svg.attrib['width']=='420mm' and svg.attrib['height']=='297mm' and svg.attrib['viewBox']=='0 0 420 297')
 for text in svg.findall('.//s:text',ns):
  missing.update(c for c in (text.text or '') if not c.isspace() and ord(c) not in cmap)
 for section in svg.findall('.//s:path[@data-section-part]',ns):
  sections+=1;check(p['id']+' closed actual section '+section.attrib['data-section-part'],int(section.attrib.get('data-closed-loops','0'))==section.attrib['d'].count('Z') and all((coordinates:=re.findall(r'[ML]([^MLZ]+)',loop)) and len(coordinates)>=4 and coordinates[0]==coordinates[-1] for loop in section.attrib['d'].split('Z') if loop) and section.attrib.get('fill-rule')=='evenodd')
check('no missing glyphs in any actual page',not missing);check('actual section paths generated',sections>20)
check('logical pin plan preserves UART/USB/Flash/strap pads',all(not r[1].startswith('GPIO20') and not r[1].startswith('GPIO21') for r in data['electrical']['signals']))
check('every harness wire has ID/color/ends/pin/route',len(data['electrical']['wires'])>=29 and all(len(r)==5 and all(r) for r in data['electrical']['wires']))
summary=dict(cadFingerprint=data['cadFingerprint'],dataFingerprint=data['dataFingerprint'],pages=len(generation['pages']),sections=sections,missingGlyphs=sorted(missing),checks=checks,failures=[c for c in checks if not c['pass_']],source_sha256={str(p.relative_to(root)):sha(p) for p in [Path(__file__),root/'apps/workbench/public/engineering.json',root/'assets/fonts/TLBlueprint.otf']})
(out/'engineering-verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print('Engineering audit:',len(checks),'checks;',len(summary['failures']),'failures;',sections,'actual section paths')
if summary['failures']:raise SystemExit(1)
