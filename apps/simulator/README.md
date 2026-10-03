# TetherLock Linux 模拟器（Rust + Tauri 2）

Svelte 5、TypeScript 和 Three.js 全部运行在一个 WebKitGTK WebView 中。配置、
实体按钮、三维模型、状态与日志共享同一页面。Rust library 直接运行状态机和
物理模型；GUI 不启动子进程，不启动 HTTP 服务，不执行拼接的 JavaScript。

## 界面与外观

暖白与深色主题共享同一套语义色，默认跟随系统，可在顶栏切换并保存偏好。
宽窗口以三维模型为主，窄窗口改为上下布局。模型下方提供盖板和实体按钮操作；
右侧使用概览、调试、连接、日志页签，切换保留表单草稿，方向键可切换页签。
故障注入和重置位于调试页，配对位于连接页。

[视觉规范](../../docs/visual-system.md) · [验收截图](../../docs/validation/visual-system/README.md)

三维视口使用摄影棚环境反射、分材质表面、曲面平滑与结构轮廓、动态地面阴影。
「适配视图」按当前盖板姿态和窗口比例取景，静止时跳过重复绘制。
环境与 CAD 均来自本地资源，详见 [三维渲染验收](../../docs/validation/simulator-rendering/README.md)。

## 构建与启动

需要 Rust、Node.js、GTK 3、WebKitGTK 4.1、libsoup 3、OpenSSL、Linux Secret
Service 和系统构建工具。当前 Linux 桌面已通过 frontend、Rust 和 Flutter 构建。

```sh
git lfs pull
npm run assets
cd apps/simulator
npm ci
npm run tauri -- dev
npm run tauri -- build --bundles deb
```

开发时 Vite 仅用于热更新；发行应用内嵌 JS、CSS、manifest 和 37 个已校验的 STL，
运行时不需要 Vite、端口或资源下载。用户已取消 AppImage 交付，仅构建 Linux
release 与 `.deb`。构建产物位于 `src-tauri/target/release/` 和 `bundle/deb/`。

安装后启动 `tetherlock-simulator-tauri`。配置和设备快照默认存放在
`$XDG_DATA_HOME/io.tetherlock.simulator/rust-v2/`（未设置时为
`~/.local/share/io.tetherlock.simulator/rust-v2/`）。可以单独启动另一设备：

```sh
tetherlock-simulator-tauri --serial SIM-002 --data-dir /tmp/tetherlock-sim-002 --initial-cards 5
```

未配置时先显示本地预览，首次保存连接配置后创建该设备目录。
每个设备目录由 Rust 持有文件锁。复用同一目录的第二个设备启动失败并输出文件锁错误。
初始卡数只在首次创建设备时使用，已有设备的任务和配额不会被连接配置覆盖。
重置需要输入当前序列号；普通重启不能补充卡数。

## 手动配对

1. 在 Flutter APP 的授权设置中生成或选择 P-256 身份，复制**公钥 JWK**。
2. 在模拟器填写序列号、Broker、端口、命名空间、TLS 和凭据，粘贴该公钥。
3. 点击「保存并连接」，等待顶部显示 `connected`。密码保存到 Linux Secret
   Service；失败会显示具体错误，不回退到配置 JSON。匿名连接无需 keyring。
4. APP 使用相同 Broker、命名空间和序列号添加设备。关闭盖板后提交短定时锁；
   三维插销在 2 秒后伸到 14 mm，APP 收到最终 `succeeded`。
5. 常锁或超过 24 小时的定时锁要求先释放实体按钮，再持续按住 10 秒。
   可使用模型按钮、面板按钮或配置输入框之外的空格键。提前释放清零。
6. 常锁通过 APP 正常解锁；定时锁可到期自动退栓或通过 APP 消耗紧急卡。
   紧急卡先预约，实际退栓并持久化成功后才扣除。

## 操作与故障

盖板目标为 0–105°，完整开合 0.6 秒；插销行程 0–14 mm，完整运动 2 秒。
暂停冻结模拟时间和运动，MQTT 仍保持连接并发送真实时间心跳。单步推进 100 ms，
快进支持 10 秒、1 分钟和 1 小时。自动传感器可以被单独覆盖，也可以切换为手动
输入；卡栓会保持实际位置，15 秒运动超时后进入故障，不会自行重试。

相机拖动超过 5 CSS px 时不触发模型点击。实体按钮使用 pointer capture，取消、
释放、失焦、页面隐藏和窗口关闭均释放按钮；Rust 也处理原生失焦和关闭。
透明外壳、相机预设和相机位置属于前端，不被设备状态反复覆盖。三维重载不影响
设备；重复重载会取消过期加载并释放场景资源。

## 快照与旧目录

新格式为 `rust-v2.0.json` / `rust-v2.1.json`，带 schema、修订号和 SHA-256。
写入经过 fsync、原子替换和目录 fsync，运动检查点最多间隔 250 ms。恢复时电机
停止，途中位置进入故障；挑战和长按窗口不会恢复。两个快照均损坏时卡数为 0，
必须明确重置。UTC 校正不跳动已建立的单调任务截止点。

不会读取、迁移或覆盖旧快照：旧 Rust CLI 默认 `./.tetherlock-simulator/`，
旧 Dart CLI 默认 `./.tetherlock-dart-simulator/`，旧 Flutter 模拟器位于平台应用数据目录的 `devices/<serial>/`，配置名为
`simulator-config.json`（可从提交 `b806a1e` 中查看原实现）。旧源码在验收通过后
已移除，旧数据不会自动导入。

## 验证

```sh
cargo test --manifest-path ../../packages/simulator-core/Cargo.toml
npm test
# 先构建 CLI，再运行 APP 的真实 Mosquitto 测试
cargo build --manifest-path ../../packages/simulator-core/Cargo.toml
cd ../tetherlock
dart run tool/mqtt_simulator_e2e.dart
```

桌面检查使用 `scripts/linux/tauri_native_input.py` 和
`scripts/linux/tauri_webkit_smoke.py`，后者需要 tauri-driver / WebKitWebDriver。
`scripts/linux/tauri_mqtt_e2e.py` 使用 APP 的 MQTT 服务对真实 Tauri 后端运行
同一套 E2E。验收结果与未完成事项见仓库 `docs/validation/rust-tauri-migration.md`。

通信采用 [Tauri commands](https://v2.tauri.app/develop/calling-rust/) 和
[Channel](https://v2.tauri.app/develop/calling-frontend/)。展示最多 30 Hz，一个
快照未确认时只保留最新位置；页面重载重新订阅，旧订阅和旧序号被丢弃。

## 共用 CAD 资源

规范网格与清单位于 `assets/cad/v3/`，Web 工作台与模拟器共用同一份装配资源。构建前会拒绝未下载的 LFS 指针、资源哈希不匹配以及过期的源码哈希；`public/` 仅保存自动准备的运行副本。前端构建输出到 `generated/simulator/dist/`，由 Tauri 内嵌。
