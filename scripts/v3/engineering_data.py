"""Join shared material master, CAD connections and verified STL measurements.

STL extents are explicitly measured envelopes, never substituted for hole sizes.
"""
from pathlib import Path
import collections,csv,re,hashlib,io,json,os,subprocess,sys
from datetime import datetime, timezone
from export_fasteners import export
from export_features import export as export_features

root=Path(__file__).resolve().parents[2]
master=json.loads((root/'engineering/materials.json').read_text())
proof=json.loads((root/'artifacts/v3/verification.json').read_text())
assert not proof['quick'] and not proof['failures']
for file,expected in proof['source_export_sha256'].items():
    assert hashlib.sha256((root/file).read_bytes()).hexdigest()==expected,f'Stale geometry: {file}'
hardware=export(root);rows=master['rows']
# Nominal parameter values come from OpenSCAD, separately from measured meshes.
wrapper=root/'artifacts/v3/engineering-metadata.scad'
wrapper.write_text(f'include <{root}/cad/v3/assembly.scad>\nview="metadata";\n'+'''echo([
 ["closedSize",[L,W,H]],["stroke",stroke],["hinge",[hinge_y,hinge_z]],
 ["shell",[wall,floor_t,shell_top,lid_bottom]],
 ["window",[[window_x0,window_x1],[window_y0,window_y1],window_bar_x,window_bar_w,window_root_r]],
 ["windowStack",[window_inner_z,window_inner_top,window_ear_top,window_pane_z,window_outer_z,H]],
 ["windowPane",[window_x1-window_x0+4,window_y1-window_y0+4,window_pane_t]],
 ["windowConnections",window_clamps],["insert",[insert_od,insert_len,insert_pilot_d]],
 ["hingePin",[hinge_pin_x,hinge_pin_len,hinge_bore,pin_end_play]],
 ["fixedKnuckles",fixed_knuckles],["movingKnuckles",moving_knuckles],
 ["motor",[motor_l,motor_w,motor_h,motor_axis_offset,shaft_l,shaft_d,shaft_pitch]],
 ["button",[button_panel_x,button_y,button_z,button_hole_d,button_flange_d,button_body_l,button_terminal_l,button_face_l]],
 ["tie",[tie_width,tie_slot_width]],
 ["flangeNut",[nut_af,nut_flange_d,nut_height,nut_flange_t]],
 ["lockAxis",[screw_x,bolt_x,axis_z]],["guide",[guide_bottom,guide_top,guide_cap_t,guide_clearance]],
 ["nutPocket",[nut_slot_d,nut_slot_y,nut_slot_t]],
 ["lockMounts",lock_mounts],["guideScrews",guide_screws],["motorScrews",motor_screws],
 ["batteryScrews",battery_screws],["trayScrews",tray_screws],["deckScrews",deck_screws]
]);\nlet($export_features=true,$feature_part="thermal_insert") {inserts_fixed();inserts_lid();}\n''')
p=subprocess.run([os.environ.get('OPENSCAD',str(root/'.tools/squashfs-root/AppRun')),'-o',str(wrapper.with_suffix('.csg')),str(wrapper)],capture_output=True,text=True,env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
assert p.returncode==0 and 'ERROR:' not in p.stderr,p.stderr
payloads=[json.loads(l[6:]) for l in p.stderr.splitlines() if l.startswith('ECHO: ')]
nominal=dict(next(v for v in payloads if isinstance(v[0],list) and v[0][0]=='closedSize'))
thermal=[dict(center=v[3],outerDiameter=v[4],length=v[5]) for v in payloads if v[0]=='TL_FEATURE' and v[1]=='thermal_insert' and v[4]==nominal['insert'][0]]
assert len(thermal)==10
for material,qty in collections.Counter(c['materialId'] for c in hardware['connections']).items():
    connections=[c for c in hardware['connections'] if c['materialId']==material];sample=connections[0]
    rows.append(dict(id=material,name=f"M{sample['diameter']}×{sample['length']} "+('沉头' if sample['head']=='countersunk' else '普通头'),category='purchased',installedQuantity=qty,purchaseQuantity=max(10,qty+3),unit='枚',specification=f"M{sample['diameter']}×{sample['length']} mm；头部须与CAD包络匹配",candidate='公制机牙螺钉，同批次同头型',alternatives='相同牙距、长度与头部；改变规格须改CAD',parts=sorted({p for c in connections for p in c['owners']}),connections=[c['id'] for c in connections],mounting='按连接ID从对应方向安装；铜螺母或打印导孔见图纸',unitPrice=.15,packageQuantity=max(10,qty+3),packagePrice=.15*max(10,qty+3),status='physical-confirmation',source=['cad/v3/hardware.scad'],acceptance='卡尺测杆长/头径/头高，试块验证沉头；检查铜螺母啮合与盲孔底余量。',note='数量从CAD配置导出，不保留旧硬编码总数。'))
formal=proof['metadata']['assembly_parts'];printparts=proof['metadata']['print_parts'];partids=set(formal+proof['metadata']['hardware_parts']+printparts)
for row in rows:
    assert set(row['parts'])<=partids,(row['id'],row['parts'])
    row['installedSubtotal']=round(row['installedQuantity']*row['unitPrice'],2)
assert len({row['id'] for row in rows})==len(rows)
assert {r['id'] for r in rows if r['category']=='print'}==set(formal),'Formal print master does not match CAD'
assert {r['id'] for r in rows if r['category']=='coupons'}==set(printparts)-set(formal)
for r in rows:
    if r['category'] in ['tools','coupons','spares','services']:assert r['installedQuantity']==0
sha={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'cad/v3').glob('*.scad'))}
fingerprint=hashlib.sha256(json.dumps(sha,sort_keys=True).encode()).hexdigest()
results={r['name']:r for r in proof['results']}
print_guidance=json.loads((root/'engineering/print-guidance.json').read_text())
assert set(print_guidance['parts'])==set(formal)
parts=[]
for ident in formal:
    pose=results['pose_'+ident];printed=results[ident]
    parts.append(dict(id=ident,quantity=1,material=master['materialDefault'],printFile=f'print/{ident}.stl',worldBounds=pose['bbox'],printBounds=printed['bbox'],measuredSize=[round(b-a,3) for a,b in pose['bbox']],dimensionKind='STL mesh measurement, not nominal hole requirements',formal=True,volume=pose['volume_mm3'],drawing=next(t['id'] for t in json.loads((root/'engineering/drawing-topics.json').read_text())['topics'] if t['parts']==[ident]),support='以实际切片确认桥接及悬空；清理轴孔、孔口和运动面',orientation='主盖外表面朝床' if ident=='lid' else '内表面朝床、沉头口朝下' if ident=='window_grille' else '已导出落床姿态；结合零件图核对支撑'))
