"""Build a portable static workbench ZIP from a verified Vite build."""
from pathlib import Path
import hashlib, json, zipfile

root=Path(__file__).resolve().parents[2]
dist=root/'generated/workbench/dist'
manifest=json.loads((dist/'manifest.json').read_text())
assert {'base_box','lid','window_grille','acrylic'}.issubset({p['id'] for p in manifest['parts']})
assert (dist/'manifest.json').read_bytes()==(root/'apps/workbench/public/manifest.json').read_bytes(), 'Stale build: npm run build first'
for file,expected in manifest['sourceSHA256'].items():
    assert hashlib.sha256((root/file).read_bytes()).hexdigest()==expected, f'Stale CAD: {file}'
for part in manifest['parts']:
    assert hashlib.sha256((dist/part['file']).read_bytes()).hexdigest()==part['sha256'],part['id']
assert (dist/'index.html').exists()
readme=f'''TetherLock V3 结构与运动工作台

解压后在这个文件夹打开终端，运行：
  python3 -m http.server 8088 --bind 127.0.0.1
浏览器访问：http://127.0.0.1:8088/
需要通过 HTTP 打开；不要双击 index.html。静态版不需要 Node、OpenSCAD 或联网。

{len(manifest['parts'])} 组真实 CAD 网格，240×120×55 mm，{len(manifest['printParts'])} 种打印件 STL 与 V3 CAD ZIP/BOM。
天窗：同色一体外栅栏与阶梯内栅直接捕获亚克力，四耳限位承载预紧，无窗垫。
铰链：钢销配打印限位端盖，无独立轴环/紧定螺钉；十处维护连接采用M2铜螺母原型。
M4×55电机、侧壁R16按钮、3mm绑带槽已更新；霍尔取消，机械到位开关及支架待选型。
可旋转、测距、选件、剖切、爆炸、播放联锁开盖运动。
可导出 2K/4K PNG、五视图 ZIP、A3 SVG/PNG/打印 PDF、GLB 和 WebM。
录制已在桌面 Chromium 验证；动画速度不是实物电机性能。
工程资料包含按当前目录生成的固定机械/电气蓝图、完整BOM与CAD名义制造特征；保留当前视图参考图。
独立组装指导包含27步、核对路径、人工检查与版本关联进度JSON；动画不自动确认实物。
候选模块适配、预算冲突、实物公差/强度、机械到位检测和控制固件/≤15秒保持待验收。
GLB 长度单位为米，保留 CAD 的 Z 向上坐标；剖切仅影响屏幕和 PNG。

快捷键：1–6 视角，F 聚焦，M 测量，E PNG，空格播放/暂停，Esc 退出隔离。
源工程与详细说明：TetherLock 仓库 docs/design/v3-viewer.md。
'''
destination=root/'generated/v3/TetherLock-V3-Workbench.zip'
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    archive.writestr('README.txt',readme)
    for file in sorted(dist.rglob('*')):
        if file.is_file():archive.write(file,file.relative_to(dist))
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert len([n for n in archive.namelist() if n.startswith('models/')])==len(manifest['parts'])
    assert len([n for n in archive.namelist() if n.startswith('print/')])==len(manifest['printParts'])
print(f'{destination.relative_to(root)}: {destination.stat().st_size:,} bytes; {len(manifest["parts"])} model meshes, {len(manifest["printParts"])} print STL files')
