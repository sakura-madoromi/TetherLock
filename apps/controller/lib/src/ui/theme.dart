import 'package:flutter/material.dart';

/// Shared semantic colors; mirrored by the simulator's tokens.css.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors(
      {required this.success, required this.warning, required this.muted});
  final Color success, warning, muted;
  @override
  StatusColors copyWith({Color? success, Color? warning, Color? muted}) =>
      StatusColors(
          success: success ?? this.success,
          warning: warning ?? this.warning,
          muted: muted ?? this.muted);
  @override
  StatusColors lerp(StatusColors? other, double t) => other == null
      ? this
      : StatusColors(
          success: Color.lerp(success, other.success, t)!,
          warning: Color.lerp(warning, other.warning, t)!,
          muted: Color.lerp(muted, other.muted, t)!);
}

ThemeData productTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final background = Color(dark ? 0xff171c1a : 0xfff7f6f2);
  final surface = Color(dark ? 0xff222925 : 0xffffffff);
  final ink = Color(dark ? 0xffeef2ed : 0xff242925);
  final primary = Color(dark ? 0xff8cd5bd : 0xff246b5a);
  final border = Color(dark ? 0xff424d46 : 0xffd9dfd9);
  final muted = Color(dark ? 0xffafbdb3 : 0xff637168);
  final scheme =
      ColorScheme.fromSeed(seedColor: primary, brightness: brightness).copyWith(
    primary: primary,
    onPrimary: dark ? const Color(0xff123c2f) : Colors.white,
    surface: surface,
    onSurface: ink,
    onSurfaceVariant: muted,
    outline: muted,
    outlineVariant: border,
    primaryContainer: Color(dark ? 0xff2e483d : 0xffe6f1eb),
    onPrimaryContainer: ink,
    secondaryContainer: Color(dark ? 0xff2e483d : 0xffe6f1eb),
    error: Color(dark ? 0xffffb4ab : 0xffb13e36),
    errorContainer: Color(dark ? 0xff482822 : 0xfffcebe7),
    onErrorContainer: Color(dark ? 0xffffb4ab : 0xff922d27),
  );
  final base = ThemeData(
      useMaterial3: true, colorScheme: scheme, brightness: brightness);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
  final button = ButtonStyle(
    minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
    padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 18, vertical: 12)),
    shape: WidgetStatePropertyAll(shape),
  );
  return base.copyWith(
    scaffoldBackgroundColor: background,
    extensions: [
      StatusColors(
          success: primary,
          warning: Color(dark ? 0xffefc477 : 0xff8b5a14),
          muted: muted)
    ],
    textTheme: base.textTheme
        .copyWith(
      headlineSmall: TextStyle(
          fontSize: 28, height: 1.25, fontWeight: FontWeight.w600, color: ink),
      titleMedium: TextStyle(
          fontSize: 18, height: 1.4, fontWeight: FontWeight.w600, color: ink),
      bodyMedium: TextStyle(fontSize: 14, height: 1.6, color: ink),
      bodySmall: TextStyle(fontSize: 12, height: 1.5, color: muted),
    )
        .apply(fontFamily: 'Roboto', fontFamilyFallback: const [
      'Noto Sans CJK SC',
      'Segoe UI',
      'sans-serif'
    ]),
    appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
            color: ink,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            fontFamily: 'Roboto',
            fontFamilyFallback: const [
              'Noto Sans CJK SC',
              'Segoe UI',
              'sans-serif'
            ])),
    cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: border))),
    inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        contentPadding: const EdgeInsets.all(16),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: border)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: border))),
    filledButtonTheme: FilledButtonThemeData(style: button),
    outlinedButtonTheme: OutlinedButtonThemeData(style: button),
    textButtonTheme: TextButtonThemeData(style: button),
    iconButtonTheme: const IconButtonThemeData(
        style: ButtonStyle(minimumSize: WidgetStatePropertyAll(Size(48, 48)))),
    navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: scheme.primaryContainer,
        height: 80,
        elevation: 0),
    navigationRailTheme: NavigationRailThemeData(
        backgroundColor: background,
        indicatorColor: scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: primary)),
    dividerTheme: DividerThemeData(color: border, thickness: 1),
    chipTheme: base.chipTheme.copyWith(
        side: BorderSide.none,
        shape: const StadiumBorder(),
        backgroundColor: scheme.primaryContainer),
    dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
    listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 20, vertical: 8)),
    tooltipTheme:
        const TooltipThemeData(waitDuration: Duration(milliseconds: 400)),
  );
}
