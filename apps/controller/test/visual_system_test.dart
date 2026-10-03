import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tetherlock/src/app.dart';
import 'package:tetherlock/src/controller/app_controller.dart';
import 'package:tetherlock/src/models.dart';
import 'package:tetherlock/src/screens/device_control_page.dart';
import 'package:tetherlock/src/ui/components.dart';
import 'package:tetherlock/src/ui/formatters.dart';

import 'desktop_control_test.dart'
    show Fixture, MemoryStore, MemoryVault, FakeMqtt;

class RecordingStore extends MemoryStore {
  AppSnapshot? saved;
  @override
  Future<AppSnapshot?> read() async => saved;
  @override
  Future<void> write(AppSnapshot snapshot) async => saved = snapshot;
}

void main() {
  test('remaining time is readable for seconds, expired tasks and long locks',
      () {
    expect(formatRemaining(5401), '01:30:01');
    expect(formatRemaining(-1), '00:00:00');
    expect(formatRemaining(90000), '1 天 01 时');
  });

  test('theme preference survives restart and older data defaults to system',
      () async {
    final store = RecordingStore();
    final controller = AppController(
        localStore: store, vault: MemoryVault(), mqtt: FakeMqtt());
    await controller.initialize();
    await controller.setThemePreference('dark');
    expect(store.saved?.themePreference, 'dark');
    controller.dispose();
    final restored = AppController(
        localStore: store, vault: MemoryVault(), mqtt: FakeMqtt());
    await restored.initialize();
    expect(restored.themePreference, 'dark');
    restored.dispose();
    expect(AppSnapshot.fromJson({'version': 1}).themePreference, 'system');
    expect(
        AppSnapshot.fromJson({'theme_preference': 'invalid'}).themePreference,
        'system');
  });

  for (final platform in [
    TargetPlatform.android,
    TargetPlatform.linux,
    TargetPlatform.windows
  ]) {
    testWidgets(
        '$platform uses the same list/detail navigation and four destinations',
        (tester) async {
      debugDefaultTargetPlatformOverride = platform;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fixture = Fixture();
      await fixture.start();
      await tester.pumpWidget(TetherLockApp(controller: fixture.controller));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationDestination), findsNWidgets(4));
      await tester.tap(find.text('测试锁'));
      await tester.pumpAndSettle();
      expect(find.byType(DeviceControlPage), findsOneWidget);
      await tester.tap(find.text('返回设备列表'));
      await tester.pumpAndSettle();
      expect(find.byType(DeviceControlPage), findsNothing);
      await tester.tap(find.text('测试锁'));
      await tester.pumpAndSettle();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(DeviceControlPage), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      fixture.controller.dispose();
      debugDefaultTargetPlatformOverride = null;
    });
  }

  for (final width in [360.0, 390.0, 800.0, 1100.0, 1440.0]) {
    for (final mode in ['light', 'dark']) {
      testWidgets(
          '$mode layout at ${width.toInt()}px, including all auxiliary pages',
          (tester) async {
        tester.view.physicalSize = Size(width, width < 800 ? 844 : 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final fixture = Fixture();
        await fixture.start();
        await fixture.controller.setThemePreference(mode);
        await tester.pumpWidget(TetherLockApp(controller: fixture.controller));
        await tester.pumpAndSettle();
        await tester.tap(find.text('测试锁'));
        await tester.pumpAndSettle();
        expect(
            Theme.of(tester.element(find.byType(DeviceControlPage))).brightness,
            mode == 'dark' ? Brightness.dark : Brightness.light);
        expect(
            find.text('返回设备列表'), width < 1100 ? findsOneWidget : findsNothing);
        expect(tester.takeException(), isNull);
        for (final label in ['密钥', '连接', '记录']) {
          await tester.tap(find.text(label).last);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
        await tester.tap(find.text('连接').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('新增配置'));
        await tester.pumpAndSettle();
        expect(find.byType(ProductDialog), findsOneWidget);
        expect(find.byType(Dialog).first, findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('取消'));
        await tester.pumpAndSettle();
        await tester.pumpWidget(const SizedBox());
        fixture.controller.dispose();
      });
    }
  }

  testWidgets(
      'system appearance follows platform changes and explicit choice overrides it',
      (tester) async {
    final fixture = Fixture();
    await fixture.start();
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(TetherLockApp(controller: fixture.controller));
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.byType(HomeShell))).brightness,
        Brightness.dark);
    await fixture.controller.setThemePreference('light');
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.byType(HomeShell))).brightness,
        Brightness.light);
    await tester.pumpWidget(const SizedBox());
    fixture.controller.dispose();
  });

  testWidgets('reduced motion disables theme animation', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    final fixture = Fixture();
    await fixture.start();
    await tester.pumpWidget(TetherLockApp(controller: fixture.controller));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<MaterialApp>(find.byType(MaterialApp))
            .themeAnimationDuration,
        Duration.zero);
    await tester.pumpWidget(const SizedBox());
    fixture.controller.dispose();
  });

  testWidgets('large text remains usable on a 360px phone', (tester) async {
    tester.view.physicalSize = const Size(360, 844);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final fixture = Fixture();
    await fixture.start();
    await tester.pumpWidget(TetherLockApp(controller: fixture.controller));
    await tester.pumpAndSettle();
    await tester.tap(find.text('测试锁'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    fixture.controller.dispose();
  });

  if (const bool.fromEnvironment('VISUAL_SCREENSHOTS')) {
    for (final size in [const Size(390, 844), const Size(1440, 1000)]) {
      for (final mode in ['light', 'dark']) {
        testWidgets('capture $mode ${size.width.toInt()}px', (tester) async {
          await tester.runAsync(() async {
            final font =
                File('/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc');
            if (await font.exists()) {
              final bytes = ByteData.sublistView(await font.readAsBytes());
              for (final family in ['Roboto', 'Ahem', 'monospace']) {
                await (FontLoader(family)..addFont(Future.value(bytes))).load();
              }
              final icons = File(
                  'build/unit_test_assets/fonts/MaterialIcons-Regular.otf');
              if (await icons.exists()) {
                await (FontLoader('MaterialIcons')
                      ..addFont(Future.value(
                          ByteData.sublistView(await icons.readAsBytes()))))
                    .load();
              }
            }
          });
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final fixture = Fixture();
          await fixture.start();
          await fixture.controller.setThemePreference(mode);
          fixture.mqtt.emit(fixture.topics.state, {
            'serial': fixture.device.serial,
            'session_id': 'session',
            'revision': 2,
            'mode': 'simulated',
            'control_state': 'timed_locked',
            'time_calibrated': true,
            'remaining_seconds': 5400,
            'task': {'task_id': 'visual-task', 'timed': true},
            'updated_at_utc': DateTime.now().millisecondsSinceEpoch ~/ 1000,
            'inputs': {
              'lid_closed': true,
              'retracted': false,
              'extended': true
            },
            'emergency': {'total': 3, 'remaining': 3, 'reserved': false},
          });
          final key = GlobalKey();
          await tester.pumpWidget(RepaintBoundary(
              key: key, child: TetherLockApp(controller: fixture.controller)));
          await tester.pumpAndSettle();
          await tester.tap(find.text('测试锁'));
          await tester.pumpAndSettle();
          await tester.runAsync(() async {
            final boundary = key.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
            final image = await boundary.toImage();
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            image.dispose();
            final file = File(
                '../../docs/validation/visual-system/app-${size.width < 800 ? 'phone' : 'desktop'}-$mode.png');
            await file.parent.create(recursive: true);
            await file.writeAsBytes(data!.buffer.asUint8List());
          });
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
          fixture.controller.dispose();
        });
      }
    }
  }
}
