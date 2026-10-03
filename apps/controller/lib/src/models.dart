import 'dart:convert';

import 'package:tetherlock_protocol/tetherlock_protocol.dart';

class MqttProfile {
  const MqttProfile({
    required this.id,
    required this.name,
    required this.host,
    required this.port,
    required this.tls,
    required this.namespace,
    this.username,
  });

  final String id;
  final String name;
  final String host;
  final int port;
  final bool tls;
  final String namespace;
  final String? username;

  MqttProfile copyWith({
    String? name,
    String? host,
    int? port,
    bool? tls,
    String? namespace,
    String? username,
  }) =>
      MqttProfile(
        id: id,
        name: name ?? this.name,
        host: host ?? this.host,
        port: port ?? this.port,
        tls: tls ?? this.tls,
        namespace: namespace ?? this.namespace,
        username: username ?? this.username,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'host': host,
        'port': port,
        'tls': tls,
        'namespace': namespace,
        if (username != null) 'username': username,
      };

  factory MqttProfile.fromJson(Map<String, dynamic> json) => MqttProfile(
        id: json['id'] as String,
        name: json['name'] as String,
        host: json['host'] as String,
        port: json['port'] as int,
        tls: json['tls'] as bool? ?? false,
        namespace: json['namespace'] as String? ?? 'tetherlock/v1',
        username: json['username'] as String?,
      );
}

class AppDevice {
  const AppDevice({
    required this.id,
    required this.alias,
    required this.serial,
    required this.profileId,
    required this.publicJwk,
  });

  final String id;
  final String alias;
  final String serial;
  final String profileId;
  final Map<String, String> publicJwk;

  String get fingerprint => publicKeyFingerprint(publicJwk);

  AppDevice copyWith({
    String? alias,
    String? profileId,
    Map<String, String>? publicJwk,
  }) =>
      AppDevice(
        id: id,
        alias: alias ?? this.alias,
        serial: serial,
        profileId: profileId ?? this.profileId,
        publicJwk: publicJwk ?? this.publicJwk,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'alias': alias,
        'serial': serial,
        'profile_id': profileId,
        'public_jwk': publicJwk,
      };

  factory AppDevice.fromJson(Map<String, dynamic> json) => AppDevice(
        id: json['id'] as String,
        alias: json['alias'] as String,
        serial: json['serial'] as String,
        profileId: json['profile_id'] as String,
        publicJwk: Map<String, String>.from(json['public_jwk'] as Map),
      );
}

enum OperationStatus {
  sending,
  waitingDevice,
  waitingConfirmation,
  executing,
  success,
  rejected,
  failed,
  unknown,
}

String controlStateLabel(ControlState state) => switch (state) {
      ControlState.bootRecovery => '启动恢复',
      ControlState.waitingForTime => '等待校时',
      ControlState.idleRetracted => '空闲已退栓',
      ControlState.awaitingConfirmation => '等待本地确认',
      ControlState.locking => '闭锁中',
      ControlState.timedLocked => '定时锁定',
      ControlState.constantLocked => '常锁锁定',
      ControlState.unlocking => '退栓中',
      ControlState.fault => '故障',
    };

String operationLabel(String operation) => switch (operation) {
      'start_timed_lock' => '开始定时锁',
      'start_constant_lock' => '开始常锁',
      'unlock_constant' => '解锁常锁',
      'emergency_unlock' => '紧急开锁',
      'retry_operation' => '重试操作',
      _ => operation,
    };

String operationStatusLabel(OperationStatus status) => switch (status) {
      OperationStatus.sending => '发送中',
      OperationStatus.waitingDevice => '等待设备接受',
      OperationStatus.waitingConfirmation => '等待本地确认',
      OperationStatus.executing => '执行中',
      OperationStatus.success => '成功',
      OperationStatus.rejected => '已拒绝',
      OperationStatus.failed => '失败',
      OperationStatus.unknown => '结果未知',
    };

class OperationLogEntry {
  const OperationLogEntry({
    required this.id,
    required this.deviceSerial,
    required this.operation,
    required this.requestedAt,
    required this.status,
    this.code,
    this.taskId,
  });

  final String id;
  final String deviceSerial;
  final String operation;
  final DateTime requestedAt;
  final OperationStatus status;
  final String? code;
  final String? taskId;

  OperationLogEntry copyWith({
    OperationStatus? status,
    String? code,
    String? taskId,
  }) =>
      OperationLogEntry(
        id: id,
        deviceSerial: deviceSerial,
        operation: operation,
        requestedAt: requestedAt,
        status: status ?? this.status,
        code: code ?? this.code,
        taskId: taskId ?? this.taskId,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'device_serial': deviceSerial,
        'operation': operation,
        'requested_at': requestedAt.toUtc().toIso8601String(),
        'status': status.name,
        if (code != null) 'code': code,
        if (taskId != null) 'task_id': taskId,
      };

  factory OperationLogEntry.fromJson(Map<String, dynamic> json) =>
      OperationLogEntry(
        id: json['id'] as String,
        deviceSerial: json['device_serial'] as String,
        operation: json['operation'] as String,
        requestedAt: DateTime.parse(json['requested_at'] as String).toLocal(),
        status: OperationStatus.values.firstWhere(
          (value) => value.name == json['status'],
          orElse: () => OperationStatus.unknown,
        ),
        code: json['code'] as String?,
        taskId: json['task_id'] as String?,
      );
}

class AppSnapshot {
  const AppSnapshot({
    required this.profiles,
    required this.devices,
    required this.logs,
    this.themePreference = 'system',
  });

  final List<MqttProfile> profiles;
  final List<AppDevice> devices;
  final List<OperationLogEntry> logs;
  final String themePreference;

  Map<String, dynamic> toJson() => {
        'version': 1,
        'theme_preference': themePreference,
        'profiles': profiles.map((profile) => profile.toJson()).toList(),
        'devices': devices.map((device) => device.toJson()).toList(),
        'logs': logs.map((entry) => entry.toJson()).toList(),
      };

  factory AppSnapshot.fromJson(Map<String, dynamic> json) => AppSnapshot(
        themePreference: ['light', 'dark'].contains(json['theme_preference'])
            ? json['theme_preference'] as String
            : 'system',
        profiles: [
          for (final item in (json['profiles'] as List? ?? const []))
            MqttProfile.fromJson(Map<String, dynamic>.from(item as Map)),
        ],
        devices: [
          for (final item in (json['devices'] as List? ?? const []))
            AppDevice.fromJson(Map<String, dynamic>.from(item as Map)),
        ],
        logs: [
          for (final item in (json['logs'] as List? ?? const []))
            OperationLogEntry.fromJson(Map<String, dynamic>.from(item as Map)),
        ],
      );

  String encode() => jsonEncode(toJson());
}
