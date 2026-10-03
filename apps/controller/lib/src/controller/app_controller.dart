import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

import '../models.dart';
import '../services/local_store.dart';
import '../services/mqtt_service.dart';
import '../services/secure_vault.dart';

class AppController extends ChangeNotifier {
  AppController({LocalStore? localStore, SecureVault? vault, MqttService? mqtt})
      : _localStore = localStore ?? LocalStore(),
        _vault = vault ?? SecureVault(),
        _mqtt = mqtt ?? MqttService();

  final LocalStore _localStore;
  final SecureVault _vault;
  final MqttService _mqtt;
  final Random _random = Random.secure();
  StreamSubscription<MqttMessageEvent>? _mqttSubscription;
  StreamSubscription<AppConnection>? _connectionSubscription;
  final Set<String> _sending = {};
  final Map<String, Timer> _resultTimers = {};
  final Map<String, DateTime> _refreshUnknownAfter = {};
  AppConnection get connection => _mqtt.connection;
  String get connectionLabel => switch (connection) {
        AppConnection.disconnected => '未连接',
        AppConnection.connecting => '连接中',
        AppConnection.connected => '已连接',
        AppConnection.reconnecting => '重连中',
        AppConnection.failed => '连接失败',
      };
  Timer? _freshnessTimer;

  static const stateFreshness = Duration(seconds: 30);

  List<MqttProfile> profiles = const [];
  List<AppDevice> devices = const [];
  List<OperationLogEntry> logs = const [];
  Map<String, Map<String, String>> privateKeys = {};
  final Map<String, DeviceState> states = {};
  final Map<String, bool> online = {};
  final Map<String, DateTime> stateReceivedAt = {};
  final Map<String, DateTime> availabilityReceivedAt = {};
  String? errorMessage;
  String? connectedProfileId;
  bool initialized = false;
  String themePreference = 'system';

  Future<void> setThemePreference(String value) async {
    if (!['system', 'light', 'dark'].contains(value)) return;
    themePreference = value;
    notifyListeners();
    await _persist();
  }