for p in parts:
    guidance=print_guidance['parts'][p['id']];p.update(orientation=guidance['orientation'],support=guidance['support'],spareSuggestion=guidance['spare'])
    row=next(r for r in rows if r['id']==p['id']);row['mounting']=guidance['orientation'];row['acceptance']=guidance['support'];row['note']=print_guidance['default']+' 备用建议'+str(guidance['spare'])+'件，另列不计装机。'
total=lambda categories,field:round(sum(r[field] for r in rows if r['category'] in categories),2)
data=dict(version=master['version'],generatedAt=datetime.now(timezone.utc).isoformat(),units='mm',cadFingerprint=fingerprint,sourceSHA256=sha,materials=rows,connections=hardware['connections'],parts=parts,printParts=printparts,currency='CNY',pricesAreEstimates=True,targetDeviceCost=100,costs=dict(device=total(['purchased','consumables'],'installedSubtotal'),purchase=total(['purchased','consumables'],'packagePrice'),tools=total(['tools'],'packagePrice')),unresolved=[dict(id=r['id'],reason=r['note']) for r in rows if r['status']=='unresolved'],verification=dict(geometryChecks=len(proof['results']),hardware='provisional; unresolved modules must not be shown as verified physical assembly'))
path_proof=json.loads((root/'artifacts/v3/assembly-paths/verification.json').read_text())
assert not path_proof['failures'],'Assembly sweep failed'
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in path_proof['source_sha256'].items()),'Stale assembly sweep'
data['assemblyVerification']={'scope':path_proof['scope'],'stepIds':path_proof['stepIds'],'checks':len(path_proof['results'])}
data['assembly']=json.loads((root/'engineering/assembly-steps.json').read_text())
data['fontLicense']=(root/'viewer/public/fonts/LICENSE-Noto-CJK.txt').read_text()
data['assemblyFingerprint']=hashlib.sha256((root/'engineering/assembly-steps.json').read_bytes()).hexdigest()
for row in rows:
    row['steps']=[s['id'] for s in data['assembly']['steps'] if any(r['id']==row['id'] for r in s['materials'])]
