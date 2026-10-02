"""Package current verified CAD, print STL, drawings, BOM and evidence."""
from pathlib import Path
import hashlib,json,os,subprocess,zipfile

root=Path(__file__).resolve().parents[2];out=root/'artifacts/v3'
proof=json.loads((out/'verification.json').read_text());assert not proof['failures'] and not proof['quick']
for file,sha in proof['source_export_sha256'].items():assert hashlib.sha256((root/file).read_bytes()).hexdigest()==sha,file
for file in ['window/verification.json','review-verification.json','hinge-hall/verification.json','references/verification.json','assembly-paths/verification.json','purchased-specs/verification.json']:
    extra=json.loads((out/file).read_text());assert not extra['failures'],file
    assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in extra['source_sha256'].items()),file

audit=json.loads((out/'engineering-verification.json').read_text());assert not audit['failures'],'Engineering audit failed'
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in audit['source_sha256'].items()),'Stale engineering audit'

render=json.loads((out/'render-manifest.json').read_text())
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in render['source_sha256'].items()),'Stale renders'
assert all(hashlib.sha256((out/p).read_bytes()).hexdigest()==sha for p,sha in render['output_sha256'].items()),'Changed renders'
from export_fasteners import export
export(root)

files=[*sorted((root/'cad/v3').glob('*')),*[root/f'stl/v3/{part}.stl' for part in proof['metadata']['print_parts']],
       *sorted((root/'scripts/v3').glob('*.py'))]
files += [root/f'docs/design/{name}' for name in ['v3-bom.csv','v3-cad.md','v3-window-grille.md','v3-hinge-hall.md','v3-proposal.md','v3-proposal.svg','v3-proposal.png']]
files += [root/'docs/design/v3-purchased-specs.md',root/'docs/reviews/v3-purchased-specs-review.md',out/'purchased-specs/verification.json']
files += list((root/'docs/reviews/v3-purchased-specs-evidence').glob('*'))
files += list((root/'bench/v3').rglob('*'))
files += list((root/'engineering').glob('*.json'))
files += list((out/'procurement').glob('*.json'))
files += list((root/'docs/reviews').glob('v3-procurement-*2026-10-02.*'))
files += list((root/'docs/reviews/v3-procurement-evidence').glob('*'))
files += list((root/'docs/reviews/v3-current-procurement-evidence').glob('*'))
files += list((root/'viewer/src').glob('*'))
files += [root/'package.json',root/'package-lock.json',root/'vite.config.js',root/'scripts/v3/blueprints.mjs']
files += list((out/'engineering').glob('*'))
files += [out/'features.json',out/'assembly-paths/verification.json',out/'references/verification.json',root/'docs/design/v3-procurement-status.md',root/'docs/design/v3-physical-acceptance.csv',root/'docs/design/v3-plan1-delivery.md',root/'docs/design/v3-viewer.md',out/'engineering-verification.json']
files += [root/'scripts/shared/stl_probe.py',
          *[root/f'docs/reviews/{name}' for name in ['v3-cad-review-2026-10-01.md','v3-cad-evidence/travel-probe.scad','v3-window-grille-review-2026-10-01.md']]]
files += list((root/'docs/reviews/v3-window-grille-evidence').glob('*'))
files += [root/'docs/reviews/v3-hinge-hall-review-2026-10-01.md',*list((root/'docs/reviews/v3-hinge-hall-evidence').glob('*'))]
files += [out/name for name in ['closed.png','open.png','exploded.png','lock.png','structure.svg','structure.png',
                                'verification.json','review-verification.json','window/verification.json','hinge-hall/verification.json','hinge-hall/hall-positions.json','hinge-hall/hall-assessment.json','render-manifest.json','fasteners.json']]
files=[p for p in files if p.is_file()]
data=json.loads((out/'engineering/data.json').read_text())
manifest={
    'version':data['version'],
    'cadFingerprint':data['cadFingerprint'],
    'dataFingerprint':data['dataFingerprint'],
    'type':'TetherLock V3 pin-keeper and double grille structural CAD prototype',
    'checks':len(proof['results']),
    'window_checks':len(json.loads((out/'window/verification.json').read_text())['results']),
    'additional_review_checks':len(json.loads((out/'review-verification.json').read_text())['results']),
    'hinge_hall_checks':len(json.loads((out/'hinge-hall/verification.json').read_text())['results']),
    'position_feedback_status':'Hall removed; mechanical SKU, bracket and trigger remain pending; manual bench only',
    'files_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
}
(out/'delivery-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');files.append(out/'delivery-manifest.json')
readme='''TetherLock V3 双层同色防护栅窗结构样机
打开 cad/v3/assembly.scad，单位mm；闭合240×120×55。
外栅随盖一体打印，内栅独立打印，与外壳同色同耗材；亚克力149×82×1.5，内外栅直接捕获，固定耳承载预紧力。
说明：docs/design/v3-cad.md、v3-window-grille.md；BOM：docs/design/v3-bom.csv。
stl/v3 内25种打印文件，含两只不同的销轴限位端盖及孔径试块。
电机已改M4×0.7输出55mm；R16按钮移到右侧凹入安装位；绑带槽3mm。
保留钢销，取消独立轴环和紧定螺钉；十处可拆连接采用M2铜螺母原型。
霍尔和磁铁已取消；机械到位检测尚待选型/支架/触发验收。
当前仅作人工台架，不支持自动闭锁验收。螺母尺寸及按钮螺纹孔径仍待实测。
变更及限制见docs/design/v3-purchased-specs.md；历史评审与bench草图不适用于当前采购。
名义几何已经验证，实物强度、板厚及接触平整度、螺纹保持力和开锁时间仍须试装/实测。
请安装OpenSCAD并将其加入PATH，或通过OPENSCAD环境变量设置可执行文件路径。
'''
destination=out/'TetherLock-V3-CAD.zip'
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    archive.writestr('README.md',readme)
    for p in files:archive.write(p,p.relative_to(root))
with zipfile.ZipFile(destination) as archive:assert archive.testzip() is None
print(f'{destination.relative_to(root)}: {len(files)+1} files, {destination.stat().st_size:,} bytes; {len(proof["results"])} checks passed')
