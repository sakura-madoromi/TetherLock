import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

import '../models.dart';

class MqttMessageEvent {
  const MqttMessageEvent(this.topic, this.payload);

  final String topic;
  final String payload;
}

enum AppConnection { disconnected, connecting, connected, reconnecting, failed }

class MqttService {
  final StreamController<AppConnection> _connections =
      StreamController.broadcast();
  AppConnection connection = AppConnection.disconnected;
  Stream<AppConnection> get connections => _connections.stream;
  void _connection(AppConnection value) {
    connection = value;
    _connections.add(value);
  }

  MqttServerClient? _client;
  final StreamController<MqttMessageEvent> _messages =
      StreamController.broadcast();
  final _random = Random.secure();

  Stream<MqttMessageEvent> get messages => _messages.stream;
  bool get connected =>
      _client?.connectionStatus?.state == MqttConnectionState.connected;

  Future<void> connect(MqttProfile profile, {String? password}) async {
    await disconnect();
    _connection(AppConnection.connecting);
    final clientId =
        'tetherlock-app-${DateTime.now().microsecondsSinceEpoch}-${_random.nextInt(1 << 20)}';
    final client =
        MqttServerClient.withPort(profile.host, clientId, profile.port)
          ..secure = profile.tls
          ..keepAlivePeriod = 20
          ..logging(on: false)
          ..autoReconnect = true
          ..resubscribeOnAutoReconnect = true;
    client.onConnected = () => _connection(AppConnection.connected);
    client.onDisconnected = () => _connection(AppConnection.disconnected);
    client.onAutoReconnect = () => _connection(AppConnection.reconnecting);
    client.onAutoReconnected = () => _connection(AppConnection.connected);
    client.connectionMessage =
        MqttConnectMessage().withClientIdentifier(clientId).startClean();
    // No onBadCertificate override is installed: the platform trust store
    // must validate TLS certificates and failures are surfaced to the UI.
    MqttClientConnectionStatus? status;
    try {
      status = await _connectSocket(client, profile.username, password);
    } catch (_) {
      client.disconnect();
      _connection(AppConnection.failed);
      rethrow;
    }
    if (status?.state != MqttConnectionState.connected) {
      final error = client.connectionStatus?.returnCode?.toString() ??
          'unknown_connection_error';
      client.disconnect();
      _connection(AppConnection.failed);
      throw StateError('MQTT 连接失败：$error');
    }
    _client = client;
    _connection(AppConnection.connected);
    client.updates?.listen((messages) {
      for (final message in messages) {
        final publish = message.payload as MqttPublishMessage;
        final payload = MqttPublishPayload.bytesToStringAsString(
          publish.payload.message,
        );
        _messages.add(MqttMessageEvent(message.topic, payload));
      }
    });
  }

  Future<void> disconnect() async {
    final client = _client;
    _client = null;
    if (client != null) client.disconnect();
    _connection(AppConnection.disconnected);
  }

  Future<MqttClientConnectionStatus?> _connectSocket(
      MqttServerClient client, String? username, String? password) {
    final result = Completer<MqttClientConnectionStatus?>();
    final parent = Zone.current;
    runZonedGuarded(() async {
      try {
        result.complete(await client.connect(username, password));
      } catch (error, stack) {
        if (!result.isCompleted) result.completeError(error, stack);
      }
    }, (error, stack) {
      // mqtt_client's socket sink may emit a write error outside its read
      // listener when the broker closes between a QoS publication and ACK.
      if (error is SocketException) {
        if (!result.isCompleted) {
          result.completeError(error, stack);
        } else if (identical(_client, client)) {
          _connection(AppConnection.reconnecting);
          client.doAutoReconnect(force: true);
        }
      } else {
        parent.handleUncaughtError(error, stack);
      }
    });
    return result.future;
  }

  Future<void> subscribe(TetherTopics topics) async {
    final client = _requireClient();
    for (final topic in [
      topics.challengeResponse,
      topics.result,
      topics.state,
      topics.availability,
    ]) {
      client.subscribe(topic, MqttQos.atLeastOnce);
    }
  }

  Future<void> publishJson(
    String topic,
    Object value, {
    bool retain = false,
  }) async {
    final client = _requireClient();
    final encoded = jsonEncode(value);
    if (utf8.encode(encoded).length > 4096) {
      throw StateError('控制报文超过 4 KiB');
    }
    final builder = MqttClientPayloadBuilder()..addUTF8String(encoded);
    client.publishMessage(
      topic,
      MqttQos.atLeastOnce,
      builder.payload!,
      retain: retain,
    );
  }

  MqttServerClient _requireClient() {
    final client = _client;
    if (client == null || !connected) throw StateError('MQTT 尚未连接');
    return client;
  }

  void dispose() {
    _client?.disconnect();
    _messages.close();
    _connections.close();
  }
}
