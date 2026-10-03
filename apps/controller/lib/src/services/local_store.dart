import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models.dart';

class LocalStore {
  LocalStore({Future<File> Function()? fileProvider})
      : _fileProvider = fileProvider;

  final Future<File> Function()? _fileProvider;
  Future<void> _writeQueue = Future<void>.value();

  Future<File> _file() async {
    final provider = _fileProvider;
    if (provider != null) return provider();
    final directory = await getApplicationSupportDirectory();
    await directory.create(recursive: true);
    return File('${directory.path}${Platform.pathSeparator}tetherlock.json');
  }

  Future<AppSnapshot?> read() async {
    final file = await _file();
    if (!await file.exists()) return null;
    final decoded = jsonDecode(await file.readAsString());
    if (decoded is! Map) throw const FormatException('本地数据格式无效');
    return AppSnapshot.fromJson(Map<String, dynamic>.from(decoded));
  }

  Future<void> write(AppSnapshot snapshot) {
    // Result/state callbacks can arrive back-to-back. Keep the whole
    // temporary-file and replacement sequence serialized so one write cannot
    // remove another write's temporary file or published snapshot.
    final operation = _writeQueue.then((_) => _writeNow(snapshot));
    _writeQueue = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace __) {},
    );
    return operation;
  }

  Future<void> _writeNow(AppSnapshot snapshot) async {
    final file = await _file();
    final temporary =
        File('${file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp');
    try {
      await temporary.writeAsString(snapshot.encode(), flush: true);
      if (!Platform.isWindows || !await file.exists()) {
        await temporary.rename(file.path);
        return;
      }

      // Windows does not replace an existing destination with rename. Move
      // the old file aside first, and restore it if publishing the new file
      // fails. Other rename errors are allowed to propagate unchanged.
      final backup = File('${file.path}.bak');
      if (await backup.exists()) await backup.delete();
      await file.rename(backup.path);
      try {
        await temporary.rename(file.path);
        await backup.delete();
      } catch (error, stack) {
        if (!await file.exists() && await backup.exists()) {
          await backup.rename(file.path);
        }
        Error.throwWithStackTrace(error, stack);
      }
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }
}
