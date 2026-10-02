"""Create the bundled embeddable Noto CJK subset for fixed engineering documents.

Install FontTools separately to regenerate; it is not needed to use the bundle.
"""
from pathlib import Path
import hashlib,json,shutil
from fontTools.ttLib import TTFont
from fontTools import subset

root=Path(__file__).resolve().parents[2]
source=Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
font=TTFont(source,fontNumber=2)
assert 'SC' in font['name'].getDebugName(1)
assert font['OS/2'].fsType==0,'Font embedding is restricted'
texts=''.join(chr(i) for i in range(32,127))+'×Ø°±≤≥→←↑↓Φ：；、（）～—−…'
for folder,glob in [('engineering','*.json'),('artifacts/v3/engineering','*.json'),('viewer/src','*.js'),('docs/design','v3-*.md')]:
    for p in (root/folder).glob(glob):texts+=p.read_text()
characters=sorted(set(texts))
options=subset.Options();options.layout_features=['*'];options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
builder=subset.Subsetter(options=options);builder.populate(unicodes=[ord(c) for c in characters]);builder.subset(font)
out=root/'viewer/public/fonts';out.mkdir(exist_ok=True)
# Rename the modified subset, retaining the upstream copyright/license records.
for name in font['name'].names:
    if name.nameID in [1,4,6]:name.string=('TLBlueprint' if name.nameID==6 else 'TetherLock Blueprint').encode(name.getEncoding())
dest=out/'TLBlueprint.otf';font.save(dest)
shutil.copy2('/usr/share/doc/fonts-noto-cjk/copyright',out/'LICENSE-Noto-CJK.txt')
manifest=dict(family='TetherLock Blueprint',source='Noto Sans CJK SC, Debian fonts-noto-cjk',license='SIL Open Font License 1.1',embeddingFsType=0,characters=''.join(characters),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Bundled CJK subset:',len(characters),'characters,',dest.stat().st_size,'bytes; embedding allowed')
