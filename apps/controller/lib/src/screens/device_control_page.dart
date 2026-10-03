import 'package:flutter/material.dart';
import 'package:tetherlock_protocol/tetherlock_protocol.dart';

import '../controller/app_controller.dart';
import '../ui/components.dart';
import '../ui/formatters.dart';
import '../models.dart';

class DeviceControlPage extends StatelessWidget {
  const DeviceControlPage({
    super.key,
    required this.controller,
    required this.deviceId,
  });

  final AppController controller;
  final String? deviceId;

  @override
  Widget build(BuildContext context) {
    final device = deviceId == null ? null : controller.deviceById(deviceId!);
    if (device == null) {
      return const Center(
          child: Padding(
              padding: EdgeInsets.all(24),
              child: EmptyState(
                  title: '选择你的设备',
                  message: '从设备列表中选择一台设备，查看状态并开始控制。',
                  icon: Icons.touch_app_outlined)));
    }
    final state = controller.stateFor(device);
    final taskId = state?.taskId;
    final dangerStyle = FilledButton.styleFrom(
        backgroundColor: Theme.of(context).colorScheme.errorContainer,
        foregroundColor: Theme.of(context).colorScheme.onErrorContainer);
    Widget action(
        Operation operation, String label, IconData icon, VoidCallback run) {
      final reason = controller.operationBlocked(device, operation);
      return SizedBox(
          width: 220,
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Tooltip(
                    message: reason ?? label,
                    child: FilledButton.icon(
                        onPressed: reason == null ? run : null,
                        style: operation == Operation.emergencyUnlock
                            ? dangerStyle
                            : null,
                        icon: Icon(icon),
                        label: Text(label))),
                if (reason != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(reason,
                          style: Theme.of(context).textTheme.bodySmall)),
              ]));
    }

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        PageHeader(
            title: device.alias,
            subtitle: device.serial,
            action: StatusBadge(
                label: controller.isOnline(device) ? '设备在线' : '设备离线',
                icon: controller.isOnline(device) ? Icons.wifi : Icons.wifi_off,
                color: controller.isOnline(device)
                    ? null
                    : Theme.of(context).colorScheme.onSurfaceVariant)),
        _StateCard(
          controller: controller,
          device: device,
          state: state,
          onRefresh: () => _refresh(context, device),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                if (state?.controlState == ControlState.constantLocked)
                  action(
                      Operation.unlockConstant,
                      '解锁常锁',
                      Icons.lock_open,
                      () => _run(
                          context, controller.unlockConstant(device, taskId!)))
                else if (state?.controlState == ControlState.fault)
                  action(
                      Operation.retryOperation,
                      '重试故障操作',
                      Icons.refresh,
                      () => _run(
                          context,
                          controller.retryOperation(device, taskId!,
                              operationId: state?.operationId)))
                else if (state?.controlState == ControlState.timedLocked)
                  const Text('定时锁将在到期后自动解除。需要提前开锁时，可使用紧急卡。')
                else if ([
                  ControlState.locking,
                  ControlState.unlocking,
                  ControlState.awaitingConfirmation
                ].contains(state?.controlState))
                  const Text('设备正在处理当前操作，请留意上方状态与确认提示。')
                else ...[
                  action(Operation.startTimedLock, '定时锁', Icons.schedule,
                      () => _timedLock(context, device)),
                  action(
                      Operation.startConstantLock,
                      '常锁',
                      Icons.lock,
                      () =>
                          _run(context, controller.startConstantLock(device))),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
            child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('紧急开锁',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      const Text('使用紧急卡解除定时锁，实际退栓到位后扣卡。'),
                      const SizedBox(height: 16),
                      action(
                          Operation.emergencyUnlock,
                          '使用紧急卡',
                          Icons.warning_amber,
                          () => _confirmEmergency(context, device, state!)),
                    ]))),
        const SizedBox(height: 16),
        Card(
            child: ExpansionTile(
                title: const Text('设备详情'),
                childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                children: [
              Align(
                  alignment: Alignment.centerLeft,
                  child: SelectableText(
                      '序列号 ${device.serial}\n公钥 ${device.fingerprint}\nBroker ${controller.profileById(device.profileId)?.host ?? '未配置'}:${controller.profileById(device.profileId)?.port ?? ''}\n固件 ${state?.firmwareVersion ?? '未知'}\n校时 ${state?.timeCalibrated == true ? '已校时' : '等待校时'}\n电量 未知${state?.deadlineUtc == null ? '' : '\n截止时间 ${DateTime.fromMillisecondsSinceEpoch(state!.deadlineUtc! * 1000).toLocal()}'}',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(fontFamily: 'monospace'))),
            ])),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('最近操作', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (controller.logsFor(device.serial).isEmpty)
                  const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('暂无操作记录')),
                for (final entry in controller.logsFor(device.serial).take(8))
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(operationLabel(entry.operation)),
                    subtitle: Text(
                      '${entry.requestedAt} · ${entry.code ?? ''}',
                    ),
                    trailing: Text(operationStatusLabel(entry.status)),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _timedLock(BuildContext context, AppDevice device) async {
    final now = DateTime.now();
    final option = await showDialog<_TimedLockOption>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('选择定时锁时长'),
        children: [
          _TimedLockChoice(
            label: '1 小时',
            option: _TimedLockOption.oneHour,
          ),
          _TimedLockChoice(
            label: '6 小时',
            option: _TimedLockOption.sixHours,
          ),
          _TimedLockChoice(
            label: '24 小时',
            option: _TimedLockOption.oneDay,
          ),
          _TimedLockChoice(
            label: '7 天',
            option: _TimedLockOption.sevenDays,
          ),
          _TimedLockChoice(
            label: '自定义日期和时间',
            option: _TimedLockOption.custom,
          ),
        ],
      ),
    );
    if (!context.mounted || option == null) return;
    final quickDuration = option.duration;
    if (quickDuration != null) {
      await _run(
          context, controller.startTimedLock(device, now.add(quickDuration)));
      return;
    }
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 3650)),
      initialDate: now.add(const Duration(hours: 1)),
    );
    if (!context.mounted || picked == null) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))),
    );
    if (!context.mounted || time == null) return;
    await _run(
      context,
      controller.startTimedLock(
        device,
        DateTime(picked.year, picked.month, picked.day, time.hour, time.minute),
      ),
    );
  }

  Future<void> _confirmEmergency(
    BuildContext context,
    AppDevice device,
    DeviceState state,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => ProductDialog(
        title: const Text('确认消耗紧急卡？'),
        content: Text(
          '设备：${device.alias}\n当前任务：${state.taskId}\n剩余紧急卡：${state.emergencyRemaining} 张\n只有退栓到位后才会实际扣卡。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认开锁'),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      await _run(context, controller.emergencyUnlock(device, state.taskId!));
    }
  }

  Future<void> _run(BuildContext context, Future<void> operation) async {
    try {
      await operation;
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> _refresh(BuildContext context, AppDevice device) async {
    try {
      await controller.refreshDevice(device);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已重新请求设备状态')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }
}

enum _TimedLockOption {
  oneHour(Duration(hours: 1)),
  sixHours(Duration(hours: 6)),
  oneDay(Duration(days: 1)),
  sevenDays(Duration(days: 7)),
  custom(null);

  const _TimedLockOption(this.duration);

  final Duration? duration;
}

class _TimedLockChoice extends StatelessWidget {
  const _TimedLockChoice({required this.label, required this.option});

  final String label;
  final _TimedLockOption option;

  @override
  Widget build(BuildContext context) => SimpleDialogOption(
        onPressed: () => Navigator.pop(context, option),
        child: Text(label),
      );
}

class _StateCard extends StatelessWidget {
  const _StateCard({
    required this.controller,
    required this.device,
    required this.state,
    required this.onRefresh,
  });

  final AppController controller;
  final AppDevice device;
  final DeviceState? state;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final deviceState = state;
    if (deviceState == null) {
      return Card(
        child: ListTile(
          leading: Icon(Icons.hourglass_empty),
          title: Text('尚未收到设备状态'),
          subtitle: Text('连接 MQTT 后等待设备上报状态。'),
          trailing: IconButton(
            tooltip: '重新获取状态',
            onPressed: onRefresh,
            icon: Icon(Icons.refresh),
          ),
        ),
      );
    }
    final stale = controller.stateIsStale(device);
    final age = controller.stateAge(device);
    final theme = Theme.of(context);
    final fault = deviceState.controlState == ControlState.fault;
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(24),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text('当前锁状态', style: theme.textTheme.bodySmall)),
                IconButton(
                    tooltip: '重新获取状态',
                    onPressed: onRefresh,
                    icon: const Icon(Icons.refresh))
              ]),
              Text(controlStateLabel(deviceState.controlState),
                  style: theme.textTheme.headlineSmall?.copyWith(
                      color: fault
                          ? theme.colorScheme.error
                          : theme.colorScheme.primary)),
              if (deviceState.remainingSeconds != null) ...[
                const SizedBox(height: 24),
                Text(formatRemaining(deviceState.remainingSeconds!),
                    style: theme.textTheme.displaySmall?.copyWith(
                        fontSize: 40,
                        height: 1.2,
                        fontWeight: FontWeight.w500,
                        fontFeatures: const [FontFeature.tabularFigures()],
                        color: theme.colorScheme.onSurface)),
                Text('剩余锁定时间 · 以设备上报为准', style: theme.textTheme.bodySmall),
              ],
              const SizedBox(height: 16),
              StatusBadge(
                  label: stale
                      ? '状态过期${age == null ? '' : '（${age.inSeconds} 秒前）'}'
                      : '状态已更新${age == null ? '' : '（${age.inSeconds} 秒前）'}',
                  icon: stale ? Icons.warning_amber : Icons.sync,
                  color: stale
                      ? theme.colorScheme.error
                      : theme.colorScheme.primary),
              if (deviceState.controlState ==
                  ControlState.awaitingConfirmation) ...[
                const SizedBox(height: 16),
                const Text('设备正在等待本地确认。请先松开按钮，再在盒子上连续长按 10 秒；App 不能代替按钮完成确认。'),
              ],
              if (deviceState.faultCode != null) ...[
                const SizedBox(height: 16),
                Text('故障原因：${deviceState.faultCode}',
                    style: TextStyle(color: theme.colorScheme.error))
              ],
              const Divider(height: 40),
              Wrap(spacing: 24, runSpacing: 20, children: [
                _Metric(
                    label: '盒盖', value: deviceState.lidClosed ? '已合上' : '已打开'),
                _Metric(
                    label: '插销',
                    value: deviceState.retracted && deviceState.extended
                        ? '传感器矛盾'
                        : deviceState.retracted
                            ? '退回'
                            : deviceState.extended
                                ? '伸出'
                                : '未到位 / 位置未知'),
                _Metric(
                    label: '紧急卡',
                    value:
                        '${deviceState.emergencyRemaining}/${deviceState.emergencyTotal}'),
                if (deviceState.confirmationRemainingSeconds != null)
                  _Metric(
                      label: '确认有效期',
                      value: formatRemaining(
                          deviceState.confirmationRemainingSeconds!)),
                if (deviceState.pendingTaskId != null)
                  _Metric(label: '待确认任务', value: deviceState.pendingTaskId!),
              ]),
            ])));
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 120,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            Text(value, style: Theme.of(context).textTheme.titleSmall),
          ],
        ),
      );
}
