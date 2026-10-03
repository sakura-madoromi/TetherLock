import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

import '../controller/app_controller.dart';
import '../ui/components.dart';
import '../ui/formatters.dart';
import '../models.dart';

class DeviceListPage extends StatelessWidget {
  const DeviceListPage({
    super.key,
    required this.controller,
    required this.selectedDeviceId,
    required this.onSelect,
    this.compact = false,
  });

  final AppController controller;
  final String? selectedDeviceId;
  final ValueChanged<String> onSelect;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final devices = controller.devices;
    return ListView(
      padding: EdgeInsets.all(compact ? 12 : 24),
      children: [
        if (controller.errorMessage != null)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(controller.errorMessage!),
            ),
          ),
        PageHeader(
          title: '设备列表',
          subtitle: compact ? null : '你的设备，随时掌握。',
          action: compact
              ? IconButton(
                  tooltip: '添加设备',
                  onPressed: () => _showAddDevice(context),
                  icon: const Icon(Icons.add))
              : FilledButton.icon(
                  onPressed: () => _showAddDevice(context),
                  icon: const Icon(Icons.add),
                  label: const Text('添加设备')),
        ),
        if (devices.isEmpty)
          const EmptyState(
              title: '还没有设备',
              message: '添加序列号并选择本机授权密钥后开始控制。',
              icon: Icons.devices_outlined),
        for (final device in devices)
          _DeviceTile(
            controller: controller,
            device: device,
            selected: device.id == selectedDeviceId,
            onSelect: () => onSelect(device.id),
          ),
      ],
    );
  }

  Future<void> _showAddDevice(BuildContext context) async {
    final alias = TextEditingController();
    final serial = TextEditingController();
    final publicKeyText = TextEditingController();
    const manualKey = 'manual';
    var selectedKey = controller.privateKeys.keys.firstOrNull;
    Map<String, String> selectedPublicKey() {
      if (selectedKey == manualKey) {
        final decoded = jsonDecode(publicKeyText.text);
        return Map<String, String>.from(decoded as Map);
      }
      final key = controller.privateKeys[selectedKey];
      if (key == null) throw StateError('所选本机密钥不存在，请重新选择');
      return {
        for (final field in ['kty', 'crv', 'x', 'y']) field: key[field]!
      };
    }

    var selectedProfile =
        controller.profiles.isEmpty ? null : controller.profiles.first;
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => ProductDialog(
          title: const Text('添加设备'),
          content: Form(
            key: formKey,
            child: SizedBox(
              width: 440,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: alias,
                      decoration: const InputDecoration(labelText: '设备别名'),
                      validator: _required,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: serial,
                      decoration: const InputDecoration(labelText: '序列号'),
                      validator: _required,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedProfile?.id,
                      decoration: const InputDecoration(labelText: 'MQTT 配置'),
                      items: [
                        for (final profile in controller.profiles)
                          DropdownMenuItem(
                            value: profile.id,
                            child: Text(profile.name),
                          ),
                      ],
                      onChanged: (id) => setState(
                        () =>
                            selectedProfile = controller.profileById(id ?? ''),
                      ),
                      validator: (_) =>
                          selectedProfile == null ? '请先配置 MQTT' : null,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedKey,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: '授权公钥'),
                      hint: const Text('选择本机密钥'),
                      items: [
                        for (final id in controller.privateKeys.keys)
                          DropdownMenuItem(
                            value: id,
                            child: Tooltip(
                              message: id,
                              child: Text('本机密钥 ${id.substring(0, 16)}…',
                                  overflow: TextOverflow.ellipsis),
                            ),
                          ),
                        const DropdownMenuItem(
                          value: manualKey,
                          child: Text('手动粘贴公钥'),
                        ),
                      ],
                      onChanged: (value) => setState(() => selectedKey = value),
                      validator: (_) => selectedKey == null ? '请选择授权密钥' : null,
                    ),
                    if (controller.privateKeys.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text('本机还没有私钥，请先到「密钥」页面生成或导入。'),
                      ),
                    if (selectedKey == manualKey)
                      TextFormField(
                        controller: publicKeyText,
                        maxLines: 4,
                        decoration:
                            const InputDecoration(labelText: '授权公钥 JWK JSON'),
                        validator: _required,
                      )
                    else if (selectedKey != null) ...[
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text('使用所选本机私钥对应的公钥。模拟器需配置相同公钥。'),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.copy),
                        label: const Text('复制所选公钥'),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(
                            text: jsonEncode(selectedPublicKey()),
                          ));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('公钥已复制，可粘贴到模拟器')),
                            );
                          }
                        },
                      ),
                    ],
                  ],
                ),
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
                if (!formKey.currentState!.validate() ||
                    selectedProfile == null) {
                  return;
                }
                try {
                  final jwk = selectedPublicKey();
                  validatePublicJwk(jwk);
                  await controller.addDevice(
                    AppDevice(
                      id: '${serial.text}-${DateTime.now().microsecondsSinceEpoch}',
                      alias: alias.text,
                      serial: serial.text,
                      profileId: selectedProfile!.id,
                      publicJwk: jwk,
                    ),
                  );
                  if (context.mounted) Navigator.pop(context);
                } catch (error) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('公钥无效：$error')),
                    );
                  }
                }
              },
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
  }
}