for step in data['assembly']['steps']:
    assert set(step['parts']+step['installedBefore'])<=partids,step['id']
    assert set(step['drawings'])<=set(d['id'] for d in json.loads((root/'engineering/drawing-topics.json').read_text())['topics']),step['id']
    assert all(r['id'] in {r['id'] for r in rows} for r in step['materials']),step['id']
data['electrical']=json.loads((root/'engineering/electrical.json').read_text())
data['nominalDimensions']=nominal
data['referenceDimensions']=json.loads((root/'engineering/references.json').read_text())
data['drawingCatalog']=json.loads((root/'engineering/drawing-topics.json').read_text())['topics']
data['nominalFeatures']=export_features(root)['parts']
# The battery boss is a CAD cylinder primitive; read its nominal source literal,
# rather than using an STL bounding box as a manufacturing dimension.
boss=re.search(r'for\(p=battery_screws\) translate\(\[p\[0\],p\[1\],([\d.]+)\]\) cylinder\(r=([\d.]+),h=([\d.]+)\)',(root/'cad/v3/enclosure.scad').read_text())
assert boss,'Battery insert boss metadata needs updating'
boss_z,boss_radius,boss_h=map(float,boss.groups())
for t in thermal:
    t['connectionIds']=[c['id'] for c in data['connections'] if c['position'][:2]==t['center'][:2]]
    connection=next(c for c in data['connections'] if c['id'] in t['connectionIds'])
    t['owner']='lid' if connection['group']=='lid' else 'base_box'
    t['direction']='+Z 从内侧热装' if connection['position'][2]<t['center'][2] else '−Z 从承座上方热装'
    if connection['id'].startswith('F-battery'):t['direction']='+Z 从底部维护口热装'
    elif connection['id'].startswith('F-window'):t['direction']='+Z 从盖内侧热装'
    if connection['id'].startswith('F-window'):
        t['remainingAxial']=nominal['closedSize'][2]-(t['center'][2]+t['length'])
        rebate=next(f for f in data['nominalFeatures']['lid']['print-pilot'] if f['axis']=='BOX' and f['details'][1]=='cut' and f['center'][:2]==[nominal['window'][0][0]-3,nominal['window'][1][0]-3])
        y0=rebate['center'][1];y1=y0+rebate['details'][0][1]
        t['remainingRadial']=min(abs(t['center'][1]-y0),abs(t['center'][1]-y1))-t['outerDiameter']/2
        t['wallNote']='顶面余料；靠窗片槽横向最薄处较小，首件热装/保持力必须验收。'
    elif connection['id'].startswith('F-battery'):
        t['remainingAxial']=boss_z+boss_h-(t['center'][2]+t['length'])
        t['remainingRadial']=boss_radius-t['outerDiameter']/2
        t['wallNote']='柱顶与径向名义余料；中央较小让位孔贯穿，不能当成实心盲底。'
    else:
        solids=[f for f in data['nominalFeatures']['base_box']['print-pilot'] if f['axis']=='BOX' and f['details'][1]=='solid' and all(f['center'][i]<=t['center'][i] and t['center'][i]+(t['length'] if i==2 else 0)<=f['center'][i]+f['details'][0][i]+1e-6 for i in range(3))]
        seat=min(solids,key=lambda f:f['details'][0][0]*f['details'][0][1]*f['details'][0][2])
        t['remainingAxial']=t['center'][2]-seat['center'][2]
        t['remainingRadial']=min(min(t['center'][i]-seat['center'][i],seat['center'][i]+seat['details'][0][i]-t['center'][i]) for i in [0,1])-t['outerDiameter']/2
        t['wallNote']='承座下方台阶与径向名义余料；中央让位孔单列，孔径不视为铜螺母内螺纹。'
    t['remainingAxial']=round(t['remainingAxial'],3);t['remainingRadial']=round(t['remainingRadial'],3)
