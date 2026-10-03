# TetherLock Flutter app

This is the Android, Linux and Windows client. It deliberately contains no CAD
renderer. The app signs commands locally, stores private keys only in the
platform secure storage, and treats the device state reported by MQTT as the
authority for lock results.

## Build and run

On a machine with Flutter installed, run from this directory:

```sh
flutter pub get
flutter test
flutter build linux
# Android host: flutter build apk
# Windows host: flutter build windows

# real MQTT transport E2E (requires mosquitto and the Dart simulator package)
dart run tool/mqtt_simulator_e2e.dart
```

The Android, Linux and Windows runner directories are committed with the app.
The Dart source is organized into UI, controller, transport, secure storage and
local persistence layers, so all three platforms use the same behavior.

The app never disables TLS certificate validation. `flutter_secure_storage`
must be available; if the platform key store or Linux keyring is locked, the
UI reports the error instead of writing a plaintext fallback.

Android, Linux and Windows share the same device/control navigation. At 1100 px
and above, a 280 px list sits beside device details; narrower windows use
list/detail navigation with a back button. The four destinations are devices,
keys, connections (MQTT), and activity. Operation guards remain shared by the UI
and controller, and connection status follows MQTT callbacks.

The appearance menu offers system, light and dark themes and saves the preference
in the existing local snapshot. See the [visual system](../../docs/visual-system.md)
and [acceptance screenshots](../../docs/validation/visual-system/README.md).

See the [Linux desktop guide](../../docs/linux-desktop.md) for dependencies,
release builds and manual pairing with the graphical simulator.

## 资源准备

首次构建前在仓库根目录运行 `git lfs pull` 和 `npm run assets`，将 `assets/icons/controller/` 中的规范图标准备到平台资源目录。不要提交复制出的 PNG/ICO 或构建缓存。
