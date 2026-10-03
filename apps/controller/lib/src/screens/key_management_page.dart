import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../controller/app_controller.dart';
import '../ui/components.dart';

class KeyManagementPage extends StatelessWidget {
  const KeyManagementPage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final keys = controller.privateKeys;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        PageHeader(
            title: '密钥管理',
            subtitle: '私钥只进入平台安全存储；设备授权不会随删除本地密钥而改变。',
            action: FilledButton.icon(
                onPressed: () => _generate(context),
                icon: const Icon(Icons.add),
                label: const Text('生成 P-256 密钥'))),
        if (keys.isEmpty)
          const EmptyState(
              title: '没有本地私钥',
              message: '生成密钥，或导入已有备份以授权设备。',
              icon: Icons.key_outlined),
        for (final fingerprint in keys.keys)
          _KeyCard(controller: controller, fingerprint: fingerprint),
        const Divider(height: 32),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            OutlinedButton.icon(
              onPressed: () => _importJwk(context),
              icon: const Icon(Icons.key),
              label: const Text('导入明文 JWK'),
            ),
            OutlinedButton.icon(
              onPressed: () => _importBackup(context),
              icon: const Icon(Icons.file_download),
              label: const Text('导入加密备份'),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _importJwk(BuildContext context) async {
    final text = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => ProductDialog(
        title: const Text('导入明文私钥 JWK'),
        content: TextField(
          controller: text,
          maxLines: 6,
          decoration: const InputDecoration(labelText: '包含 d、x、y 的 JWK JSON'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                final value = jsonDecode(text.text);
                final jwk = Map<String, String>.from(
                  (value as Map).map(
                    (key, value) => MapEntry(key.toString(), value.toString()),
                  ),
                );
                await controller.importKey(jwk);
                if (context.mounted) Navigator.pop(context);
              } catch (error) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('JWK 无效：$error')),
                  );
                }
              }
            },
            child: const Text('导入'),
          ),
        ],
      ),
    );
  }

  Future<void> _generate(BuildContext context) async {
    try {
      final pair = await controller.generateKey();
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => ProductDialog(
          title: const Text('密钥已生成'),
          content: SelectableText(jsonEncode(pair.publicJwk)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('完成'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> _importBackup(BuildContext context) async {
    final text = TextEditingController();
    final password = TextEditingController();
    final form = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (context) => ProductDialog(
        title: const Text('导入加密备份'),
        content: Form(
          key: form,
          child: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: text,
                  maxLines: 5,
                  decoration: const InputDecoration(labelText: '备份 JSON'),
                  validator: (value) =>
                      value == null || value.isEmpty ? '必填' : null,
                ),
                TextFormField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: '备份密码'),
                  validator: (value) =>
                      value == null || value.length < 12 ? '至少 12 个字符' : null,
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
              try {
                await controller.importBackup(text.text, password.text);
                if (context.mounted) Navigator.pop(context);
              } catch (error) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text('备份无效：$error')));
                }
              }
            },
            child: const Text('导入'),
          ),
        ],
      ),
    );
  }
}

class _KeyCard extends StatelessWidget {
  const _KeyCard({required this.controller, required this.fingerprint});

  final AppController controller;
  final String fingerprint;

  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.key, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                  child: Text('本机密钥 ${fingerprint.substring(0, 12)}…',
                      style: Theme.of(context).textTheme.titleMedium))
            ]),
            const SizedBox(height: 12),
            SelectableText(fingerprint,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(fontFamily: 'monospace')),
            const SizedBox(height: 8),
            Text(
                '${controller.devices.where((device) => device.fingerprint == fingerprint).length} 个设备使用'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 4,
              children: [
                IconButton(
                  tooltip: '复制公钥 JWK',
                  onPressed: () {
                    final key = controller.privateKeys[fingerprint];
                    if (key == null) return;
                    final publicJwk = {
                      'kty': key['kty'],
                      'crv': key['crv'],
                      'x': key['x'],
                      'y': key['y'],
                    };
                    Clipboard.setData(
                        ClipboardData(text: jsonEncode(publicJwk)));
                  },
                  icon: const Icon(Icons.content_copy),
                ),
                IconButton(
                  tooltip: '复制公钥指纹',
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: fingerprint)),
                  icon: const Icon(Icons.copy),
                ),
                IconButton(
                  tooltip: '导出加密备份',
                  onPressed: () => _export(context),
                  icon: const Icon(Icons.upload_file),
                ),
                IconButton(
                  tooltip: '删除本地私钥',
                  onPressed: () => _delete(context),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            )
          ])));

  Future<void> _export(BuildContext context) async {
    final password = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => ProductDialog(
        title: const Text('导出加密备份'),
        content: TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: '密码（至少 12 个字符）'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                final backup =
                    await controller.exportKey(fingerprint, password.text);
                if (context.mounted) Navigator.pop(context, backup);
              } catch (error) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text('$error')));
                }
              }
            },
            child: const Text('导出'),
          ),
        ],
      ),
    );
    if (result != null && context.mounted) {
      await Clipboard.setData(ClipboardData(text: result));
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('加密备份已复制到剪贴板')));
      }
    }
  }

  Future<void> _delete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => ProductDialog(
        title: const Text('删除本地私钥？'),
        content: const Text('设备授权不会改变，也没有服务器恢复功能。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok == true) await controller.deleteKey(fingerprint);
  }
}