data['thermalInserts']=thermal

display={p['id']:p for p in json.loads((root/'engineering/part-display.json').read_text())['parts']}
data['productParts']=[]
for ident in formal+proof['metadata']['hardware_parts']+['fasteners_'+g for g in hardware['group_counts']]:
    assert ident in display,'Part display identity missing: '+ident
    kind='printed' if ident in formal else 'fastener' if ident.startswith('fasteners_') else 'hardware'
    quantity=hardware['group_counts'][ident[10:]] if kind=='fastener' else 6 if ident=='inserts_fixed' else 4 if ident=='inserts_lid' else 1
    data['productParts'].append({**display[ident],'kind':kind,'quantity':quantity,'file':f'models/{ident}.stl'})
data['printFileSHA256']={f'print/{ident}.stl':proof['source_export_sha256'][f'stl/v3/{ident}.stl'] for ident in printparts}
data['dataSourceSHA256']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted([*list((root/'engineering').glob('*.json')),*[root/'viewer/src'/n for n in ['blueprint.js','sections.js','drawing.js','state.js','assembly.js','assembly-progress.js','bom.js']],*[root/'scripts/v3'/n for n in ['engineering_data.py','export_features.py','export_fasteners.py']]])}
data['dataFingerprint']=hashlib.sha256(json.dumps(data['dataSourceSHA256'],sort_keys=True).encode()).hexdigest()
out=root/'artifacts/v3/engineering';out.mkdir(exist_ok=True)
# Rebuilding unchanged engineering inputs preserves the frozen revision date.
previous=out/'data.json'
if previous.exists():
    old=json.loads(previous.read_text())
    if {k:v for k,v in old.items() if k!='generatedAt'}=={k:v for k,v in data.items() if k!='generatedAt'}:data['generatedAt']=old['generatedAt']

(out/'data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
public=root/'viewer/public';public.mkdir(exist_ok=True);(public/'engineering.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
columns=['version','generatedAt','cadFingerprint','dataFingerprint','id','name','category','installedQuantity','purchaseQuantity','unit','specification','candidate','alternatives','parts','connections','mounting','unitPrice','installedSubtotal','packageQuantity','packagePrice','status','source','acceptance','note']
for filename,selected in [('complete-bom.csv',rows),('purchase-bom.csv',[r for r in rows if r['category'] in ['purchased','consumables']]),('print-list.csv',[r for r in rows if r['category']=='print']),('tools-spares.csv',[r for r in rows if r['category'] in ['tools','coupons','spares','services']])]:
    buf=io.StringIO();writer=csv.DictWriter(buf,columns,extrasaction='ignore');writer.writeheader()
    for row in selected:
        fields={**{k:data[k] for k in ['version','generatedAt','cadFingerprint','dataFingerprint']},**row}
        writer.writerow({k:' | '.join(map(str,v)) if isinstance(v,list) else v for k,v in fields.items() if k in columns})
    (out/filename).write_text('\ufeff'+buf.getvalue())
(root/'docs/design/v3-bom.csv').write_bytes((out/'complete-bom.csv').read_bytes())
print(f'Engineering data: {len(rows)} material rows; {len(parts)} formal print parts; {len(hardware["connections"])} connections; device estimate ¥{data["costs"]["device"]}; {len(data["unresolved"])} unresolved items')
