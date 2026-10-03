import 'package:flutter/material.dart';

class PageHeader extends StatelessWidget {
  const PageHeader(
      {super.key, required this.title, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: LayoutBuilder(builder: (context, constraints) {
          final heading =
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(subtitle!, style: Theme.of(context).textTheme.bodySmall)
            ],
          ]);
          if (constraints.maxWidth < 480 && action is! IconButton) {
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  heading,
                  if (action != null) ...[const SizedBox(height: 16), action!]
                ]);
          }
          return Row(children: [
            Expanded(child: heading),
            if (action != null) ...[const SizedBox(width: 16), action!]
          ]);
        }),
      );
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(
      {super.key, required this.label, required this.icon, this.color});
  final String label;
  final IconData icon;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final tone = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
          color: tone.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(24)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: tone),
        const SizedBox(width: 8),
        Flexible(
            child: Text(label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: tone, fontSize: 12, fontWeight: FontWeight.w600)))
      ]),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(
      {super.key,
      required this.title,
      required this.message,
      required this.icon});
  final String title, message;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Card(
          child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 40, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall)
        ]),
      ));
}

/// A scrollable full-screen form on phones, a bounded dialog on desktops.
class ProductDialog extends StatelessWidget {
  const ProductDialog(
      {super.key, required this.title, this.content, this.actions = const []});
  final Widget title;
  final Widget? content;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) {
    if (MediaQuery.sizeOf(context).width >= 600) {
      return AlertDialog(
        title: title,
        content:
            SizedBox(width: 520, child: SingleChildScrollView(child: content)),
        actions: actions,
        scrollable: true,
      );
    }
    return Dialog.fullscreen(
        child: Scaffold(
      appBar: AppBar(
          title: title,
          leading: IconButton(
              tooltip: '关闭',
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(context))),
      body: SafeArea(
          child: Column(children: [
        Expanded(
            child: SingleChildScrollView(
                padding: const EdgeInsets.all(24), child: content)),
        Padding(
            padding: const EdgeInsets.all(16),
            child: OverflowBar(
                spacing: 12, overflowSpacing: 8, children: actions)),
      ])),
    ));
  }
}
