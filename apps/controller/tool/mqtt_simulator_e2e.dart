import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:tetherlock_protocol/tetherlock_protocol.dart';
import 'package:tetherlock/src/models.dart';
import 'package:tetherlock/src/services/mqtt_service.dart';

void check(bool condition, String message) {
  if (!condition) throw StateError(message);
}

class Inbox {
  Inbox(MqttService service) {
    subscription = service.messages.listen((event) {
      events.add(event);
      changed.add(null);
    });
  }
  final List<MqttMessageEvent> events = [];
  final changed = StreamController<void>.broadcast();
  late final StreamSubscription<MqttMessageEvent> subscription;
  Future<Map<String, dynamic>> wait(
      String topic, bool Function(Map<String, dynamic>) predicate,
      {int after = 0}) async {
    Map<String, dynamic>? find() {
      for (final event in events.skip(after)) {
        if (event.topic != topic) continue;
        try {
          final value =
              Map<String, dynamic>.from(jsonDecode(event.payload) as Map);
          if (predicate(value)) return value;
        } catch (_) {}
      }
      return null;
    }

    final found = find();
    if (found != null) return found;
    await changed.stream.firstWhere((_) => find() != null).timeout(
        const Duration(seconds: 15),
        onTimeout: () => throw TimeoutException(
            'MQTT wait $topic; recent ${events.skip(after).map((e) => '${e.topic} ${e.payload}').join('\n')}'));
    return find()!;
  }

  Future<void> close() async {
    await subscription.cancel();
    await changed.close();
  }
}

