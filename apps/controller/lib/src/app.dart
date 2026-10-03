import 'package:flutter/material.dart';

import 'controller/app_controller.dart';
import 'screens/device_control_page.dart';
import 'screens/device_list_page.dart';
import 'screens/key_management_page.dart';
import 'screens/mqtt_settings_page.dart';
import 'screens/operation_log_page.dart';
import 'ui/components.dart';
import 'ui/theme.dart';

class TetherLockApp extends StatelessWidget {
  const TetherLockApp({super.key, required this.controller});
  final AppController controller;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: controller,
        builder: (context, _) => MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'TetherLock',
          theme: productTheme(Brightness.light),
          darkTheme: productTheme(Brightness.dark),
          themeMode: switch (controller.themePreference) {
            'light' => ThemeMode.light,
            'dark' => ThemeMode.dark,
            _ => ThemeMode.system
          },
          themeAnimationDuration:
              (MediaQuery.maybeOf(context)?.disableAnimations ??
                      WidgetsBinding.instance.platformDispatcher
                          .accessibilityFeatures.disableAnimations)
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
          home: HomeShell(controller: controller),
        ),
      );
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.controller});
  final AppController controller;
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  String? _selectedDeviceId;
  static const destinations = [
    NavigationDestination(
        icon: Icon(Icons.devices_outlined),
        selectedIcon: Icon(Icons.devices),
        label: '设备'),
    NavigationDestination(
        icon: Icon(Icons.key_outlined),
        selectedIcon: Icon(Icons.key),
        label: '密钥'),
    NavigationDestination(icon: Icon(Icons.settings_ethernet), label: '连接'),
    NavigationDestination(icon: Icon(Icons.history), label: '记录'),
  ];

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    if (_selectedDeviceId != null &&
        controller.deviceById(_selectedDeviceId!) == null) {
      _selectedDeviceId = null;
    }
    return LayoutBuilder(builder: (context, constraints) {
      final desktop = constraints.maxWidth >= 800;
      final workspace = constraints.maxWidth >= 1100;
      final list = DeviceListPage(
          controller: controller,
          selectedDeviceId: _selectedDeviceId,
          compact: workspace,
          onSelect: (id) => setState(() => _selectedDeviceId = id));
      final control = DeviceControlPage(
          controller: controller, deviceId: _selectedDeviceId);
      final devices = workspace
          ? Row(children: [
              SizedBox(width: 280, child: list),
              const VerticalDivider(width: 1),
              Expanded(child: control)
            ])
          : _selectedDeviceId == null
              ? list
              : Column(children: [
                  Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: TextButton.icon(
                              onPressed: () =>
                                  setState(() => _selectedDeviceId = null),
                              icon: const Icon(Icons.arrow_back),
                              label: const Text('返回设备列表')))),
                  Expanded(child: control),
                ]);
      final pages = [
        devices,
        KeyManagementPage(controller: controller),
        MqttSettingsPage(controller: controller),
        OperationLogPage(controller: controller)
      ];
      return PopScope(
          canPop: workspace || _index != 0 || _selectedDeviceId == null,
          onPopInvokedWithResult: (didPop, result) {
            if (!didPop) setState(() => _selectedDeviceId = null);
          },
          child: Scaffold(
            appBar: AppBar(title: const Text('TetherLock'), actions: [
              Center(
                  child: StatusBadge(
                      label: controller.connectionLabel,
                      icon: Icons.cloud_outlined,
                      color: controller.connectionLabel == '已连接'
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.onSurfaceVariant)),
              PopupMenuButton<String>(
                tooltip: '外观主题',
                icon: const Icon(Icons.contrast),
                initialValue: controller.themePreference,
                onSelected: (value) async {
                  try {
                    await controller.setThemePreference(value);
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('外观偏好保存失败：$error')));
                    }
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'system', child: Text('跟随系统')),
                  PopupMenuItem(value: 'light', child: Text('浅色')),
                  PopupMenuItem(value: 'dark', child: Text('深色'))
                ],
              ),
              const SizedBox(width: 8),
            ]),
            body: SafeArea(
                child: Row(children: [
              if (desktop)
                NavigationRail(
                    selectedIndex: _index,
                    onDestinationSelected: (index) =>
                        setState(() => _index = index),
                    labelType: NavigationRailLabelType.all,
                    destinations: destinations
                        .map((item) => NavigationRailDestination(
                            icon: item.icon,
                            selectedIcon: item.selectedIcon ?? item.icon,
                            label: Text(item.label)))
                        .toList()),
              Expanded(
                  child: Align(
                      alignment: Alignment.topCenter,
                      child: ConstrainedBox(
                          constraints: BoxConstraints(
                              maxWidth: _index == 0 ? double.infinity : 1000),
                          child: pages[_index]))),
            ])),
            bottomNavigationBar: desktop
                ? null
                : NavigationBar(
                    selectedIndex: _index,
                    onDestinationSelected: (index) =>
                        setState(() => _index = index),
                    destinations: destinations),
          ));
    });
  }
}
