# TetherLock（牵绊锁盒）

> [!WARNING]
> **本项目尚未完工。** 当前仓库是 V3 结构样机和验证资料，不能视为可直接制造、交付或用于安全场景的成品。机械强度、实物公差、耐久性、电气板件、控制固件、到位检测和实际开锁时间仍需采购、试装和实测确认。

当前维护 V3 机械基线、Web 工程工作台、Flutter 控制应用和 Rust/Tauri 锁模拟器。数字模型验证不等于实物验收。

- [机械总装](hardware/v3/cad/assembly.scad) · [设计说明](docs/design/v3-cad.md) · [采购 BOM](docs/design/v3-bom.csv)
- [Web 工作台](docs/design/v3-viewer.md) · [Flutter 控制应用](apps/controller/README.md) · [Tauri 模拟器](apps/simulator/README.md)
- [Linux 构建与配对](docs/linux-desktop.md) · [到货测量与适配](docs/design/v3-arrival-measurements.md)
- [Git/LFS、目录规则与恢复方式](docs/maintenance/repository.md)

## 首次使用

需要 Git、Git LFS、Node.js 与 npm。构建既有工作台和模拟器使用已验证的资源快照，不需要 OpenSCAD。

```sh
git lfs install
git lfs pull
npm ci
npm run assets
npm run dev
```

工作台地址为 <http://127.0.0.1:5173/>。`npm run assets` 校验资源与源码哈希，并为两个应用准备同一套 37 个装配网格、25 个打印文件、字体和下载包。缺少 LFS 对象或源码已改变时会明确失败。

```sh
npm test
npm run build
npm run package
npm run repo:check
npm run test:simulator-view
```

`npm run build` 输出到 `generated/workbench/dist/`；`npm run package` 输出工作台 ZIP 到 `generated/v3/`。交付包解压后可运行 `python3 -m http.server 8088 --bind 127.0.0.1`，再访问 <http://127.0.0.1:8088/>。

## 目录归属

```text
apps/                 workbench、controller、simulator 应用源码
packages/             protocol-dart 共享协议、simulator-core Rust 核心
hardware/v3/          cad 参数模型、engineering 工程数据、bench 测量模板
firmware/core/        C++ 固件核心
assets/               LFS 二进制、资源清单、许可证和已验证 CAD 快照
docs/                 设计、评审、验证和维护文档
scripts/              生成、验证、打包与仓库检查入口
tests/                工作台及仓库治理测试
generated/            被忽略的导出、构建和本次验证输出
.local/               被忽略的迁移备份与旧实现
```

资源只维护 `assets/` 中的规范副本，应用 public、图标目录与交付包内的副本由工具准备。中间 STL、自动截图、浏览器下载、依赖和构建缓存不提交。

## 机械资源更新与预览部署

修改 CAD 或工程主表后，按[资源更新流程](docs/maintenance/repository.md#更新机械资源与交付包)重新生成、验证并更新资源快照。机械验证需要支持 Manifold 后端的新版 OpenSCAD；可通过 `OPENSCAD` 指定可执行入口。

Vercel 使用 `npm run build:vercel` 校验并解包 `assets/deliverables/v3/TetherLock-V3-Workbench.zip` 到 `generated/workbench/deploy/`。部署前必须下载 LFS 对象；该入口不在部署服务上运行 OpenSCAD。新生成交付包通过显式晋升流程进入 LFS。

## 许可证

项目采用 [MIT 许可证](LICENSE)；第三方字体的许可证保留在 [assets/fonts/](assets/fonts/)。
