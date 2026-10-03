import 'package:flutter/material.dart';

import '../controller/app_controller.dart';
import '../ui/components.dart';
import '../models.dart';

class MqttSettingsPage extends StatelessWidget {
  const MqttSettingsPage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          PageHeader(
              title: '连接设置',
              subtitle: '管理 MQTT 连接与设备通信。',
              action: FilledButton.icon(
                  onPressed: () => _edit(context),
                  icon: const Icon(Icons.add),
                  label: const Text('新增配置'))),
          if (controller.profiles.isEmpty)
            const EmptyState(
                title: '还没有连接配置',
                message: '添加 MQTT Broker 后连接设备。',
                icon: Icons.settings_ethernet),
          Card(
              child: ListTile(
                  title: Text('连接状态：${controller.connectionLabel}'),
                  subtitle: controller.errorMessage == null
                      ? null
                      : Text(controller.errorMessage!),
                  trailing: OutlinedButton(
                      onPressed: () => controller.disconnect(),
                      child: const Text('断开')))),
          for (final profile in controller.profiles)
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Icon(
                                profile.tls
                                    ? Icons.lock_outline
                                    : Icons.settings_ethernet,
                                color: Theme.of(context).colorScheme.primary),
                            const SizedBox(width: 12),
                            Expanded(
                                child: Text(profile.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium)),
                            IconButton(
                                tooltip: '编辑',
                                onPressed: () => _edit(context, profile),
                                icon: const Icon(Icons.edit_outlined))
                          ]),
                          const SizedBox(height: 8),
                          SelectableText('${profile.host}:${profile.port}',
                              style: const TextStyle(fontFamily: 'monospace')),
                          Text(profile.namespace,
                              style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(height: 16),
                          FilledButton(
                              onPressed: () => _connect(context, profile),
                              child: Text(
                                  controller.connectedProfileId == profile.id
                                      ? controller.connectionLabel
                                      : '连接')),
                        ]))),
        ],
      );

  Future<void> _edit(BuildContext context, [MqttProfile? existing]) async {
    final name = TextEditingController(text: existing?.name ?? 'MQTT');
    final host = TextEditingController(text: existing?.host ?? '127.0.0.1');
    final port = TextEditingController(text: '${existing?.port ?? 1883}');
    final namespace = TextEditingController(
      text: existing?.namespace ?? 'tetherlock/v1',
    );
    final username = TextEditingController(text: existing?.username ?? '');
    final password = TextEditingController();
    var tls = existing?.tls ?? false;
    final form = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => ProductDialog(
          title: Text(existing == null ? '新增 MQTT 配置' : '编辑 MQTT 配置'),
          content: Form(
            key: form,
            child: SizedBox(
              width: 480,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: name,
                    decoration: const InputDecoration(labelText: '名称'),
                    validator: _required,
                  ),
                  TextFormField(
                    controller: host,
                    decoration: const InputDecoration(labelText: '地址'),
                    validator: _required,
                  ),
                  TextFormField(
                    controller: port,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: '端口'),
                    validator: _portValidator,
                  ),
                  TextFormField(
                    controller: namespace,
                    decoration: const InputDecoration(labelText: '主题命名空间'),
                    validator: _required,
                  ),
                  TextFormField(
                    controller: username,
                    decoration: const InputDecoration(labelText: '用户名（可选）'),
                  ),
                  TextField(
                    controller: password,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: '密码（留空则保留原密码）',
                    ),
                  ),
                  SwitchListTile(
                    value: tls,
                    onChanged: (value) => setState(() => tls = value),
                    title: const Text('启用 TLS（验证服务器证书）'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () async {
                if (!form.currentState!.validate()) return;
                final profile = MqttProfile(
                  id: existing?.id ??
                      'mqtt-${DateTime.now().microsecondsSinceEpoch}',
                  name: name.text,
                  host: host.text,
                  port: int.parse(port.text),
                  tls: tls,
                  namespace: namespace.text,
                  username: username.text.isEmpty ? null : username.text,
                );
                await controller.saveProfile(
                  profile,
                  password: password.text.isEmpty ? null : password.text,
                );
                if (context.mounted) Navigator.pop(context);
              },
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _connect(BuildContext context, MqttProfile profile) async {
    try {
      await controller.connectProfile(profile.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('MQTT 已连接')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }
}

String? _required(String? value) =>
    value == null || value.trim().isEmpty ? '必填' : null;

String? _portValidator(String? value) {
  if (value == null || value.trim().isEmpty) return '必填';
  final port = int.tryParse(value.trim());
  return port == null || port < 1 || port > 65535 ? '请输入 1 到 65535 的端口' : null;
}
