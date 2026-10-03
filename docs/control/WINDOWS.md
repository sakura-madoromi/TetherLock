# Windows 验收

Windows 构建必须在安装了 Visual Studio Desktop C++ 工作负载的 Windows 主机
执行。PowerShell 中运行：

```powershell
cd apps/controller
flutter pub get
flutter analyze
flutter test
flutter build windows --release
```

同时在仓库根目录构建 Rust 模拟器：

```powershell
cargo build --release --manifest-path packages/simulator-core/Cargo.toml
```

安装 Mosquitto 并启动本地 broker 后，从 `apps/controller` 运行：

```powershell
dart run tool/mqtt_simulator_e2e.dart
```

然后启动 `build\windows\x64\runner\Release\tetherlock.exe`，验证 Windows
安全存储、MQTT 配置与 TLS 证书错误、密钥加密备份恢复、状态过期提示以及定时锁、
常锁、紧急开锁和故障重试页面。此验收不能由 Linux 主机替代。
