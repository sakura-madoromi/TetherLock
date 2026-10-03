# TetherLock 控制系统

控制系统与现有 V3 机械 Web 工作台分开维护，由以下部分组成：

* [`packages/protocol-dart`](../../packages/protocol-dart/)：纯 Dart
  协议、P-256 签名、JWK 指纹、MQTT 主题和 AES-GCM 私钥备份格式。
* [`apps/controller`](../../apps/controller/)：Android、Linux、Windows 共用的
  Flutter Material 3 应用。
* [`packages/simulator-core`](../../packages/simulator-core/)：Rust MQTT 模拟器。它是
  真实 MQTT 链路的设备端替身，包含虚拟时钟、按钮、输入、运动故障和双快照
  状态恢复。

* [`apps/simulator`](../../apps/simulator/)：Linux
  Tauri 2 桌面模拟器，直接调用 Rust library，使用单个 WebKitGTK WebView。

ESP32-C3/ESP-IDF 固件暂不在当前实现范围内。模拟器的 MQTT 主题、命令签名和
状态格式以协议包与 `packages/simulator-core/src/protocol.rs` 为共同参考。

## 首次构建

```sh
# Rust simulator
cargo test --manifest-path packages/simulator-core/Cargo.toml
cargo run --manifest-path packages/simulator-core/Cargo.toml -- --scenario

# shared Dart protocol
cd packages/protocol-dart
dart pub get
dart test

# Flutter client (requires a Flutter SDK)
cd ../../apps/controller
flutter pub get
flutter test
# Linux host
flutter build linux
# Android host: flutter build apk
# Windows host: flutter build windows
# App transport ↔ Rust simulator E2E (requires mosquitto)
dart run tool/mqtt_simulator_e2e.dart
```

模拟器默认连接 `127.0.0.1:1883`，可通过 `--broker-host`、`--broker-port`、
`--username`、`--password`、`--serial`、`--namespace`、`--public-jwk` 和
`--initial-cards` 覆盖。初始卡数只在没有有效状态快照时使用，普通重启不会
自动恢复卡数；状态快照损坏时模拟器进入故障状态。
Flutter 设置页保存的 MQTT 密码只进平台安全存储；普通设备资料和操作记录使用
临时文件替换写入应用数据目录。

## 控制链路

App 先请求设备挑战，再用本地私钥签署规范化 JSON。模拟器在解析命令字段之前
验证原始 payload 字节、算法、设备序列号和一次性挑战。App 只在收到明确的设备
结果时显示成功；超时保留为“结果未知”。

`retry_operation` 必须同时绑定当前任务和原操作编号；模拟器状态在等待本地
确认时回报待确认任务及剩余有效秒数。`apps/controller/tool/mqtt_simulator_e2e.dart`
通过真实 Mosquitto 验证挑战、签名、接受、输入变化和最终状态回报。

`firmware/core` 和 ESP-IDF 工程不属于当前交付范围；它们保留在仓库中，待模拟器
与 Flutter 链路稳定后再继续硬件适配。

Windows 主机验收步骤见 [`WINDOWS.md`](WINDOWS.md)。
