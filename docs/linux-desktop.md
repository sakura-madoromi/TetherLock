# Linux 桌面 APP 与 Rust/Tauri 锁模拟器

Flutter APP 持有私钥，通过现有 MQTT v1 协议控制持有公钥的 Rust 模拟器。
模拟器使用 Tauri 2、Svelte 5、TypeScript、Three.js 和单个 WebKitGTK WebView，
旧 Flutter 模拟器、Dart 模拟器核心及 GTK/WebKit 桥接已在替代验收后移除。
共享 Dart 协议包与 Flutter APP 保留。

## 构建与安装

需要 Flutter、Rust、Node/npm、CMake、Ninja、Clang、pkg-config、GTK 3、
WebKitGTK 4.1、libsoup 3、OpenSSL、D-Bus 和 Linux Secret Service。
Debian/Ubuntu 的常用开发依赖如下，包名以发行版为准：

```sh
sudo apt install build-essential clang cmake ninja-build pkg-config libgtk-3-dev \
  libwebkit2gtk-4.1-dev libsoup-3.0-dev libssl-dev libsecret-1-dev \
  librsvg2-dev patchelf mosquitto mosquitto-clients gnome-keyring fonts-noto-cjk
```

```sh
# 在仓库根目录先运行 git lfs pull 和 npm run assets，准备共用 CAD 与图标
# 模拟器构建再次校验 assets/cad/v3/ 中的源码和 STL 哈希
cd apps/simulator
npm ci
npm run tauri -- build --bundles deb
# 客户端 APP
cd ../tetherlock
flutter pub get
flutter build linux --release
```

| 产物 | 路径 |
| --- | --- |
| Flutter APP | `apps/controller/build/linux/x64/release/bundle/tetherlock` |
| 模拟器 release | `apps/simulator/src-tauri/target/release/tetherlock-simulator-tauri` |
| `.deb` | `apps/simulator/src-tauri/target/release/bundle/deb/TetherLock Simulator_0.2.0_amd64.deb` |

Debian/Ubuntu 可执行 `sudo apt install "./TetherLock Simulator_0.2.0_amd64.deb"`
安装，然后运行 `tetherlock-simulator-tauri`；Flutter APP 部署时复制整个
`bundle/`。模拟器的前端与 37 个 STL 内嵌在发行程序内，运行时无需 Vite、Node、
Rust、HTTP 服务或资源下载。用户已取消 AppImage 构建与交付。

## 手动配对与操作

1. 单独启动 broker，例如 `mosquitto -p 1883`。
2. APP 创建或导入 P-256 身份，复制公钥 JWK。
3. 模拟器填写序列号、Broker、端口、TLS、命名空间和凭据，粘贴公钥，保存并连接。
4. APP 配置相同 MQTT 连接并添加相同序列号的设备，在「授权公钥」下拉框选择
   相应本机密钥（按公钥指纹区分）。「复制所选公钥」可将其复制到模拟器；没有
   本机私钥时先到「密钥」页面生成或导入，也可选择「手动粘贴公钥」。
5. 等待在线消息和最新状态，关闭模拟器盖板，在 APP 请求锁定。

不超过 24 小时的定时锁直接伸栓；更长定时锁与常锁要求先释放按钮，再持续按住
10 秒，确认窗口 60 秒。实体按钮可通过模型、面板或配置输入框之外的空格键
操作。提前释放清零；失焦、取消、隐藏、重载和关闭都有释放路径。

插销完整行程 14 mm / 2 秒，盖板 105° / 0.6 秒。正常常锁解锁不消耗卡。
紧急卡先预约，实际退栓和快照提交完成后扣除。卡栓超时保留预约，重试须匹配
任务及当前操作编号。断网时任务仍到期，网络重连与物理运动彼此独立。

暂停冻结模拟时间与运动，MQTT 心跳继续。单步 100 ms；快进支持 10 秒、1 分钟、
1 小时。三种传感器可独立覆盖，也可切换手动输入。相机拖动超过 5 CSS px 不
触发模型点击，相机位置和透明外壳不随设备快照重置。

客户端统一使用设备、密钥、连接、记录四个入口。1100 px 起为设备列表与详情分栏，
窄窗口选择后进入详情并可返回；浅深色外观可在顶栏切换。禁用原因、发送互斥、
未知结果恢复和晚到中间结果处理仍由 APP 原有逻辑负责。

视觉规范与截图见 [视觉体系](visual-system.md)。

## 存储、恢复与多个实例

GUI 默认数据位于 `${XDG_DATA_HOME:-~/.local/share}/io.tetherlock.simulator/rust-v2/`。
每个序列号对应独立的、带文件锁的目录；普通配置为 `connection.json`，不包含
MQTT 密码。密码由 Rust 写入 Secret Service，错误显示在页面，不回退到普通文件。
模拟器只接受公钥。

```sh
tetherlock-simulator-tauri --serial SIM-002 --data-dir /tmp/tetherlock-sim-002 --initial-cards 5
```

新快照为 `rust-v2.0.json` / `rust-v2.1.json`，包含控制、物理和故障设置；校验、
原子替换、文件与目录 fsync、最多 250 ms 的运动检查点保护状态。重启保留任务
与卡数，清除挑战和长按，电机停止；未知位置进入故障。双快照损坏不补卡。
重置须输入当前序列号，写入失败停止运动并禁止接受或成功回报。

旧目录不会导入或覆盖：旧 Rust CLI 为 `./.tetherlock-simulator/`，Dart CLI 为
`./.tetherlock-dart-simulator/`；旧 Flutter 模拟器在平台应用数据目录中使用
`devices/<serial>/` 和 `simulator-config.json`。这些旧文件保留供用户自行备份。

## 验证

```sh
cargo test --manifest-path packages/simulator-core/Cargo.toml
cargo build --manifest-path packages/simulator-core/Cargo.toml
(cd apps/simulator && npm test && npm run build)
(cd packages/protocol-dart && dart test)
(cd apps/controller && flutter test && flutter analyze)
(cd apps/controller && dart run tool/mqtt_simulator_e2e.dart)
python3 scripts/linux/compare_simulator_cores.py
```

实际 WebKitGTK 验证需要 Linux 图形桌面、python3-gi、AT-SPI 和 xdotool。
构建内嵌前端的调试程序后运行原生输入检查：

```sh
cargo build --manifest-path apps/simulator/src-tauri/Cargo.toml --features custom-protocol
python3 scripts/linux/tauri_native_input.py
```

另装 `tauri-driver`，启动 `GDK_BACKEND=x11 tauri-driver --port 4464 --native-port 4465`，
设置 `export TAURI_DRIVER_URL=http://127.0.0.1:4464`，再依次运行
`python3 scripts/linux/tauri_webkit_smoke.py` 与
`python3 scripts/linux/tauri_mqtt_e2e.py`。不要并发运行操作同一
桌面的测试。WebDriver 验证 CAD、页面/场景重载及缩放；原生检查验证真实指针、
失焦、键盘和关闭；MQTT 检查通过实际配对表单连接 APP 的 MQTT 服务。

完整验收结果见 [Rust/Tauri 迁移记录](validation/rust-tauri-migration.md)。
