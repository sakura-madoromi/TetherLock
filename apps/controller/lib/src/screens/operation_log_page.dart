import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../controller/app_controller.dart';
import '../ui/components.dart';
import '../models.dart';

class OperationLogPage extends StatelessWidget {
  const OperationLogPage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          PageHeader(
              title: '操作记录',
              subtitle: '保留最近 1,000 条操作，不记录私钥或连接密码。',
              action: OutlinedButton.icon(
                  onPressed: () => _export(context),
                  icon: const Icon(Icons.download),
                  label: const Text('导出 JSON'))),
          if (controller.logs.isEmpty)
            const EmptyState(
                title: '暂无记录', message: '设备操作及其结果将在这里显示。', icon: Icons.history),
          for (final entry in controller.logs.reversed)
            Card(
              child: ListTile(
                leading: Icon(_icon(entry.status),
                    color: entry.status == OperationStatus.success
                        ? Theme.of(context).colorScheme.primary
                        : [OperationStatus.failed, OperationStatus.rejected]
                                .contains(entry.status)
                            ? Theme.of(context).colorScheme.error
                            : Theme.of(context).colorScheme.onSurfaceVariant),
                title: Text(
                  '${operationLabel(entry.operation)} · ${entry.deviceSerial}',
                ),
                subtitle: Text(
                  '${entry.requestedAt.toLocal()}\n${operationStatusLabel(entry.status)}${entry.code == null ? '' : ' · ${entry.code}'}',
                ),
                isThreeLine: true,
              ),
            ),
        ],
      );

  Future<void> _export(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: await controller.exportLogs()));
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('操作记录 JSON 已复制')));
    }
  }

  IconData _icon(OperationStatus status) => switch (status) {
        OperationStatus.success => Icons.check_circle,
        OperationStatus.rejected => Icons.block,
        OperationStatus.failed => Icons.error,
        OperationStatus.unknown => Icons.help,
        OperationStatus.waitingConfirmation => Icons.touch_app,
        _ => Icons.pending,
      };
}
