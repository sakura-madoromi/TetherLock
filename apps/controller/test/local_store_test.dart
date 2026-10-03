import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:tetherlock/src/models.dart';
import 'package:tetherlock/src/services/local_store.dart';

void main() {
  test('serializes concurrent snapshot writes and keeps the final snapshot',
      () async {
    final directory =
        await Directory.systemTemp.createTemp('tetherlock-store-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/tetherlock.json');
    final store = LocalStore(fileProvider: () async => file);

    AppSnapshot snapshot(String id) => AppSnapshot(
          profiles: const [],
          devices: const [],
          logs: [
            OperationLogEntry(
              id: id,
              deviceSerial: 'SIM-001',
              operation: 'start_constant_lock',
              requestedAt: DateTime.utc(2026, 1, 1),
              status: OperationStatus.success,
            ),
          ],
        );

    await Future.wait([
      store.write(snapshot('first')),
      store.write(snapshot('second')),
      store.write(snapshot('third')),
    ]);

    final saved = await store.read();
    expect(saved?.logs.single.id, 'third');
    expect(
      await directory
          .list()
          .where((entry) => entry.path.endsWith('.tmp'))
          .isEmpty,
      isTrue,
    );
  });
}
