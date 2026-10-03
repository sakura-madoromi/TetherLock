# Rust + Tauri Linux 模拟器迁移验收

验证日期：2026-10-03。旧实现参考提交：`b806a1e99db53e8ffee81061520e424544431019`。
用户已取消 AppImage，交付范围为 Linux release 与 `.deb`。

| 项目 | 结果与证据 |
| --- | --- |
| 既有 Rust 核心/协议 | 原 28 项测试保留并通过 |
| Rust 运行时/物理/存储 | 16 项新增测试通过：行程、时钟/暂停、到期快进、紧急卡重试、目录锁、插销/盖板恢复、盖板端点提交、屏幕恢复、损坏、旧格式隔离、完成写入失败、公钥/凭据边界、路径安全 |
| Dart/Rust 对照 | 同一 26 步输入的阶段、卡数、传感器、故障、倒计时与结果完全一致；输入与原 Dart 输出存于 Rust tests/migration_*.json，排除会话/版本/存储修订号 |
| Mosquitto + Rust CLI | APP 的 MQTT 服务验证确认、自动伸/退栓、正常解锁、紧急卡预约/重试/配额、断网到期、重连、错误签名、身份/版本错误、挑战重放/过期/容量、4 KiB 限制 |
| Mosquitto + Tauri | 同一 E2E 通过实际配对表单填写 APP 生成的公钥与 Broker，再由 Flutter MQTT 服务控制真实 Tauri 后端；无需新增 MQTT 控制消息 |
| 原生 WebKitGTK 输入 | 独立程序验证 pointer capture、移出按钮释放、原生失焦释放、键盘释放、按住按钮关闭及正常退出；使用 AT-SPI/X11，不以 Chromium 替代 |
| WebKitGTK 布局/生命周期 | 1280×720、800×650，上下/左右布局切换无横向裁切；连续场景重载、页面重载、唯一 canvas、暂停核心保留通过 |
| CAD / 渲染 | 37 个 STL 的 SHA-256 和 CAD 源哈希校验通过；毫米尺寸、铰链/传动姿态、固定 OLED 显示面、透明外壳、相机预设保留 |
| 桌面性能 | CAD 初始化完成后的原生连续相机拖动和盖板运动：帧间隔 P95 **23.0 ms**，本地操作往返 P95 **4.0 ms**；均优于 25 ms / 100 ms 阈值 |
| Flutter APP | 11 项回归测试通过；Linux release 构建通过；共享协议包 8 项测试通过，静态分析无问题 |
| Svelte / TypeScript | svelte-check：0 errors / 0 warnings；Vite production 构建通过；3 项手势判定测试通过 |
| Tauri 构建 | Linux debug 与 release 构建通过；`.deb` 构建通过，前端及 CAD 内嵌，不依赖运行时 HTTP/Vite |

桌面为 Manjaro Linux / X11，GTK 3.24.52、WebKitGTK 2.52.6、Mesa 26.2.3，
`glxinfo -B` 显示 AMD Radeon 780M、direct rendering 与 accelerated 均为 Yes。
WebKit 的 JS renderer 字符串为 `Apple GPU`，硬件识别使用桌面 GLX 输出。
性能样本来自当前桌面，不能代表所有 Linux 硬件或所有分辨率。

截图：[实际 WebKitGTK 模型与面板](../../assets/evidence/validation/tauri-webkit-smoke.png)。

重载测试发现的竞态已修复：旧异步模型加载不能销毁后来创建的场景。运动
检查点与 MQTT 控制签名分别处理，检查点不触发高频 MQTT 发布；实时心跳不
增加持久化修订号。UI 快照采用 Channel 与前端确认，未处理帧被最新位置合并。

旧 Flutter 模拟器、Dart 模拟器核心、GTK 桥接、模拟器 HTTP 服务、旧构建脚本及
旧 Chromium 模拟器测试已移除。独立 CAD 资源保存于新应用 cad/；旧快照目录
未读取、迁移或删除。机械工作台、共享 Dart 协议和 Flutter APP 保留。

悬停拾取使用预计算包围盒，相机拖动期间暂停悬停检测，释放后恢复部件检查；
保留完整 CAD 部件高亮，避免旋转时逐帧检测全部三角面。

最终 `.deb`：`TetherLock Simulator_0.2.0_amd64.deb`（amd64，4.77 MiB）。
已检查 Debian archive、GTK/WebKit 依赖、桌面入口及内嵌程序。SHA-256：
`8014a5114fb40032312b8ba778a9efa3748d63e56946d1acc2346e68346b6513`。

APP 添加设备现支持本机密钥下拉选择及公钥复制。新增两项回归覆盖选择第二个
身份、仅复制/保存公钥字段、无本机密钥提示与手动入口，静态分析通过。

## 目录治理补记

上述记录保留迁移当天的验收含义。后续目录治理将应用移至 `apps/simulator/`、Rust 核心移至 `packages/simulator-core/`，并将原应用 `cad/` 中的 37 个网格集中到 `assets/cad/v3/assembly/`，由 Web 与 Tauri 共用。旧提交引用及恢复材料见 [Git/LFS 维护说明](../maintenance/repository.md)与[提交分组映射](../maintenance/migration.json)。
