import 'dart:convert';

enum Operation {
  startTimedLock,
  startConstantLock,
  unlockConstant,
  emergencyUnlock,
  retryOperation,
}

String operationName(Operation operation) => switch (operation) {
      Operation.startTimedLock => 'start_timed_lock',
      Operation.startConstantLock => 'start_constant_lock',
      Operation.unlockConstant => 'unlock_constant',
      Operation.emergencyUnlock => 'emergency_unlock',
      Operation.retryOperation => 'retry_operation',
    };

Operation operationFromName(String value) => Operation.values.firstWhere(
      (candidate) => operationName(candidate) == value,
      orElse: () => throw FormatException('unknown operation $value'),
    );

class Challenge {
  const Challenge({
    required this.requestId,
    required this.challenge,
    required this.expiresAtMonotonicMs,
  });

  final String requestId;
  final String challenge;
  final int expiresAtMonotonicMs;

  factory Challenge.fromJson(Map<String, dynamic> json) => Challenge(
        requestId: json['request_id'] as String,
        challenge: json['challenge'] as String,
        expiresAtMonotonicMs: json['expires_at_monotonic_ms'] as int,
      );

  Map<String, dynamic> toJson() => {
        'request_id': requestId,
        'challenge': challenge,
        'expires_at_monotonic_ms': expiresAtMonotonicMs,
      };
}

class SignedCommand {
  const SignedCommand({
    required this.protocolVersion,
    required this.algorithm,
    required this.payloadBase64Url,
    required this.signatureBase64Url,
  });

  final int protocolVersion;
  final String algorithm;
  final String payloadBase64Url;
  final String signatureBase64Url;

  factory SignedCommand.fromJson(Map<String, dynamic> json) => SignedCommand(
        protocolVersion: json['protocol_version'] as int,
        algorithm: json['algorithm'] as String,
        payloadBase64Url: json['payload'] as String,
        signatureBase64Url: json['signature'] as String,
      );

  Map<String, dynamic> toJson() => {
        'protocol_version': protocolVersion,
        'algorithm': algorithm,
        'payload': payloadBase64Url,
        'signature': signatureBase64Url,
      };

  String encode() => jsonEncode(toJson());
}

class CommandPayload {
  const CommandPayload({
    required this.protocolVersion,
    required this.deviceSerial,
    required this.commandId,
    required this.challenge,
    required this.operation,
    required this.arguments,
  });

  final int protocolVersion;
  final String deviceSerial;
  final String commandId;
  final String challenge;
  final Operation operation;
  final Map<String, dynamic> arguments;

  Map<String, dynamic> toJson() => {
        'arguments': arguments,
        'challenge': challenge,
        'command_id': commandId,
        'device_serial': deviceSerial,
        'operation': operationName(operation),
        'protocol_version': protocolVersion,
      };

  factory CommandPayload.fromJson(Map<String, dynamic> json) => CommandPayload(
        protocolVersion: json['protocol_version'] as int,
        deviceSerial: json['device_serial'] as String,
        commandId: json['command_id'] as String,
        challenge: json['challenge'] as String,
        operation: operationFromName(json['operation'] as String),
        arguments: Map<String, dynamic>.from(json['arguments'] as Map),
      );
}

enum DeviceMode { simulated, bench, real }

enum ControlState {
  bootRecovery,
  waitingForTime,
  idleRetracted,
  awaitingConfirmation,
  locking,
  timedLocked,
  constantLocked,
  unlocking,
  fault,
}

DeviceMode deviceModeFromName(String value) => DeviceMode.values.firstWhere(
      (candidate) => candidate.name == value,
      orElse: () => DeviceMode.simulated,
    );

ControlState controlStateFromName(String value) => switch (value) {
      'boot_recovery' => ControlState.bootRecovery,
      'waiting_for_time' => ControlState.waitingForTime,
      'idle_retracted' => ControlState.idleRetracted,
      'awaiting_confirmation' => ControlState.awaitingConfirmation,
      'locking' => ControlState.locking,
      'timed_locked' => ControlState.timedLocked,
      'constant_locked' => ControlState.constantLocked,
      'unlocking' => ControlState.unlocking,
      'fault' => ControlState.fault,
      _ => ControlState.fault,
    };

