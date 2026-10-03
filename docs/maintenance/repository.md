# 仓库维护：Git、LFS 与生成产物

本仓库使用 Git。源码与文本文档使用普通 Git，必要二进制集中在 `assets/` 并由 Git LFS 跟踪。`assets/manifest.json` 登记资源的字节数、SHA-256 和需要准备的图标/字体目标。

## 克隆与日常提交

```sh
git lfs install
git clone <repository-url>
cd TetherLock
git lfs pull
npm ci
npm run assets
```

LFS 指针不等于资源文件。`npm run assets:check` 检查对象已下载且与清单一致；`npm run assets` 还校验 CAD/工程源码，生成应用运行资源。不要手工编辑应用 `public/` 或复制出的图标。

```sh
git add <changed-source-files>
git add assets/ .gitattributes
npm run repo:check
npm run test:repo
git diff --cached
git commit
```

`repo:check` 检查暂存区，而非仅检查工作区；可用 `python3 scripts/repo/check.py --revision HEAD` 检查已提交树。检查会拒绝缓存目录、生成目录、资源目录外的二进制、无 LFS 指针的二进制、未登记或哈希不匹配的资源，以及超过 1 MiB 的普通 Git 文件。

本次迁移将官方 Git LFS 安装在本机 `.tools/bin/`，并在当前仓库配置本地过滤器、`git lfs` 命令别名及标准钩子的 PATH 回退；普通 Git 操作无需先修改终端环境。其他机器正常安装 Git LFS 即可，不依赖本地工具目录。迁移整个工作区到另一位置时，重新安装 Git LFS 或更新这些仓库本地路径。

## 资源归属与证据

- `assets/cad/v3/assembly/` 是共用装配姿态网格，Web 与 Tauri 都从这里准备资源。
- `assets/cad/v3/print/` 是打印姿态网格，不能与同名装配网格混用。
- `assets/evidence/` 保存不可再生的采购图片和选定历史验收证据；评审文字、探针 SCAD 和原始结果 JSON 留在 `docs/`。
- `assets/fonts/` 保存字体、许可证和清单；`assets/icons/` 保存应用图标源文件。
- `assets/deliverables/v3/` 只保存明确交付的 CAD、Blueprints、Workbench ZIP。
- `generated/` 保存当前导出、临时探针、渲染、浏览器验收、报告和新打包结果。生成物不会因为扩展名是 JSON、SCAD 或 SVG 就成为源码。

历史证据的原始哈希与路径不改成“当前通过”。[迁移路径映射](path-map.json)记录旧位置与新归属；[迁移说明](migration.json)记录原提交及重建提交分组。新增当前证据必须来自实际重跑。

## 更新机械资源与交付包

使用支持 Manifold 后端的新版 OpenSCAD。`OPENSCAD` 指向可执行入口；如果需要参数，使用一个调用 `OpenSCAD --backend=Manifold "$@"` 的包装脚本。Python 需要 FontTools，浏览器验收需要 Playwright/Chromium。

```sh
python3 scripts/v3/export_verify.py
python3 scripts/v3/verify_window.py
python3 scripts/v3/verify_hinge_hall.py
python3 scripts/v3/verify_review.py
python3 scripts/v3/verify_references.py
python3 scripts/v3/verify_assembly.py
python3 scripts/v3/verify_purchased_specs.py
python3 scripts/v3/render.py
npm run assets:refresh
node scripts/v3/blueprints.mjs
python3 scripts/v3/verify_engineering.py
python3 scripts/v3/package_cad.py
```

`assets:refresh` 根据完整通过的机械验证和源码哈希更新共用网格与工程快照，不发布到远端。之后更新下载包并完成交付验收：

```sh
node scripts/assets/deliverables.mjs --stage
npm run assets
npm run build
python3 scripts/v3/package_viewer.py
WORKBENCH_URL=http://127.0.0.1:4173/workbench/ npm run test:browser
WORKBENCH_URL=http://127.0.0.1:4173/workbench/ node tests/workbench/engineering.mjs
python3 scripts/v3/verify_delivery.py
node scripts/assets/deliverables.mjs --publish
npm run assets:check
git add assets/
npm run repo:check
```

运行浏览器验收前，在另一终端启动 `node tests/workbench/static-server.mjs`，它提供刚构建的 `generated/workbench/dist/`；通过 `CHROMIUM_PATH` 指定本机 Chromium。`test:browser` 默认输出到交付验证要求的 `generated/v3/purchased-specs/browser/`。

`--stage` 将刚验证的 CAD/Blueprints 包准备为本地下载资源，并重建工作台；`--publish` 要求当前交付验证完整通过、包哈希一致，再更新规范交付包与清单。提交前同时暂存快照、清单与 LFS 指针。

## 构建与部署

运行 Web/Tauri 构建前准备资源；Flutter 构建前运行根目录 `npm run assets` 以准备平台图标。`packages/simulator-core` 与 `packages/protocol-dart` 可独立运行各自测试。

Vercel 构建输入是已下载的规范 Workbench ZIP。先运行 `git lfs pull` 和 `npm run build:vercel` 校验部署解包，再使用已有部署方式。直接通过 Git 集成部署时，必须确保平台检出 LFS 实体内容；指针输入会被构建拒绝。本次迁移不发布网站。

## 本次迁移与恢复

保留已发布 `main`：`95086fa086710571b39ede804c02a39de307ba05`。仅重建本地提交，新分支为 `refactor/repository-governance`；旧已发布历史的大对象仍存在，没有执行历史清洗或垃圾回收。

本机 `.local/migration/` 保存完整 `original.bundle`、`original-worktree.tar.gz`、`original-state.json` 和原路径映射；`jj-retention.bundle` 补充保存原备份之后 jj 导出产生的保留对象。`.local/jj-metadata/` 保存移出的 jj 元数据。Git 引用 `refs/archive/pre-governance` 保留原最终实现。两个原未跟踪大文件也包含在工作区备份中。

恢复时先在另一个目录核查备份，避免覆盖新工作区：

```sh
git clone .local/migration/original.bundle /tmp/tetherlock-original
git -C /tmp/tetherlock-original fetch "$PWD/.local/migration/jj-retention.bundle" 'refs/jj/*:refs/jj/*'
git -C /tmp/tetherlock-original checkout af968cc0f2ff43381b5b1027d66b9ec64d48cfa7
tar -xzf .local/migration/original-worktree.tar.gz -C /tmp/tetherlock-original
```

需要恢复 jj 时，在独立恢复目录复制备份元数据为 `.jj/`，核查 Git store 指向该目录的 `.git/` 后再运行 jj。不要在当前已启用 LFS 的工作区重新启用 jj。

旧实现位于 `.local/legacy/`；原 Flutter、Dart、Cargo、npm 缓存保留在旧位置或通过本地忽略链接使用。本次未删除系统运行状态、密钥、Broker 凭据或任何备份。

## 原生窗口验收

`tauri_webkit_smoke.py` 的 `TAURI_TEST_PID_FILE` 可指向测试启动器记录的应用 PID；X11 下通过 `xdotool` 仅缩放该测试进程的窗口。部分 WebKitWebDriver 环境的 window rect 不改变宿主 GTK 视口，此时应使用独立测试启动器并指定 `GDK_BACKEND=x11`，不能通过放宽布局断言掩盖失败。测试应用和驱动使用独立 `XDG_DATA_HOME`，不读取用户设备状态。

本次执行结果见 [治理验收记录](validation.md)。
