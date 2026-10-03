import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import 'canonical_json.dart';
import 'models.dart';

const protocolVersion = 1;
const signatureAlgorithm = 'ECDSA-P256-SHA256-RAW-LOW-S';
final _commandDomain = utf8.encode('TetherLock/v1/command\u0000');
final _p256Prime = BigInt.parse(
  'ffffffff00000001000000000000000000000000ffffffffffffffffffffffff',
  radix: 16,
);
final _p256B = BigInt.parse(
  '5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b',
  radix: 16,
);

String base64UrlEncodeBytes(List<int> bytes) =>
    base64Url.encode(bytes).replaceAll('=', '');

Uint8List base64UrlDecodeBytes(String value) {
  final normalized = value.padRight((value.length + 3) ~/ 4 * 4, '=');
  try {
    return Uint8List.fromList(base64Url.decode(normalized));
  } catch (_) {
    throw FormatException('invalid base64url');
  }
}

Uint8List _bigIntBytes(BigInt value, int length) {
  final out = Uint8List(length);
  var v = value;
  for (var i = length - 1; i >= 0; i--) {
    out[i] = (v & BigInt.from(255)).toInt();
    v >>= 8;
  }
  if (v != BigInt.zero) throw StateError('integer does not fit');
  return out;
}

BigInt _bytesBigInt(List<int> bytes) {
  var value = BigInt.zero;
  for (final byte in bytes) value = (value << 8) | BigInt.from(byte);
  return value;
}

FortunaRandom _secureRandom() {
  final random = FortunaRandom();
  final seed = Uint8List(32);
  final source = math.Random.secure();
  for (var i = 0; i < seed.length; i++) seed[i] = source.nextInt(256);
  random.seed(KeyParameter(seed));
  return random;
}

class TetherKeyPair {
  const TetherKeyPair({required this.privateJwk, required this.publicJwk});

  final Map<String, String> privateJwk;
  final Map<String, String> publicJwk;

  String get fingerprint => publicKeyFingerprint(publicJwk);

  Map<String, String> get exportedPrivateJwk => Map.unmodifiable(privateJwk);
}

TetherKeyPair generateKeyPair() {
  final curve = ECCurve_secp256r1();
  final generator = ECKeyGenerator()
    ..init(
      ParametersWithRandom(ECKeyGeneratorParameters(curve), _secureRandom()),
    );
  final pair = generator.generateKeyPair();
  final privateKey = pair.privateKey as ECPrivateKey;
  final publicKey = pair.publicKey as ECPublicKey;
  final q = publicKey.Q!;
  final x = _bigIntBytes(q.x!.toBigInteger()!, 32);
  final y = _bigIntBytes(q.y!.toBigInteger()!, 32);
  final publicJwk = <String, String>{
    'kty': 'EC',
    'crv': 'P-256',
    'x': base64UrlEncodeBytes(x),
    'y': base64UrlEncodeBytes(y),
  };
  final privateJwk = <String, String>{
    ...publicJwk,
    'd': base64UrlEncodeBytes(_bigIntBytes(privateKey.d!, 32)),
  };
  return TetherKeyPair(privateJwk: privateJwk, publicJwk: publicJwk);
}

void validatePublicJwk(Map<String, String> jwk) {
  if (jwk['kty'] != 'EC' || jwk['crv'] != 'P-256') {
    throw FormatException('only P-256 EC JWK is supported');
  }
  final x = base64UrlDecodeBytes(jwk['x'] ?? '');
  final y = base64UrlDecodeBytes(jwk['y'] ?? '');
  if (x.length != 32 || y.length != 32) {
    throw FormatException('P-256 coordinates must be 32 bytes');
  }
  final xValue = _bytesBigInt(x);
  final yValue = _bytesBigInt(y);
  final onCurve = xValue < _p256Prime &&
      yValue < _p256Prime &&
      (yValue * yValue) % _p256Prime ==
          (xValue * xValue * xValue + (_p256Prime - BigInt.from(3)) * xValue +
                  _p256B) %
              _p256Prime;
  if (!onCurve) {
    throw const FormatException('JWK public point is not on P-256');
  }
  final curve = ECCurve_secp256r1();
  final point = curve.curve.decodePoint(Uint8List.fromList([0x04, ...x, ...y]));
  if (point == null || point.isInfinity) {
    throw const FormatException('JWK public point is not on P-256');
  }
}

void validatePrivateJwk(Map<String, String> jwk) {
  validatePublicJwk(jwk);
  final d = base64UrlDecodeBytes(jwk['d'] ?? '');
  if (d.length != 32) {
    throw FormatException('P-256 private scalar must be 32 bytes');
  }
  final scalar = _bytesBigInt(d);
  final curve = ECCurve_secp256r1();
  if (scalar <= BigInt.zero || scalar >= curve.n) {
    throw const FormatException('P-256 private scalar is out of range');
  }
  final point = curve.G * scalar;
  if (point == null || point.isInfinity) {
    throw const FormatException('P-256 private scalar is invalid');
  }
  final derivedX = _bigIntBytes(point.x!.toBigInteger()!, 32);
  final derivedY = _bigIntBytes(point.y!.toBigInteger()!, 32);
  if (!_sameBytes(derivedX, base64UrlDecodeBytes(jwk['x']!)) ||
      !_sameBytes(derivedY, base64UrlDecodeBytes(jwk['y']!))) {
    throw const FormatException('private scalar does not match public point');
  }
}

