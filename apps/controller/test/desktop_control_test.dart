import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';
import 'package:tetherlock/src/app.dart';
import 'package:tetherlock/src/controller/app_controller.dart';
import 'package:tetherlock/src/models.dart';
import 'package:tetherlock/src/services/local_store.dart';
import 'package:tetherlock/src/services/mqtt_service.dart';
import 'package:tetherlock/src/services/secure_vault.dart';
import 'package:tetherlock/src/screens/device_list_page.dart';

class MemoryStore extends LocalStore {
  @override
  Future<AppSnapshot?> read() async => null;
  @override
  Future<void> write(AppSnapshot snapshot) async {}
}

class MemoryVault extends SecureVault {
  bool fail = false;
  @override
  Future<Map<String, Map<String, String>>> readPrivateKeys() async {
    if (fail) throw StateError('keyring locked');
    return {};
  }

  @override
  Future<String?> readMqttPassword(String id) async => null;
}

class FakeMqtt extends MqttService {
  final incoming = StreamController<MqttMessageEvent>.broadcast(sync: true);
  final statuses = StreamController<AppConnection>.broadcast(sync: true);
  int requests = 0, commands = 0;
  bool answer = true, failPublish = false;
  Map<String, dynamic>? lastCommand;
  @override
  Stream<MqttMessageEvent> get messages => incoming.stream;
  @override
  Stream<AppConnection> get connections => statuses.stream;
  @override
  bool get connected => connection == AppConnection.connected;
  @override
  Future<void> connect(MqttProfile profile, {String? password}) async {
    connection = AppConnection.connected;
    statuses.add(connection);
  }

  @override
  Future<void> disconnect() async {
    connection = AppConnection.disconnected;
    statuses.add(connection);
  }

  @override
  Future<void> subscribe(TetherTopics topics) async {}
  void emit(String topic, Object value) => incoming.add(
      MqttMessageEvent(topic, value is String ? value : jsonEncode(value)));
  @override
  Future<void> publishJson(String topic, Object value,
      {bool retain = false}) async {
    if (topic.endsWith('/challenge/request')) {
      requests++;
      if (answer) {
        emit(topic.replaceAll('/request', '/response'), {
          'request_id': (value as Map)['request_id'],
          'challenge': 'challenge',
          'expires_at_monotonic_ms': 60000
        });
      }
    } else if (topic.endsWith('/command')) {
      commands++;
      lastCommand = Map<String, dynamic>.from(jsonDecode(utf8.decode(
          base64UrlDecodeBytes((value as Map)['payload'] as String))) as Map);
      if (failPublish) throw StateError('write failed');
    }
  }

  @override
  void dispose() {
    incoming.close();
    statuses.close();
    super.dispose();
  }
}

class Fixture {
  Fixture() {
    controller =
        AppController(localStore: MemoryStore(), vault: vault, mqtt: mqtt);
    device = AppDevice(
        id: 'device',
        alias: '测试锁',
        serial: 'SIM-TEST',
        profileId: 'local',
        publicJwk: pair.publicJwk);
  }
  final pair = generateKeyPair();
  final mqtt = FakeMqtt();
  final vault = MemoryVault();
  late final AppController controller;
  late final AppDevice device;
  TetherTopics get topics => TetherTopics(device.serial);
  Future<void> start() async {
    await controller.initialize();
    controller.devices = [device];
    controller.privateKeys = {pair.fingerprint: pair.privateJwk};
    await controller.connectProfile('local');
    mqtt.emit(topics.availability, 'online');
    emitState();
  }

  void emitState({bool lid = true}) => mqtt.emit(topics.state, {
        'serial': device.serial,
        'session_id': 'session',
        'revision': 1,
        'mode': 'simulated',
        'control_state': 'idle_retracted',
        'time_calibrated': true,
        'updated_at_utc': DateTime.now().millisecondsSinceEpoch ~/ 1000,
        'inputs': {'lid_closed': lid, 'retracted': true, 'extended': false},
        'emergency': {'total': 3, 'remaining': 3, 'reserved': false}
      });
  void result(String phase) => mqtt.emit(topics.result, {
        'device_serial': device.serial,
        'operation_id': mqtt.lastCommand!['command_id'],
        'phase': phase,
        'ok': true
      });
}

