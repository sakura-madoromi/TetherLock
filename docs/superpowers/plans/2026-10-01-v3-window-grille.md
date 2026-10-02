# V3 双层同色防护栅窗实施清单

用户已同意双层栅栏方案，要求内外栅栏与外壳同色、同耗材；此前明确直接实施。按 writing-plans 技能记录步骤，在当前工作区执行，不新增审批或提交。

**目标：** 一体外栅栏、可拆整体内栅栏与缓冲垫夹持149×82×1.5 mm亚克力，保持240×120×55 mm及185×95×40 mm验收空间。

**结构：** 五根5 mm宽栅条沿78 mm短边跨接，内外对齐；外栅下表面Z=52，顶面55；窗片Z=50.2～51.7；上下薄垫压后各0.3；内栅Z=47.4～49.9；四个内部固定耳硬限位，四颗M2×6沉头螺钉。尺寸为打印原型目标，压缩量及强度须试装。

- [x] 保存修改前CAD/预览ZIP与验证报告。新增 `scripts/v3/verify_window.py`，用实际OpenSCAD布尔探针验证外栅条，先在旧盖上得到缺少实体的失败。
- [x] 修改 `cad/v3/{params,enclosure,hardware,assembly}.scad`：共享栅条形状、圆角根部、内栅边框/固定耳/沉头孔、窗片与上下缓冲垫、硬限位及安装/工具通道检查；替换四压片，不保留冗余打印件。
- [x] 运行栅窗专项检查、`export_verify.py`完整检查及`verify_review.py`。验证封闭单连通打印STL、上下支承位置、装配路径、开盖采样、螺钉及物品净空。
- [x] 更新 `viewer_assets.py` 的角色、颜色、爆炸偏移及清理过期生成件；浏览器测试按清单读分件数，并验证一体外栅、内栅和外壳同色。重新生成CAD图、BOM、说明、CAD ZIP。
- [x] 独立审查本次CAD夹持/净空变化，修复实际问题；执行node测试、Vite构建、完整浏览器导出回归，生成新的静态ZIP和交付指纹。

验证命令：`python3 scripts/v3/verify_window.py --outer-only`（旧版应失败）；`python3 scripts/v3/verify_window.py`；`python3 scripts/v3/export_verify.py`；`python3 scripts/v3/verify_review.py`；`npm test`；`npm run package`；`npm run test:browser -- --url=http://127.0.0.1:4173/workbench/ --output=artifacts/v3/viewer-static`。

完成证据：完整 CAD 1,027 项、栅窗 30 项、附加驱动 10 项、Node 9 项、浏览器 18 项全部通过；独立审查通过。当前预览为 46 个分件，内外栅栏与外壳同色。软垫压缩量和实际打印配合仍需原型试装。