String? _required(String? value) =>
    value == null || value.trim().isEmpty ? '必填' : null;

class _DeviceTile extends StatelessWidget {
  const _DeviceTile({
    required this.controller,
    required this.device,
    required this.selected,
    required this.onSelect,
  });

  final AppController controller;
  final AppDevice device;
  final bool selected;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final state = controller.stateFor(device);
    final isOnline = controller.isOnline(device);
    final stale = controller.stateIsStale(device);
    final profile = controller.profileById(device.profileId);
    final tone = isOnline
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
      child: ListTile(
        onTap: onSelect,
        leading: Icon(Icons.lock_outline, color: tone),
        title: Text(device.alias,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Padding(
            padding: const EdgeInsets.only(top: 8),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                  '${isOnline ? '在线' : '离线'} · ${state == null ? '等待状态' : controlStateLabel(state.controlState)}',
                  style: TextStyle(color: tone)),
              if (state?.remainingSeconds != null)
                Text('剩余 ${formatRemaining(state!.remainingSeconds!)}'),
              if (state != null)
                Text('紧急卡 ${state.emergencyRemaining}/${state.emergencyTotal}'),
              if (stale)
                Text('状态过期',
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 4),
              Text('${device.serial} · ${profile?.name ?? '未配置 MQTT'}',
                  style: Theme.of(context).textTheme.bodySmall),
            ])),
        trailing: PopupMenuButton<String>(
          onSelected: (value) async {
            if (value == 'edit') {
              await _editDeviceAlias(context, controller, device);
            }
            if (value == 'remove') await controller.removeDevice(device.id);
          },
          itemBuilder: (context) => const [
            PopupMenuItem(value: 'edit', child: Text('编辑设备别名')),
            PopupMenuItem(value: 'remove', child: Text('移除本地记录')),
          ],
        ),
      ),
    );
  }
}

Future<void> _editDeviceAlias(
  BuildContext context,
  AppController controller,
  AppDevice device,
) async {
  final alias = TextEditingController(text: device.alias);
  final formKey = GlobalKey<FormState>();
  await showDialog<void>(
    context: context,
    builder: (context) => ProductDialog(
      title: const Text('编辑设备别名'),
      content: Form(
        key: formKey,
        child: TextFormField(
          controller: alias,
          autofocus: true,
          decoration: const InputDecoration(labelText: '设备别名'),
          validator: _required,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () async {
            if (!formKey.currentState!.validate()) return;
            try {
              await controller.addDevice(
                device.copyWith(alias: alias.text.trim()),
              );
              if (context.mounted) Navigator.pop(context);
            } catch (error) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('保存失败：$error')),
                );
              }
            }
          },
          child: const Text('保存'),
        ),
      ],
    ),
  );
}
