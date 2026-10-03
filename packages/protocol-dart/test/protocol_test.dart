import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

void main() {
  test('canonical JSON sorts keys and rejects fractional values', () {
    expect(
      canonicalJson({
        'z': 1,
        'a': [true, 'x'],
      }),
      '{"a":[true,"x"],"z":1}',
    );
    expect(() => canonicalJson({'value': 1.5}), throwsFormatException);
  });

  test('P-256 command signs, verifies and rejects replayed challenge', () {
    final pair = generateKeyPair();
    final challenge = const Challenge(
      requestId: 'request-1',
      challenge: 'challenge-1',
      expiresAtMonotonicMs: 60 * 1000,
    );
    final command = CommandPayload(
      protocolVersion: protocolVersion,
      deviceSerial: 'SIM-001',
      commandId: 'operation-1',
      challenge: challenge.challenge,
      operation: Operation.startTimedLock,
      arguments: {'deadline_utc': 1700000100, 'task_id': 'task-1'},
    );
    final envelope = createSignedCommand(command, pair.privateJwk);
    final challenges = ChallengeRegistry()..add(challenge);
    expect(
      verifyAndDecodeCommand(
        envelope,
        pair.publicJwk,
        challenges: challenges,
        nowMonotonicMs: 1,
      ).commandId,
      'operation-1',
    );
    expect(publicKeyFingerprint(pair.publicJwk), hasLength(43));
    expect(
      () => verifyAndDecodeCommand(
        envelope,
        pair.publicJwk,
        challenges: challenges,
        nowMonotonicMs: 1,
      ),
      throwsFormatException,
    );
  });

  test('JWK validation rejects malformed curve points and private scalars', () {
    final pair = generateKeyPair();
    expect(
      () => validatePublicJwk({
        ...pair.publicJwk,
        'x': base64UrlEncodeBytes(List<int>.filled(32, 0)),
        'y': base64UrlEncodeBytes(List<int>.filled(32, 0)),
      }),
      throwsFormatException,
    );
    expect(
      () => validatePrivateJwk({
        ...pair.privateJwk,
        'd': base64UrlEncodeBytes(List<int>.filled(32, 0)),
      }),
      throwsFormatException,
    );
  });

  test('AES-GCM backup detects wrong password and round trips the key', () {
    final pair = generateKeyPair();
    final encoded = encryptKeyBackup(
      pair.privateJwk,
      'correct horse battery staple',
    );
    expect(
      decryptKeyBackup(encoded, 'correct horse battery staple'),
      pair.privateJwk,
    );
    expect(
      () => decryptKeyBackup(encoded, 'wrong password'),
      throwsA(anything),
    );
    expect(
      jsonDecode(encoded),
      containsPair('algorithm', 'PBKDF2-HMAC-SHA256+AES-256-GCM'),
    );
    final tampered = jsonDecode(encoded) as Map<String, dynamic>;
    (tampered['kdf'] as Map<String, dynamic>)['iterations'] = 1;
    expect(
      () => decryptKeyBackup(
          jsonEncode(tampered), 'correct horse battery staple'),
      throwsFormatException,
    );
  });

  test('device state maps simulator snake_case states', () {
    final state = DeviceState.fromJson({
      'serial': 'SIM-001',
      'session_id': 'sim-SIM-001',
      'firmware_version': 'tetherlock-simulator/0.1.0',
      'revision': 2,
      'mode': 'simulated',
      'control_state': 'timed_locked',
      'time_calibrated': true,
      'updated_at_utc': 1700000000,
      'remaining_seconds': 100,
      'inputs': {'lid_closed': true, 'retracted': false, 'extended': true},
      'emergency': {'total': 3, 'remaining': 3, 'reserved': false},
      'task': {'task_id': 'task-1', 'deadline_utc': 1700000100},
    });
    expect(state.controlState, ControlState.timedLocked);
    expect(state.firmwareVersion, 'tetherlock-simulator/0.1.0');
    expect(state.deadlineUtc, 1700000100);
    expect(state.remainingSeconds, 100);
  });

  test('device state exposes local confirmation expiry', () {
    final state = DeviceState.fromJson({
      'serial': 'SIM-001',
      'control_state': 'awaiting_confirmation',
      'pending_operation_id': 'operation-1',
      'pending_task_id': 'task-1',
      'confirmation_remaining_seconds': 57,
    });
    expect(state.controlState, ControlState.awaitingConfirmation);
    expect(state.pendingOperationId, 'operation-1');
    expect(state.pendingTaskId, 'task-1');
    expect(state.confirmationRemainingSeconds, 57);
  });

  test('shared simulator vector verifies in Dart', () {
    final file = [
      File('packages/simulator-core/tests/protocol_vectors.json'),
      File('../../packages/simulator-core/tests/protocol_vectors.json'),
    ].firstWhere((candidate) => candidate.existsSync());
    final root = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    final vector = Map<String, dynamic>.from(root['command_vector'] as Map);
    final payload = Map<String, dynamic>.from(vector['payload'] as Map);
    final publicJwk = Map<String, String>.from(
      (vector['public_jwk'] as Map).map(
        (key, value) => MapEntry(key.toString(), value.toString()),
      ),
    );
    expect(
      verifyCommandPayload(
        payload,
        base64UrlDecodeBytes(vector['signature_base64url'] as String),
        publicJwk,
      ),
      isTrue,
    );
  });

  test('MQTT topic builder normalizes namespace separators', () {
    final topics = TetherTopics('SIM-001', namespace: 'tetherlock/v1/');
    expect(topics.command, 'tetherlock/v1/SIM-001/command');
  });
}