void main() {
  test('offline, stale, lid and missing key give concrete blocked reasons',
      () async {
    final f = Fixture();
    await f.start();
    addTearDown(f.controller.dispose);
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        isNull);
    f.emitState(lid: false);
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('关闭盒盖'));
    f.emitState();
    f.controller.privateKeys = {};
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('私钥'));
    f.controller.privateKeys = {f.pair.fingerprint: f.pair.privateJwk};
    f.controller.stateReceivedAt.updateAll(
        (key, value) => DateTime.now().subtract(const Duration(seconds: 31)));
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('30 秒'));
    await f.mqtt.disconnect();
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('连接'));
  });
  test('rapid double click requests only one challenge', () async {
    final f = Fixture();
    await f.start();
    addTearDown(f.controller.dispose);
    final first = f.controller.startConstantLock(f.device);
    await expectLater(
        f.controller.startConstantLock(f.device), throwsStateError);
    await first;
    expect(f.mqtt.requests, 1);
    expect(f.mqtt.commands, 1);
    expect(f.controller.logs.last.status, OperationStatus.waitingDevice);
  });
  test('final result cannot be overwritten by late accepted or duplicate',
      () async {
    final f = Fixture();
    await f.start();
    addTearDown(f.controller.dispose);
    await f.controller.startConstantLock(f.device);
    f.result('succeeded');
    f.result('accepted');
    f.result('duplicate');
    expect(f.controller.logs.last.status, OperationStatus.success);
  });
  test('unknown result waits for refreshed state or final device result',
      () async {
    final f = Fixture();
    await f.start();
    addTearDown(f.controller.dispose);
    f.mqtt.failPublish = true;
    await expectLater(
        f.controller.startConstantLock(f.device), throwsStateError);
    expect(f.controller.logs.last.status, OperationStatus.unknown);
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('结果未知'));
    await f.controller.refreshDevice(f.device);
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        contains('结果未知'));
    f.emitState();
    expect(f.controller.operationBlocked(f.device, Operation.startConstantLock),
        isNull);
    f.result('succeeded');
    expect(f.controller.logs.last.status, OperationStatus.success);
  });
  test('keyring failure is visible without plaintext fallback', () async {
    final f = Fixture();
    f.vault.fail = true;
    await f.controller.initialize();
    addTearDown(f.controller.dispose);
    expect(f.controller.errorMessage, contains('keyring locked'));
    expect(f.controller.privateKeys, isEmpty);
  });
  testWidgets('add device selects a local key and copies only its public JWK',
      (tester) async {
    final f = Fixture();
    await f.start();
    final second = generateKeyPair();
    f.controller.privateKeys[second.fingerprint] = second.privateJwk;
    String? clipboard;
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        clipboard = (call.arguments as Map)['text'] as String;
      }
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: DeviceListPage(
        controller: f.controller,
        selectedDeviceId: null,
        onSelect: (_) {},
      )),
    ));
    await tester.tap(find.text('添加设备'));
    await tester.pumpAndSettle();
    expect(find.text('授权公钥 JWK JSON'), findsNothing);
    await tester.enterText(find.byType(TextFormField).at(0), '新锁');
    await tester.enterText(find.byType(TextFormField).at(1), 'SIM-NEW');
    await tester.tap(find.text('本机密钥 ${f.pair.fingerprint.substring(0, 16)}…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('本机密钥 ${second.fingerprint.substring(0, 16)}…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('复制所选公钥'));
    await tester.pumpAndSettle();
    expect(jsonDecode(clipboard!), second.publicJwk);
    expect(jsonDecode(clipboard!).containsKey('d'), isFalse);
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    final added = f.controller.devices.last;
    expect(added.serial, 'SIM-NEW');
    expect(added.publicJwk, second.publicJwk);
    expect(added.fingerprint, second.fingerprint);
    expect(added.publicJwk.containsKey('d'), isFalse);
    expect(f.controller.privateKeys[second.fingerprint], second.privateJwk);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    f.controller.dispose();
  });
  testWidgets('no local key gives guidance and allows manual public key entry',
      (tester) async {
    final f = Fixture();
    await f.start();
    f.controller.privateKeys = {};
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: DeviceListPage(
        controller: f.controller,
        selectedDeviceId: null,
        onSelect: (_) {},
      )),
    ));
    await tester.tap(find.text('添加设备'));
    await tester.pumpAndSettle();
    expect(find.text('本机还没有私钥，请先到「密钥」页面生成或导入。'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), '手动锁');
    await tester.enterText(find.byType(TextFormField).at(1), 'SIM-MANUAL');
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(find.text('请选择授权密钥'), findsOneWidget);
    expect(f.controller.devices.length, 1);
    await tester.tap(find.byType(DropdownButtonFormField<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动粘贴公钥').last);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextFormField).last, jsonEncode(f.pair.publicJwk));
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(f.controller.devices.last.publicJwk, f.pair.publicJwk);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    f.controller.dispose();
  });
  testWidgets(
      'Linux wide selection shows detail; narrow has back; removal clears selection',
      (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    final f = Fixture();
    await f.start();
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(TetherLockApp(controller: f.controller));
    await tester.pump();
    await tester.tap(find.text('测试锁'));
    await tester.pump();
    expect(find.text('定时锁'), findsOneWidget);
    expect(tester.takeException(), isNull);
    tester.view.physicalSize = const Size(760, 720);
    await tester.pump();
    expect(find.text('返回设备列表'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('返回设备列表'));
    await tester.pump();
    expect(find.text('定时锁'), findsNothing);
    await tester.tap(find.text('测试锁'));
    await tester.pump();
    await f.controller.removeDevice(f.device.id);
    await tester.pump();
    expect(find.text('还没有设备'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    f.controller.dispose();
    debugDefaultTargetPlatformOverride = null;
  });
}
