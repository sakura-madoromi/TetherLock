import 'dart:convert';

/// RFC 8785-style deterministic JSON for signed protocol payloads.
/// The protocol only accepts JSON values representable by the supported
/// Dart types and rejects non-finite numbers before signing.
String canonicalJson(Object? value) {
  final out = StringBuffer();
  _writeCanonical(out, value);
  return out.toString();
}

List<int> canonicalJsonBytes(Object? value) =>
    utf8.encode(canonicalJson(value));

void _writeCanonical(StringBuffer out, Object? value) {
  if (value == null) {
    out.write('null');
  } else if (value is bool) {
    out.write(value ? 'true' : 'false');
  } else if (value is num) {
    if (value is double && !value.isFinite) {
      throw FormatException('non-finite JSON number');
    }
    // Protocol numbers are integral. Reject fractional values to keep Dart,
    // C++ and firmware JSON encoders byte-identical.
    if (value is double && value.truncateToDouble() != value) {
      throw FormatException('fractional protocol number');
    }
    out.write(value.toInt().toString());
  } else if (value is String) {
    out.write(jsonEncode(value));
  } else if (value is List) {
    out.write('[');
    for (var i = 0; i < value.length; i++) {
      if (i != 0) out.write(',');
      _writeCanonical(out, value[i]);
    }
    out.write(']');
  } else if (value is Map) {
    final keys = value.keys.whereType<String>().toList()..sort();
    if (keys.length != value.length) {
      throw FormatException('object keys must be strings');
    }
    out.write('{');
    for (var i = 0; i < keys.length; i++) {
      if (i != 0) out.write(',');
      final key = keys[i];
      out.write(jsonEncode(key));
      out.write(':');
      _writeCanonical(out, value[key]);
    }
    out.write('}');
  } else {
    throw FormatException('unsupported JSON value ${value.runtimeType}');
  }
}
