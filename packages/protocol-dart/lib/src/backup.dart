import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import 'canonical_json.dart';
import 'crypto.dart';

const _backupVersion = 1;
const _backupAlgorithm = 'PBKDF2-HMAC-SHA256+AES-256-GCM';
const _iterations = 600000;

Map<String, dynamic> _backupHeader(
  int version,
  Map<String, dynamic> kdf,
) =>
    {
      'version': version,
      'algorithm': _backupAlgorithm,
      'kdf': kdf,
    };

class KeyBackup {
  const KeyBackup({
    required this.version,
    required this.kdf,
    required this.cipher,
  });

  final int version;
  final Map<String, dynamic> kdf;
  final Map<String, dynamic> cipher;

  Map<String, dynamic> toJson() => {
        'version': version,
        'algorithm': _backupAlgorithm,
        'kdf': kdf,
        'cipher': cipher,
      };

  factory KeyBackup.fromJson(Map<String, dynamic> json) {
    if (json['version'] != _backupVersion ||
        json['algorithm'] != _backupAlgorithm) {
      throw FormatException('unsupported key backup format');
    }
    return KeyBackup(
      version: json['version'] as int,
      kdf: Map<String, dynamic>.from(json['kdf'] as Map),
      cipher: Map<String, dynamic>.from(json['cipher'] as Map),
    );
  }
}

Uint8List _deriveKey(String password, Uint8List salt) {
  final derivator = PBKDF2KeyDerivator(HMac(SHA256Digest(), 64))
    ..init(Pbkdf2Parameters(salt, _iterations, 32));
  return derivator.process(Uint8List.fromList(utf8.encode(password)));
}

String encryptKeyBackup(Map<String, String> privateJwk, String password) {
  if (password.length < 12)
    throw ArgumentError('backup password must be at least 12 characters');
  validatePrivateJwk(privateJwk);
  final random = FortunaRandom();
  final source = math.Random.secure();
  random.seed(
    KeyParameter(
      Uint8List.fromList(List<int>.generate(32, (_) => source.nextInt(256))),
    ),
  );
  final salt = Uint8List(16)..setAll(0, random.nextBytes(16));
  final nonce = Uint8List(12)..setAll(0, random.nextBytes(12));
  final kdf = {
    'name': 'PBKDF2-HMAC-SHA256',
    'iterations': _iterations,
    'salt': base64UrlEncodeBytes(salt),
  };
  final aad = Uint8List.fromList(canonicalJsonBytes(_backupHeader(1, kdf)));
  final cipher = GCMBlockCipher(AESEngine())
    ..init(
      true,
      AEADParameters(
        KeyParameter(_deriveKey(password, salt)),
        128,
        nonce,
        aad,
      ),
    );
  final encrypted = cipher.process(
    Uint8List.fromList(utf8.encode(jsonEncode(privateJwk))),
  );
  final backup = KeyBackup(
    version: _backupVersion,
    kdf: kdf,
    cipher: {
      'name': 'AES-256-GCM',
      'nonce': base64UrlEncodeBytes(nonce),
      'ciphertext': base64UrlEncodeBytes(encrypted),
      'aad': base64UrlEncodeBytes(aad),
    },
  );
  return jsonEncode(backup.toJson());
}

Map<String, String> decryptKeyBackup(String encoded, String password) {
  final backup = KeyBackup.fromJson(
    Map<String, dynamic>.from(jsonDecode(encoded) as Map),
  );
  final salt = base64UrlDecodeBytes(backup.kdf['salt'] as String);
  final nonce = base64UrlDecodeBytes(backup.cipher['nonce'] as String);
  final aad = base64UrlDecodeBytes(backup.cipher['aad'] as String);
  final expectedAad = Uint8List.fromList(
    canonicalJsonBytes(_backupHeader(backup.version, backup.kdf)),
  );
  if (!_sameBytes(aad, expectedAad)) {
    throw FormatException('backup header authentication data mismatch');
  }
  final cipher = GCMBlockCipher(AESEngine())
    ..init(
      false,
      AEADParameters(KeyParameter(_deriveKey(password, salt)), 128, nonce, aad),
    );
  final plain = cipher.process(
    base64UrlDecodeBytes(backup.cipher['ciphertext'] as String),
  );
  final value = jsonDecode(utf8.decode(plain));
  if (value is! Map) throw FormatException('backup does not contain a JWK');
  final jwk = Map<String, String>.from(
    value.map((key, value) => MapEntry(key.toString(), value.toString())),
  );
  if (!jwk.containsKey('d'))
    throw FormatException('backup does not contain a private key');
  validatePrivateJwk(jwk);
  return jwk;
}

bool _sameBytes(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (left[i] != right[i]) return false;
  }
  return true;
}
