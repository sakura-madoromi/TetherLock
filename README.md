# TetherLock（牵绊锁盒）

> [!WARNING]
> **本项目尚未完工。** 当前仓库是 V3 结构样机和验证资料，不能视为可直接制造、交付或用于安全场景的成品。机械强度、实物公差、耐久性、电气板件、控制固件、到位检测和实际开锁时间仍需采购、试装和实测确认。

## 项目状态

当前只维护 V3 基线。仓库包含参数化 OpenSCAD 模型、可打印分件、验证脚本和一个用于检查装配关系的 Web 工作台。现有结论主要针对名义尺寸和数字模型；通过脚本检查不等于通过实物验收。

当前入口：

- [V3 CAD 总装](cad/v3/assembly.scad)
- [V3 分件 STL](stl/v3/)
- [V3 结构说明](docs/design/v3-cad.md)
- [V3 采购 BOM](docs/design/v3-bom.csv)
- [到货测量与 CAD 适配 TODO](docs/design/v3-arrival-measurements.md)
- [V3 Web 工作台说明](docs/design/v3-viewer.md)
- [V3 生成资料与交付包](artifacts/v3/README.md)

在使用或引用本项目时，请把它当作公开评审中的未完成原型。发现尺寸、装配或安全问题时，请先通过 Issue 记录，不要据此直接制造最终产品。

## 启动 Web 工作台

环境要求：

- Node.js 与 npm
- OpenSCAD；需要生成或重新验证 CAD 时，请将 `openscad` 放入 `PATH`，或设置 `OPENSCAD` 为可执行文件路径

首次使用时在仓库根目录执行：

```bash
npm ci
export OPENSCAD="$(command -v openscad)"  # 或填写本机 OpenSCAD 的完整路径
npm run assets
npm run dev
```

然后访问 <http://127.0.0.1:5173/>。`npm run assets` 会根据 `artifacts/v3/` 的验证资料生成 `viewer/public/`；这些文件属于构建产物，不需要手工编辑。

常用命令：

```bash
npm run build       # 生成 Vite 静态构建
npm run package     # 生成 V3 工作台交付 ZIP
npm test            # 运行 viewer 单元测试
npm run test:browser
```

交付 ZIP 解压后可在目录内运行：

```bash
python3 -m http.server 8088 --bind 127.0.0.1
```

再访问 <http://127.0.0.1:8088/>。静态包不需要 Node、OpenSCAD 或联网。

## Vercel 预览

仓库内的 `vercel.json` 使用 `npm run build:vercel` 发布当前已验证的静态工作台包。这个入口只解包 `artifacts/v3/TetherLock-V3-Workbench.zip`，不在 Vercel 上重新运行 OpenSCAD；更新预览前请先在本地完成 CAD 生成、验证和 `npm run package`，再提交新的交付包。

## 重新生成 CAD 与验证资料

完整流程见 [V3 工作台说明](docs/design/v3-viewer.md)。常用入口如下：

```bash
python3 scripts/v3/export_verify.py
python3 scripts/v3/verify_window.py
python3 scripts/v3/verify_hinge_hall.py
python3 scripts/v3/verify_review.py
python3 scripts/v3/verify_references.py
python3 scripts/v3/verify_assembly.py
python3 scripts/v3/engineering_data.py
python3 scripts/v3/viewer_assets.py
python3 scripts/v3/render.py
node scripts/v3/blueprints.mjs
python3 scripts/v3/package_cad.py
```

验证结果和生成资料放在 `artifacts/v3/`。`scripts/shared/stl_probe.py` 是验证脚本共用的无依赖 STL 工具。修改 CAD 或硬件候选后，应重新运行相关验证并更新对应证据。

## 目录结构

```text
TetherLock/
├── cad/v3/                  # V3 OpenSCAD 源文件
├── stl/v3/                  # V3 可打印分件
├── scripts/shared/          # 跨脚本共用工具
├── scripts/v3/              # 导出、验证、工程资料和打包脚本
├── viewer/                  # Vite + Three.js 工作台源码
├── viewer/public/fonts/     # 构建所需的可嵌入字体和许可证
├── tests/viewer/             # 工作台测试
├── bench/v3/                 # 到货测量和台架记录模板
├── engineering/              # 当前 V3 工程数据
├── docs/design/              # 当前设计、BOM、装配和验收说明
├── docs/reviews/             # 当前 V3 评审与证据
├── docs/superpowers/plans/   # V3 实施计划
└── artifacts/v3/             # V3 验证输出和交付包
```

`node_modules/`、`viewer/public/` 中的运行资源、`dist/`、`.tools/` 和浏览器运行目录是本地或生成内容，已由 `.gitignore` 排除；`viewer/public/fonts/` 保留了构建所需的字体和许可证。旧版源文件、旧预览和旧审计材料不属于当前维护范围。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
