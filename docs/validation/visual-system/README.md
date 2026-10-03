# 视觉改版验收

此目录包含 App 和 simulator 的浅深色截图。

| 场景 | 浅色 | 深色 |
| --- | --- | --- |
| App 手机 · 390×844 | [查看](../../../assets/evidence/validation/visual-system/app-phone-light.png) | [查看](../../../assets/evidence/validation/visual-system/app-phone-dark.png) |
| App 桌面 · 1440×1000 | [查看](../../../assets/evidence/validation/visual-system/app-desktop-light.png) | [查看](../../../assets/evidence/validation/visual-system/app-desktop-dark.png) |
| Simulator 桌面 · 1280×720 | [查看](../../../assets/evidence/validation/visual-system/simulator-desktop-light.png) | [查看](../../../assets/evidence/validation/visual-system/simulator-desktop-dark.png) |
| Simulator 窄窗口 · 640×540 | [查看](../../../assets/evidence/validation/visual-system/simulator-narrow-light.png) | [查看](../../../assets/evidence/validation/visual-system/simulator-narrow-dark.png) |

App 截图来自真实 Flutter widget 渲染，使用测试设备、模拟 MQTT 状态和本机中文字体；simulator 截图来自真实 Tauri/WebKitGTK 应用及其 Rust 后端、37 个 CAD 部件。

## 自动检查

Flutter 静态检查、测试与 Linux 发行构建通过；simulator 的 Svelte 检查、前端测试及 Linux debug / release 构建通过。

- Flutter 主题偏好保存和恢复、旧快照默认值、系统主题变化与显式覆盖。
- Android、Linux、Windows 的同一列表 / 详情导航逻辑，系统返回键从详情返回列表。
- 360、390、800、1100、1440 px 的浅深色布局和辅助页面 / 表单，360 px 下的 1.6 倍文字缩放。
- Flutter 既有操作保护、密钥配对、公钥复制与控制测试。
- Simulator 主题解析、倒计时格式、设备状态标签与指针手势测试。
- 原生 WebKit 鼠标捕获和移出释放、失焦释放、空格键操作及关闭窗口释放；帧间隔 P95 18.0 ms，操作往返 P95 3.0 ms。
- 实际 WebKit 的页签键盘导航、连接草稿保留、三维加载、浅深色切换、窄窗口无横向溢出、刷新后主题及运行状态保留。
- 真实 MQTT ↔ Flutter 服务 ↔ Tauri 后端：长按确认、自动运动、常锁解锁、定时锁、卡栓、紧急重试与配额、离线过期、重连、签名与挑战校验。

Android 与 Windows 的布局在 Flutter widget 测试中验证；本轮原生 GUI 验收运行于 Linux。

## 重现

在 `apps/controller` 运行：

```sh
flutter analyze --no-pub
flutter test --no-pub
flutter build linux --release --no-pub
# 可选：生成截图；Linux 主机需 NotoSansCJK-Regular.ttc
flutter test --no-pub --dart-define=VISUAL_SCREENSHOTS=true test/visual_system_test.dart
```

在 `apps/simulator` 运行：

```sh
npm test
npm run tauri -- build --debug --no-bundle
```

在仓库根目录，用隔离设备目录启动 tauri-driver，再运行：

```sh
XDG_DATA_HOME=/tmp/tetherlock-visual-data .tools/bin/tauri-driver --port 4464 --native-port 4465
python3 scripts/linux/visual_system_smoke.py
DART_BIN=/path/to/dart python3 scripts/linux/tauri_mqtt_e2e.py
python3 scripts/linux/tauri_native_input.py
```

详细设计规范见 [视觉体系](../../visual-system.md)。