String publicKeyFingerprint(Map<String, String> jwk) {
  validatePublicJwk(jwk);
  final bytes = Uint8List.fromList([
    0x04,
    ...base64UrlDecodeBytes(jwk['x']!),
    ...base64UrlDecodeBytes(jwk['y']!),
  ]);
  final digest = SHA256Digest().process(bytes);
  return base64UrlEncodeBytes(digest);
}

ECPrivateKey _privateKey(Map<String, String> jwk) {
  validatePrivateJwk(jwk);
  final curve = ECCurve_secp256r1();
  return ECPrivateKey(_bytesBigInt(base64UrlDecodeBytes(jwk['d']!)), curve);
}

ECPublicKey _publicKey(Map<String, String> jwk) {
  validatePublicJwk(jwk);
  final curve = ECCurve_secp256r1();
  final encoded = Uint8List.fromList([
    0x04,
    ...base64UrlDecodeBytes(jwk['x']!),
    ...base64UrlDecodeBytes(jwk['y']!),
  ]);
  return ECPublicKey(curve.curve.decodePoint(encoded)!, curve);
}

Uint8List _digestFor(List<int> message) =>
    SHA256Digest().process(Uint8List.fromList(message));

bool _sameBytes(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (left[i] != right[i]) return false;
  }
  return true;
}

class ChallengeRegistry {
  final Map<String, int> _entries = <String, int>{};

  void add(Challenge challenge) {
    if (_entries.length >= 8 && !_entries.containsKey(challenge.challenge)) {
      _entries.remove(_entries.keys.first);
    }
    _entries[challenge.challenge] = challenge.expiresAtMonotonicMs;
  }

  bool consume(String challenge, int nowMonotonicMs) {
    _entries.removeWhere((_, expiry) => expiry <= nowMonotonicMs);
    final expiry = _entries.remove(challenge);
    return expiry != null && expiry > nowMonotonicMs;
  }
}

Uint8List signCommandPayload(
  Map<String, dynamic> payload,
  Map<String, String> privateJwk,
) {
  final raw = canonicalJsonBytes(payload);
  final message = Uint8List.fromList([..._commandDomain, ...raw]);
  final signer = ECDSASigner(null, HMac(SHA256Digest(), 64))
    ..init(
      true,
      ParametersWithRandom(
        PrivateKeyParameter(_privateKey(privateJwk)),
        _secureRandom(),
      ),
    );
  final signature =
      signer.generateSignature(_digestFor(message)) as ECSignature;
  final order = ECCurve_secp256r1().n;
  var s = signature.s;
  final half = order >> 1;
  if (s > half) s = order - s;
  return Uint8List.fromList([
    ..._bigIntBytes(signature.r, 32),
    ..._bigIntBytes(s, 32),
  ]);
}

bool verifyCommandPayload(
  Map<String, dynamic> payload,
  List<int> signature,
  Map<String, String> publicJwk,
) {
  return _verifySignatureBytes(
    canonicalJsonBytes(payload),
    signature,
    publicJwk,
  );
}

bool _verifySignatureBytes(
  List<int> rawPayload,
  List<int> signature,
  Map<String, String> publicJwk,
) {
  if (signature.length != 64) return false;
  validatePublicJwk(publicJwk);
  final order = ECCurve_secp256r1().n;
  final r = _bytesBigInt(signature.sublist(0, 32));
  final s = _bytesBigInt(signature.sublist(32));
  if (r <= BigInt.zero || r >= order || s <= BigInt.zero || s > (order >> 1)) {
    return false;
  }
  final verifier = ECDSASigner(null, HMac(SHA256Digest(), 64))
    ..init(false, PublicKeyParameter(_publicKey(publicJwk)));
  final message = Uint8List.fromList([..._commandDomain, ...rawPayload]);
  return verifier.verifySignature(_digestFor(message), ECSignature(r, s));
}

SignedCommand createSignedCommand(
  CommandPayload payload,
  Map<String, String> privateJwk,
) {
  final raw = canonicalJsonBytes(payload.toJson());
  final signature = signCommandPayload(payload.toJson(), privateJwk);
  return SignedCommand(
    protocolVersion: protocolVersion,
    algorithm: signatureAlgorithm,
    payloadBase64Url: base64UrlEncodeBytes(raw),
    signatureBase64Url: base64UrlEncodeBytes(signature),
  );
}

CommandPayload verifyAndDecodeCommand(
  SignedCommand command,
  Map<String, String> publicJwk, {
  ChallengeRegistry? challenges,
  int? nowMonotonicMs,
}) {
  if (command.protocolVersion != protocolVersion ||
      command.algorithm != signatureAlgorithm) {
    throw FormatException('unsupported protocol signature format');
  }
  final raw = base64UrlDecodeBytes(command.payloadBase64Url);
  final signature = base64UrlDecodeBytes(command.signatureBase64Url);
  // Verify the exact bytes received over MQTT before decoding or reserializing
  // JSON. This keeps the signed representation authoritative.
  if (!_verifySignatureBytes(raw, signature, publicJwk)) {
    throw FormatException('signature rejected');
  }
  final rawText = utf8.decode(raw);
  final decoded = jsonDecode(rawText);
  if (decoded is! Map<String, dynamic>)
    throw FormatException('payload is not an object');
  final payload = Map<String, dynamic>.from(decoded);
  if (canonicalJson(payload) != rawText) {
    throw FormatException('payload is not canonical JSON');
  }
  if (challenges != null) {
    final challenge = payload['challenge'];
    if (nowMonotonicMs == null ||
        challenge is! String ||
        !challenges.consume(challenge, nowMonotonicMs)) {
      throw FormatException('challenge missing, expired or already used');
    }
  }
  return CommandPayload.fromJson(payload);
}
