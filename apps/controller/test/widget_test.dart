import 'package:flutter_test/flutter_test.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

import 'package:tetherlock/src/controller/app_controller.dart';
import 'package:tetherlock/src/models.dart';

void main() {
  test('protocol operation names remain stable for the UI', () {
    expect(operationName(Operation.startTimedLock), 'start_timed_lock');
    expect(operationName(Operation.emergencyUnlock), 'emergency_unlock');
  });

  test('recovered device results are terminal successes', () {
    expect(
      operationStatusForResultPhase('recovered'),
      OperationStatus.success,
    );
  });
}
