import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureVault {
  SecureVault({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _privateKeys = 'private_keys';
  static const _mqttPasswords = 'mqtt_passwords';

  Future<Map<String, Map<String, String>>> readPrivateKeys() async =>
      _readMap(_privateKeys);

  Future<void> writePrivateKeys(Map<String, Map<String, String>> keys) =>
      _writeMap(_privateKeys, keys);

  Future<String?> readMqttPassword(String profileId) =>
      _storage.read(key: '$_mqttPasswords/$profileId');

  Future<void> writeMqttPassword(String profileId, String password) =>
      _storage.write(key: '$_mqttPasswords/$profileId', value: password);

  Future<void> deleteMqttPassword(String profileId) =>
      _storage.delete(key: '$_mqttPasswords/$profileId');

  Future<Map<String, Map<String, String>>> _readMap(String key) async {
    final raw = await _storage.read(key: key);
    if (raw == null) return {};
    final decoded = jsonDecode(raw);
    if (decoded is! Map) throw const FormatException('安全存储中的密钥格式无效');
    return decoded.map(
      (id, value) =>
          MapEntry(id.toString(), Map<String, String>.from(value as Map)),
    );
  }

  Future<void> _writeMap(String key, Map<String, Map<String, String>> value) =>
      _storage.write(key: key, value: jsonEncode(value));
}
