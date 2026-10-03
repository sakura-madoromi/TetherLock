/// Formats device-reported seconds without advancing time in the UI.
String formatRemaining(int seconds) {
  final duration = Duration(seconds: seconds < 0 ? 0 : seconds);
  final hours = duration.inHours.remainder(24).toString().padLeft(2, '0');
  final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
  final remainder = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
  return duration.inDays > 0
      ? '${duration.inDays} 天 $hours 时'
      : '$hours:$minutes:$remainder';
}