class DeviceState {
  const DeviceState({
    required this.serial,
      required this.sessionId,
      this.firmwareVersion = '未知',
      required this.revision,
    required this.mode,
    required this.controlState,
    required this.timeCalibrated,
    required this.updatedAtUtc,
    required this.lidClosed,
    required this.retracted,
    required this.extended,
    required this.emergencyTotal,
    required this.emergencyRemaining,
    required this.emergencyReserved,
      this.taskId,
      this.pendingOperationId,
      this.pendingTaskId,
      this.confirmationRemainingSeconds,
      this.deadlineUtc,
    this.remainingSeconds,
    this.operationId,
    this.faultCode,
  });

  final String serial;
  final String sessionId;
  final String firmwareVersion;
  final int revision;
  final DeviceMode mode;
  final ControlState controlState;
  final bool timeCalibrated;
  final int updatedAtUtc;
  final bool lidClosed;
  final bool retracted;
  final bool extended;
  final int emergencyTotal;
  final int emergencyRemaining;
  final bool emergencyReserved;
  final String? taskId;
  final String? pendingOperationId;
  final String? pendingTaskId;
  final int? confirmationRemainingSeconds;
  final int? deadlineUtc;
  final int? remainingSeconds;
  final String? operationId;
  final String? faultCode;

  factory DeviceState.fromJson(Map<String, dynamic> json) {
    final inputs = Map<String, dynamic>.from(
      json['inputs'] as Map? ?? const {},
    );
    final emergency = Map<String, dynamic>.from(
      json['emergency'] as Map? ?? const {},
    );
    final task = json['task'] is Map
        ? Map<String, dynamic>.from(json['task'] as Map)
        : const <String, dynamic>{};
    return DeviceState(
      serial: json['serial'] as String? ?? '',
      sessionId: json['session_id'] as String? ?? '',
      firmwareVersion: json['firmware_version'] as String? ?? '未知',
      revision: json['revision'] as int? ?? 0,
      mode: deviceModeFromName(json['mode'] as String? ?? 'simulated'),
      controlState: controlStateFromName(
        json['control_state'] as String? ?? 'fault',
      ),
      timeCalibrated: json['time_calibrated'] as bool? ?? false,
      updatedAtUtc: json['updated_at_utc'] as int? ?? 0,
      lidClosed: inputs['lid_closed'] as bool? ?? false,
      retracted: inputs['retracted'] as bool? ?? false,
      extended: inputs['extended'] as bool? ?? false,
      emergencyTotal: emergency['total'] as int? ?? 0,
      emergencyRemaining: emergency['remaining'] as int? ?? 0,
      emergencyReserved: emergency['reserved'] as bool? ?? false,
      taskId: task['task_id'] as String?,
      pendingOperationId: json['pending_operation_id'] as String?,
      pendingTaskId: json['pending_task_id'] as String?,
      confirmationRemainingSeconds:
          json['confirmation_remaining_seconds'] as int?,
      deadlineUtc: task['deadline_utc'] as int? ?? json['deadline_utc'] as int?,
      remainingSeconds: json['remaining_seconds'] as int?,
      operationId: json['current_operation_id'] as String? ??
          json['operation_id'] as String?,
      faultCode: json['fault_code'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'serial': serial,
        'session_id': sessionId,
        'firmware_version': firmwareVersion,
        'revision': revision,
        'mode': mode.name,
        'control_state': controlState.name,
        'time_calibrated': timeCalibrated,
        'updated_at_utc': updatedAtUtc,
        'inputs': {
          'lid_closed': lidClosed,
          'retracted': retracted,
          'extended': extended,
        },
        'emergency': {
          'total': emergencyTotal,
          'remaining': emergencyRemaining,
          'reserved': emergencyReserved,
        },
        if (taskId != null) 'task_id': taskId,
        if (pendingOperationId != null)
          'pending_operation_id': pendingOperationId,
        if (pendingTaskId != null) 'pending_task_id': pendingTaskId,
        if (confirmationRemainingSeconds != null)
          'confirmation_remaining_seconds': confirmationRemainingSeconds,
        if (deadlineUtc != null) 'deadline_utc': deadlineUtc,
        if (remainingSeconds != null) 'remaining_seconds': remainingSeconds,
        if (operationId != null) 'operation_id': operationId,
        if (faultCode != null) 'fault_code': faultCode,
      };
}

class OperationResult {
  const OperationResult({
    required this.operationId,
    required this.serial,
    required this.phase,
    required this.ok,
    this.code,
    this.taskId,
  });

  final String operationId;
  final String serial;
  final String phase;
  final bool ok;
  final String? code;
  final String? taskId;

  Map<String, dynamic> toJson() => {
        'operation_id': operationId,
        'device_serial': serial,
        'phase': phase,
        'ok': ok,
        if (code != null) 'code': code,
        if (taskId != null) 'task_id': taskId,
      };
}