Future<void> main() async {
  final webdriverSession = Platform.environment['TETHERLOCK_TAURI_SESSION'];
  final webdriverUrl = Platform.environment['TETHERLOCK_TAURI_DRIVER'] ??
      'http://127.0.0.1:4464';
  Future<dynamic> tauri(String command,
      [Map<String, dynamic> arguments = const {}]) async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(
          Uri.parse('$webdriverUrl/session/$webdriverSession/execute/async'));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({
        'script': command == 'connect'
            ? r"""
const done=arguments[arguments.length-1], config=arguments[1].config;
const fill=(label,value)=>{
 const node=[...document.querySelectorAll('label')].find(n=>n.textContent.trim()===label)?.querySelector('input,textarea');
 if(!node)throw Error('missing pairing field '+label);
 if(node.type==='checkbox'){node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));}
 else {node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));}
};
try {
 document.querySelector('#tab-connection')?.click();
 fill('序列号',config.serial);fill('Broker',config.broker_host);fill('端口',config.broker_port);
 fill('命名空间',config.namespace);fill('用户名',config.username||'');fill('密码',config.password||'');
 fill('初始紧急卡数',arguments[1].initialCards);fill('TLS',config.tls);
 fill('APP 授权公钥 JWK',JSON.stringify(config.public_jwk));
 [...document.querySelectorAll('button')].find(b=>b.textContent==='保存并连接').click();
 const started=Date.now();
 const poll=()=>window.__TAURI_INTERNALS__.invoke('show_snapshot').then(s=>{
  if(s.state.serial===config.serial && s.mqtt==='connected'){done({ok:true,value:null});return;}
  const error=document.querySelector('.error');if(error){done({ok:false,error:error.textContent});return;}
  if(Date.now()-started>15000){done({ok:false,error:'pairing timed out: '+s.mqtt});return;}
  setTimeout(poll,100);
 }).catch(e=>done({ok:false,error:String(e)}));setTimeout(poll,100);
}catch(e){done({ok:false,error:String(e)});}
"""
            : 'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v})).catch(e=>done({ok:false,error:String(e)}));',
        'args': [command, arguments]
      }));
      final response =
          jsonDecode(await utf8.decoder.bind(await request.close()).join())
              as Map;
      final result = response['value'] as Map;
      check(result['ok'] == true, 'Tauri invocation: $result');
      return result['value'];
    } finally {
      client.close(force: true);
    }
  }

  final pair = generateKeyPair();
  final temp = await Directory.systemTemp.createTemp('tetherlock-rust-e2e-');
  final public = File('${temp.path}/public.json')
    ..writeAsStringSync(jsonEncode(pair.publicJwk));
  final probe = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final port = probe.port;
  await probe.close();
  Process? broker, simulator;
  final service = MqttService(), inbox = <Inbox>[];
  final stdoutLines = StreamController<String>.broadcast();
  var simulatorError = '';
  final subscriptions = <StreamSubscription>[];
  Future<Process> startBroker() async {
    final process = await Process.start('mosquitto', ['-p', '$port']);
    subscriptions.add(process.stdout.listen((_) {}));
    subscriptions.add(process.stderr.listen((_) {}));
    for (var i = 0; i < 50; i++) {
      try {
        final socket = await Socket.connect('127.0.0.1', port);
        socket.destroy();
        return process;
      } catch (_) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }
    throw StateError('broker failed to start');
  }

  try {
    broker = await startBroker();
    if (webdriverSession != null) {
      await tauri('connect', {
        'config': {
          'serial': 'SIM-E2E',
          'broker_host': '127.0.0.1',
          'broker_port': port,
          'namespace': 'tetherlock/v1',
          'tls': false,
          'username': null,
          'password': null,
          'public_jwk': pair.publicJwk
        },
        'initialCards': 3
      });
      await tauri('operate', {
        'action': {'type': 'reset', 'confirmation': 'SIM-E2E'}
      });
      await tauri('operate', {
        'action': {'type': 'pause', 'paused': true}
      });
    } else {
      final ready =
          stdoutLines.stream.firstWhere((line) => line.startsWith('ready '));
      final executable = Platform.script
          .resolve(
              '../../../packages/simulator-core/target/debug/tetherlock-simulator')
          .toFilePath();
      simulator = await Process.start(executable, [
        '--broker-port',
        '$port',
        '--serial',
        'SIM-E2E',
        '--public-jwk',
        public.path,
        '--state-dir',
        '${temp.path}/state',
        '--paused'
      ]);
      subscriptions.add(simulator.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(stdoutLines.add));
      subscriptions.add(simulator.stderr.transform(utf8.decoder).listen((text) {
        simulatorError += text;
      }));
      await ready.timeout(const Duration(seconds: 20),
          onTimeout: () =>
              throw StateError('simulator startup: $simulatorError'));
    }
    final profile = MqttProfile(
        id: 'e2e',
        name: 'E2E',
        host: '127.0.0.1',
        port: port,
        tls: false,
        namespace: 'tetherlock/v1');
    final topics = TetherTopics('SIM-E2E');
    final messages = Inbox(service);
    inbox.add(messages);
    await service.connect(profile);
    await service.subscribe(topics);
    final initial =
        await messages.wait(topics.state, (s) => s['serial'] == 'SIM-E2E');
    final heartbeatAfter = messages.events.length;
    final heartbeat = await messages.wait(
        topics.state, (s) => s['serial'] == 'SIM-E2E',
        after: heartbeatAfter);
    check(heartbeat['revision'] == initial['revision'],
        'paused heartbeat does not alter durable revision');

    Future<Map<String, dynamic>> drive(List<String> commands) async {
      if (webdriverSession != null) {
        for (final command in commands) {
          final words = command.split(' ');
          Map<String, dynamic> action;
          switch (words[0]) {
            case 'time':
              action = {'type': 'time', 'utc': int.parse(words[1])};
            case 'lid':
              action = {'type': 'lid', 'angle': double.parse(words[1])};
            case 'advance':
              action = {'type': 'advance', 'ms': int.parse(words[1])};
            case 'button':
              action = {'type': 'button', 'pressed': words[1] == 'down'};
            case 'jam':
              action = {
                'type': 'faults',
                'jammed': words[1] == 'on',
                'automatic': true,
                'lid': null,
                'retracted': null,
                'extended': null
              };
            default:
              throw StateError('unsupported Tauri test action $command');
          }
          await tauri('operate', {'action': action});
        }
        return Map<String, dynamic>.from(await tauri('show_snapshot') as Map);
      }
      final snapshot =
          stdoutLines.stream.firstWhere((line) => line.startsWith('{'));
      for (final command in commands) {
        simulator!.stdin.writeln(command);
      }
      simulator!.stdin.writeln('show');
      await simulator.stdin.flush();
      final line = await snapshot.timeout(const Duration(seconds: 10));
      return Map<String, dynamic>.from(jsonDecode(line) as Map);
    }

    var count = 0;
    Future<CommandPayload> signed(
        Operation operation, Map<String, dynamic> arguments) async {
      final request = 'request-${count++}', after = messages.events.length;
      await service
          .publishJson(topics.challengeRequest, {'request_id': request});
      final challenge = await messages.wait(
          topics.challengeResponse, (c) => c['request_id'] == request,
          after: after);
      return CommandPayload(
          protocolVersion: 1,
          deviceSerial: 'SIM-E2E',
          commandId: 'operation-$count',
          challenge: challenge['challenge'] as String,
          operation: operation,
          arguments: arguments);
    }

    Future<CommandPayload> send(
        Operation operation, Map<String, dynamic> arguments,
        {String phase = 'accepted'}) async {
      final command = await signed(operation, arguments),
          after = messages.events.length;
      await service.publishJson(topics.command,
          createSignedCommand(command, pair.privateJwk).toJson());
      await messages.wait(topics.result,
          (r) => r['operation_id'] == command.commandId && r['phase'] == phase,
          after: after);
      return command;
    }

    Map<String, dynamic> state(Map<String, dynamic> view) =>
        Map<String, dynamic>.from(view['state'] as Map);
    var view = await drive(['time 1700000000', 'lid 0', 'advance 600']);
    check(state(view)['inputs']['lid_closed'] == true, 'automatic lid sensor');
    final constant = await send(
        Operation.startConstantLock, {'task_id': 'constant-task'},
        phase: 'waiting_confirmation');
    view = await drive(
        ['button down', 'advance 10000', 'button up', 'advance 2000']);
    check(state(view)['control_state'] == 'constant_locked',
        'constant confirmation and automatic extension');
    await messages.wait(
        topics.result,
        (r) =>
            r['operation_id'] == constant.commandId &&
            r['phase'] == 'succeeded');
    await send(Operation.unlockConstant, {'task_id': 'constant-task'});
    view = await drive(['advance 2000']);
    check(
        state(view)['control_state'] == 'idle_retracted' &&
            state(view)['emergency']['remaining'] == 3,
        'normal unlock quota');

    await send(Operation.startTimedLock,
        {'deadline_utc': 1700000100, 'task_id': 'timed-task'});
    view = await drive(['advance 2000']);
    check(
        state(view)['control_state'] == 'timed_locked', 'automatic timed lock');
    final emergency = await send(Operation.emergencyUnlock,
        {'task_id': 'timed-task', 'transaction_id': 'tx'});
    view = await drive(['advance 500', 'jam on', 'advance 15000']);
    check(
        state(view)['control_state'] == 'fault' &&
            state(view)['emergency']['remaining'] == 3 &&
            state(view)['emergency']['reserved'] == true,
        'jam preserves emergency reservation');
    await drive(['jam off']);
    await send(Operation.retryOperation,
        {'task_id': 'timed-task', 'operation_id': emergency.commandId});
    view = await drive(['advance 2000']);
    check(
        state(view)['control_state'] == 'idle_retracted' &&
            state(view)['emergency']['remaining'] == 2,
        'retry consumes one card');

    final now = state(view)['updated_at_utc'] as int;
    await send(Operation.startTimedLock,
        {'deadline_utc': now + 5, 'task_id': 'offline-task'});
    await drive(['advance 2000']);
    broker.kill();
    await broker.exitCode;
    await Future<void>.delayed(const Duration(milliseconds: 250));
    view = await drive(['advance 5000']);
    check(
        state(view)['control_state'] == 'idle_retracted' &&
            state(view)['emergency']['remaining'] == 2,
        'offline expiry completes locally');
    broker = await startBroker();
    await service.connect(profile);
    await service.subscribe(topics);
    final after = messages.events.length;
    final recovered = await messages.wait(
        topics.state, (s) => s['control_state'] == 'idle_retracted',
        after: after);
    check(recovered['emergency']['remaining'] == 2,
        'reconnect publishes current state');

    final invalid =
        await signed(Operation.startConstantLock, {'task_id': 'invalid'});
    final envelope = createSignedCommand(invalid, pair.privateJwk).toJson()
      ..['signature'] = base64UrlEncodeBytes(List.filled(64, 0));
    final rejectAfter = messages.events.length;
    await service.publishJson(topics.command, envelope);
    await messages.wait(topics.result,
        (r) => r['phase'] == 'rejected' && '${r['code']}'.contains('signature'),
        after: rejectAfter);
    view = await drive([]);
    check(state(view)['control_state'] == 'idle_retracted',
        'invalid signature cannot change state');

    Future<void> rejected(Map<String, dynamic> envelope, String reason) async {
      final after = messages.events.length;
      if (utf8.encode(jsonEncode(envelope)).length > 4096) {
        // Bypass the APP's own size guard to exercise the device boundary.
        final published = await Process.run('mosquitto_pub', [
          '-h',
          '127.0.0.1',
          '-p',
          '$port',
          '-q',
          '1',
          '-t',
          topics.command,
          '-m',
          jsonEncode(envelope),
        ]);
        check(published.exitCode == 0,
            'oversize test publication: ${published.stderr}');
      } else {
        await service.publishJson(topics.command, envelope);
      }
      await messages.wait(topics.result,
          (r) => r['phase'] == 'rejected' && '${r['code']}'.contains(reason),
          after: after);
    }

    final valid = await signed(
        Operation.startConstantLock, {'task_id': 'protocol-check'});
    for (final mutation in [
      {'device_serial': 'OTHER'},
      {'protocol_version': 2}
    ]) {
      final wrong = CommandPayload.fromJson({...valid.toJson(), ...mutation});
      await rejected(createSignedCommand(wrong, pair.privateJwk).toJson(),
          'wrong protocol');
    }
    // Identity rejection must not consume the otherwise valid challenge.
    final acceptedAfter = messages.events.length;
    final validEnvelope = createSignedCommand(valid, pair.privateJwk).toJson();
    await service.publishJson(topics.command, validEnvelope);
    await messages.wait(
        topics.result,
        (r) =>
            r['operation_id'] == valid.commandId &&
            r['phase'] == 'waiting_confirmation',
        after: acceptedAfter);
    await rejected(validEnvelope, 'already used');
    await drive(['advance 60001']);
    final expired =
        await signed(Operation.startConstantLock, {'task_id': 'expired'});
    await drive(['advance 60001']);
    await rejected(
        createSignedCommand(expired, pair.privateJwk).toJson(), 'expired');
    final evicted =
        await signed(Operation.startConstantLock, {'task_id': 'evicted'});
    for (var i = 0; i < 8; i++) {
      await signed(Operation.startConstantLock, {'task_id': 'unused-$i'});
    }
    await rejected(
        createSignedCommand(evicted, pair.privateJwk).toJson(), 'missing');
    await rejected({'padding': 'x' * 4097}, '4 KiB');
    view = await drive([]);
    check(state(view)['control_state'] == 'idle_retracted',
        'protocol rejection leaves state idle');
    stdout.writeln(
        'PASS: real MQTT ↔ Rust ${webdriverSession == null ? 'CLI' : 'Tauri/WebKitGTK'} simulator: confirmation, automatic motion, constant unlock, timed lock, jam, emergency retry/quota, offline expiry, broker reconnect, invalid signature, wrong identity/version, challenge replay/expiry/capacity, 4 KiB limit');
  } finally {
    await service.disconnect();
    service.dispose();
    if (webdriverSession != null) await tauri('disconnect');
    simulator?.stdin.writeln('quit');
    await simulator?.exitCode.timeout(const Duration(seconds: 5),
        onTimeout: () {
      simulator?.kill();
      return -1;
    });
    if (broker != null) {
      broker.kill();
      await broker.exitCode;
    }
    for (final box in inbox) {
      await box.close();
    }
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
    await stdoutLines.close();
    await temp.delete(recursive: true);
  }
}