  Future<void> initialize() async {
    try {
      final snapshot = await _localStore.read();
      profiles = snapshot?.profiles ??
          [
            const MqttProfile(
              id: 'local',
              name: '本地 MQTT',
              host: '127.0.0.1',
              port: 1883,
              tls: false,
              namespace: 'tetherlock/v1',
            ),
          ];
      devices = snapshot?.devices ?? const [];
      logs = snapshot?.logs ?? const [];
      themePreference = snapshot?.themePreference ?? 'system';
      // A previous process can no longer own its request timeout. Require a
      // fresh device report before another operation after an interrupted send.
      logs = logs
          .map((entry) => [
                OperationStatus.sending,
                OperationStatus.waitingDevice,
                OperationStatus.waitingConfirmation,
                OperationStatus.executing,
              ].contains(entry.status)
                  ? entry.copyWith(status: OperationStatus.unknown)
                  : entry)
          .toList();
      privateKeys = await _vault.readPrivateKeys();
    } catch (error) {
      errorMessage = '加载本地配置失败：$error';
    }
    _mqttSubscription = _mqtt.messages.listen(_handleMqttMessage);
    _connectionSubscription = _mqtt.connections.listen((value) {
      if (value != AppConnection.connected) {
        for (final device in devices) {
          if (device.profileId == connectedProfileId) {
            online[_cacheKey(device)] = false;
            stateReceivedAt.remove(_cacheKey(device));
          }
        }
      }
      notifyListeners();
    });
    _freshnessTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => notifyListeners(),
    );
    initialized = true;
    notifyListeners();
  }

  Future<void> connectProfile(String profileId) async {
    final profile = profileById(profileId);
    if (profile == null) throw StateError('MQTT 配置不存在');
    try {
      final password = await _vault.readMqttPassword(profile.id);
      await _mqtt.connect(profile, password: password);
      // Set this before subscribing: retained state/availability messages can
      // arrive immediately from the subscription and must be associated with
      // the broker that is now active.
      connectedProfileId = profile.id;
      for (final device in devices.where(
        (device) => device.profileId == profile.id,
      )) {
        await _mqtt.subscribe(
          TetherTopics(device.serial, namespace: profile.namespace),
        );
      }
      errorMessage = null;
      notifyListeners();
    } catch (error) {
      errorMessage = '$error';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> disconnect() async {
    final profileId = connectedProfileId;
    await _mqtt.disconnect();
    if (profileId != null) {
      for (final device
          in devices.where((item) => item.profileId == profileId)) {
        online[_cacheKey(device)] = false;
      }
    }
    connectedProfileId = null;
    notifyListeners();
  }

  Future<void> refreshDevice(AppDevice device) async {
    _refreshUnknownAfter[_cacheKey(device)] = DateTime.now();
    final profile = profileById(device.profileId);
    if (profile == null) throw StateError('设备未选择 MQTT 配置');
    if (connectedProfileId != profile.id || !_mqtt.connected) {
      await connectProfile(profile.id);
    }
    await _mqtt.subscribe(
      TetherTopics(device.serial, namespace: profile.namespace),
    );
  }

  DeviceState? stateFor(AppDevice device) => states[_cacheKey(device)];

  String? operationBlocked(AppDevice device, Operation operation,
      {Map<String, dynamic>? arguments, bool ignoreSending = false}) {
    final key = _cacheKey(device);
    if (!ignoreSending && _sending.contains(key)) return '正在准备请求，请等待';
    if (connectedProfileId != device.profileId ||
        !_mqtt.connected ||
        connection != AppConnection.connected) {
      return '请先连接此设备的 MQTT 配置';
    }
    if (!isOnline(device)) return '设备离线，请检查模拟器连接';
    final state = stateFor(device);
    if (state == null) return '尚未收到设备状态，请刷新';
    if (stateIsStale(device)) return '设备状态超过 30 秒，请刷新';
    if (privateKeys[device.fingerprint] == null) return '缺少授权私钥，请在密钥页面导入';
    final recent = logsFor(device.serial).firstOrNull;
    if (recent != null &&
        [OperationStatus.sending, OperationStatus.waitingDevice]
            .contains(recent.status)) {
      return '等待设备接受上一条请求';
    }
    final refreshedAfter = _refreshUnknownAfter[key];
    final receivedAt = stateReceivedAt[key];
    if (recent?.status == OperationStatus.unknown &&
        (refreshedAfter == null ||
            receivedAt == null ||
            receivedAt.isBefore(refreshedAfter))) {
      return '上一条请求结果未知，请刷新设备状态';
    }
    if (state.retracted && state.extended) return '到位传感器矛盾，请排查故障';
    switch (operation) {
      case Operation.startTimedLock:
      case Operation.startConstantLock:
        if (state.controlState != ControlState.idleRetracted) {
          return '设备当前不能开始锁定';
        }
        if (!state.lidClosed) return '请先在模拟器中关闭盒盖';
        if (!state.retracted) return '插销尚未退回到位';
        if (operation == Operation.startTimedLock) {
          if (!state.timeCalibrated) return '设备尚未校时';
          final deadline = arguments?['deadline_utc'];
          if (deadline != null &&
              (deadline is! int ||
                  deadline <= DateTime.now().millisecondsSinceEpoch ~/ 1000)) {
            return '定时截止时间必须在未来';
          }
        }
      case Operation.unlockConstant:
        if (state.controlState != ControlState.constantLocked ||
            state.taskId == null) {
          return '当前没有可解锁的常锁任务';
        }
      case Operation.emergencyUnlock:
        if (state.controlState != ControlState.timedLocked ||
            state.taskId == null) {
          return '当前没有可紧急开锁的定时任务';
        }
        if (state.emergencyRemaining == 0) return '紧急卡已耗尽';
      case Operation.retryOperation:
        if (state.controlState != ControlState.fault ||
            state.taskId == null ||
            state.operationId == null) {
          return '当前没有可重试的故障操作';
        }
    }
    return null;
  }

  bool isOnline(AppDevice device) => online[_cacheKey(device)] == true;

  bool stateIsStale(AppDevice device) {
    final received = stateReceivedAt[_cacheKey(device)];
    return received == null ||
        DateTime.now().difference(received) > stateFreshness;
  }

  Duration? stateAge(AppDevice device) {
    final received = stateReceivedAt[_cacheKey(device)];
    if (received == null) return null;
    final age = DateTime.now().difference(received);
    return age.isNegative ? Duration.zero : age;
  }

  Future<void> saveProfile(MqttProfile profile, {String? password}) async {
    profiles = [...profiles.where((item) => item.id != profile.id), profile];
    if (password != null) await _vault.writeMqttPassword(profile.id, password);
    await _persist();
    notifyListeners();
  }

  Future<void> addDevice(AppDevice device) async {
    devices = [...devices.where((item) => item.id != device.id), device];
    await _persist();
    final profile = profileById(device.profileId);
    if (profile != null &&
        connectedProfileId == profile.id &&
        _mqtt.connected) {
      try {
        await _mqtt.subscribe(
          TetherTopics(device.serial, namespace: profile.namespace),
        );
      } catch (error) {
        errorMessage = '设备已保存，但订阅状态失败：$error';
      }
    }
    notifyListeners();
  }

  Future<void> removeDevice(String deviceId) async {
    final removed =
        devices.where((device) => device.id == deviceId).firstOrNull;
    devices = devices.where((device) => device.id != deviceId).toList();
    if (removed != null) {
      final key = _cacheKey(removed);
      states.remove(key);
      online.remove(key);
      stateReceivedAt.remove(key);
      availabilityReceivedAt.remove(key);
    }
    await _persist();
    notifyListeners();
  }

  Future<TetherKeyPair> generateKey() async {
    final pair = generateKeyPair();
    final id = pair.fingerprint;
    privateKeys = {...privateKeys, id: pair.privateJwk};
    await _vault.writePrivateKeys(privateKeys);
    notifyListeners();
    return pair;
  }

  Future<void> importKey(Map<String, String> jwk) async {
    if (!jwk.containsKey('d')) throw const FormatException('导入内容不包含私钥');
    validatePrivateJwk(jwk);
    privateKeys = {...privateKeys, publicKeyFingerprint(jwk): jwk};
    await _vault.writePrivateKeys(privateKeys);
    notifyListeners();
  }

  Future<String> exportKey(String fingerprint, String password) async {
    final key = privateKeys[fingerprint];
    if (key == null) throw StateError('找不到本地私钥');
    return encryptKeyBackup(key, password);
  }

  Future<void> importBackup(String encoded, String password) async {
    await importKey(decryptKeyBackup(encoded, password));
  }

  Future<void> deleteKey(String fingerprint) async {
    privateKeys = {...privateKeys}..remove(fingerprint);
    await _vault.writePrivateKeys(privateKeys);
    notifyListeners();
  }

  Future<void> startTimedLock(AppDevice device, DateTime localDeadline) async {
    await _send(device, Operation.startTimedLock, {
      'deadline_utc': localDeadline.toUtc().millisecondsSinceEpoch ~/ 1000,
      'task_id': _id('task'),
    });
  }

  Future<void> startConstantLock(AppDevice device) =>
      _send(device, Operation.startConstantLock, {'task_id': _id('task')});

  Future<void> unlockConstant(AppDevice device, String taskId) =>
      _send(device, Operation.unlockConstant, {'task_id': taskId});

  Future<void> emergencyUnlock(AppDevice device, String taskId) => _send(
        device,
        Operation.emergencyUnlock,
        {'task_id': taskId, 'transaction_id': _id('tx')},
      );

  Future<void> retryOperation(
    AppDevice device,
    String taskId, {
    String? operationId,
  }) =>
      _send(device, Operation.retryOperation, {
        'task_id': taskId,
        if (operationId != null) 'operation_id': operationId,
      });

  List<OperationLogEntry> logsFor(String serial) => logs
      .where((entry) => entry.deviceSerial == serial)
      .toList()
      .reversed
      .toList();

  MqttProfile? profileById(String id) =>
      profiles.where((profile) => profile.id == id).firstOrNull;
  AppDevice? deviceById(String id) =>
      devices.where((device) => device.id == id).firstOrNull;

  Future<String> exportLogs() async => const JsonEncoder.withIndent('  ')
      .convert(logs.map((entry) => entry.toJson()).toList());

  @override
  void dispose() {
    for (final timer in _resultTimers.values) {
      timer.cancel();
    }
    _mqttSubscription?.cancel();
    _connectionSubscription?.cancel();
    _freshnessTimer?.cancel();
    _mqtt.dispose();
    super.dispose();
  }

  Future<void> _send(
    AppDevice device,
    Operation operation,
    Map<String, dynamic> arguments,
  ) async {
    final reason = operationBlocked(device, operation, arguments: arguments);
    if (reason != null) throw StateError(reason);
    final key = _cacheKey(device);
    _sending.add(key);
    notifyListeners();
    try {
      await _sendPrepared(device, operation, arguments);
    } finally {
      _sending.remove(key);
      notifyListeners();
    }
  }

  Future<void> _sendPrepared(AppDevice device, Operation operation,
      Map<String, dynamic> arguments) async {
    final profile = profileById(device.profileId);
    if (profile == null) throw StateError('设备未选择 MQTT 配置');
    final privateJwk = privateKeys[device.fingerprint];
    if (privateJwk == null) throw StateError('本机没有该设备授权私钥');
    if (connectedProfileId != profile.id || !_mqtt.connected) {
      await connectProfile(profile.id);
    }
    final topics = TetherTopics(device.serial, namespace: profile.namespace);
    final challenge = await _requestChallenge(topics);
    final reason = operationBlocked(device, operation,
        arguments: arguments, ignoreSending: true);
    if (reason != null) throw StateError(reason);
    _refreshUnknownAfter.remove(_cacheKey(device));
    final commandId = _id('op');
    final command = CommandPayload(
      protocolVersion: protocolVersion,
      deviceSerial: device.serial,
      commandId: commandId,
      challenge: challenge.challenge,
      operation: operation,
      arguments: arguments,
    );
    final entry = OperationLogEntry(
      id: commandId,
      deviceSerial: device.serial,
      operation: operationName(operation),
      requestedAt: DateTime.now(),
      status: OperationStatus.sending,
      taskId: arguments['task_id'] as String?,
    );
    logs = [...logs, entry].takeLast(1000).toList();
    await _persist();
    try {
      await _mqtt.publishJson(
        topics.command,
        createSignedCommand(command, privateJwk).toJson(),
      );
    } catch (error) {
      logs = logs
          .map(
            (item) => item.id == commandId &&
                    ![
                      OperationStatus.success,
                      OperationStatus.rejected,
                      OperationStatus.failed
                    ].contains(item.status)
                ? item.copyWith(
                    status: OperationStatus.unknown,
                    code: '$error',
                  )
                : item,
          )
          .toList();
      await _persist();
      notifyListeners();
      rethrow;
    }
    logs = logs
        .map(
          (item) =>
              item.id == commandId && item.status == OperationStatus.sending
                  ? item.copyWith(status: OperationStatus.waitingDevice)
                  : item,
        )
        .toList();
    await _persist();
    notifyListeners();
    _scheduleUnknown(commandId);
  }

  Future<Challenge> _requestChallenge(TetherTopics topics) async {
    final completer = Completer<Challenge>();
    final requestId = _id('request');
    late final StreamSubscription<MqttMessageEvent> subscription;
    subscription = _mqtt.messages
        .where((message) => message.topic == topics.challengeResponse)
        .listen((message) {
      if (completer.isCompleted) return;
      try {
        final challenge = Challenge.fromJson(
          jsonDecode(message.payload) as Map<String, dynamic>,
        );
        if (challenge.requestId != requestId) return;
        completer.complete(challenge);
      } catch (error) {
        completer.completeError(error);
      } finally {
        if (completer.isCompleted) subscription.cancel();
      }
    });
    try {
      await _mqtt
          .publishJson(topics.challengeRequest, {'request_id': requestId});
    } catch (_) {
      await subscription.cancel();
      rethrow;
    }
    return completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        subscription.cancel();
        throw TimeoutException('等待设备挑战超时');
      },
    );
  }

  void _handleMqttMessage(MqttMessageEvent event) {
    final profileId = connectedProfileId;
    if (profileId == null) return;
    // MqttService has one active connection at a time. Only devices assigned
    // to that profile may consume its topics; otherwise two brokers with the
    // same serial/namespace would overwrite each other's cached state.
    for (final device in devices.where((item) => item.profileId == profileId)) {
      final profile = profileById(device.profileId);
      if (profile == null) continue;
      final topics = TetherTopics(device.serial, namespace: profile.namespace);
      final key = _cacheKey(device);
      if (event.topic == topics.state) {
        try {
          states[key] = DeviceState.fromJson(
            jsonDecode(event.payload) as Map<String, dynamic>,
          );
          stateReceivedAt[key] = DateTime.now();
          final refresh = _refreshUnknownAfter[key];
          if (refresh != null) {
            // Explicit refresh has now actually received a state, not merely
            // requested a subscription. It releases the unknown-result guard.
            _refreshUnknownAfter[key] = stateReceivedAt[key]!;
          }
        } catch (_) {
          // Invalid retained state is ignored and surfaced as stale status.
        }
      } else if (event.topic == topics.availability) {
        online[key] = event.payload.trim() == 'online';
        availabilityReceivedAt[key] = DateTime.now();
      } else if (event.topic == topics.result) {
        try {
          _applyResult(
              jsonDecode(event.payload) as Map<String, dynamic>, device);
        } catch (_) {
          errorMessage = '收到无效的设备结果';
        }
      }
    }
    notifyListeners();
  }

  void _applyResult(Map<String, dynamic> result, AppDevice device) {
    final id = result['operation_id'] as String?;
    if (id == null || result['device_serial'] != device.serial) return;
    final phase = result['phase'] as String? ?? 'unknown';
    if (phase == 'duplicate') return;
    final status = operationStatusForResultPhase(phase);
    if ([
      OperationStatus.success,
      OperationStatus.rejected,
      OperationStatus.failed
    ].contains(status)) {
      _resultTimers.remove(id)?.cancel();
    }
    logs = logs
        .map(
          (entry) => entry.id == id &&
                  entry.deviceSerial == device.serial &&
                  !([
                        OperationStatus.success,
                        OperationStatus.rejected,
                        OperationStatus.failed
                      ].contains(entry.status) &&
                      [
                        OperationStatus.waitingDevice,
                        OperationStatus.waitingConfirmation,
                        OperationStatus.executing,
                        OperationStatus.unknown,
                      ].contains(status))
              ? entry.copyWith(status: status, code: result['code'] as String?)
              : entry,
        )
        .toList();
    unawaited(_persist());
  }

  void _scheduleUnknown(String operationId) {
    _resultTimers[operationId] = Timer(const Duration(minutes: 2), () {
      _resultTimers.remove(operationId);
      final pending =
          logs.where((entry) => entry.id == operationId).firstOrNull;
      if (pending == null ||
          !{
            OperationStatus.sending,
            OperationStatus.waitingDevice,
            OperationStatus.waitingConfirmation,
            OperationStatus.executing,
          }.contains(pending.status)) {
        return;
      }
      logs = logs
          .map(
            (entry) => entry.id == operationId
                ? entry.copyWith(status: OperationStatus.unknown)
                : entry,
          )
          .toList();
      unawaited(_persist());
      notifyListeners();
    });
  }

  Future<void> _persist() => _localStore.write(
        AppSnapshot(
            profiles: profiles,
            devices: devices,
            logs: logs,
            themePreference: themePreference),
      );

  String _cacheKey(AppDevice device) =>
      _deviceCacheKey(device.profileId, device.serial);

  String _id(String prefix) =>
      '$prefix-${DateTime.now().microsecondsSinceEpoch}-${_random.nextInt(1 << 20)}';
}

OperationStatus operationStatusForResultPhase(String phase) => switch (phase) {
      'accepted' => OperationStatus.executing,
      'waiting_confirmation' => OperationStatus.waitingConfirmation,
      'succeeded' || 'recovered' => OperationStatus.success,
      'rejected' => OperationStatus.rejected,
      'failed' => OperationStatus.failed,
      _ => OperationStatus.unknown,
    };

String _deviceCacheKey(String profileId, String serial) =>
    '$profileId\u0000$serial';

extension _IterableTakeLast<T> on Iterable<T> {
  Iterable<T> takeLast(int count) {
    final values = toList();
    return values.length <= count
        ? values
        : values.sublist(values.length - count);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
