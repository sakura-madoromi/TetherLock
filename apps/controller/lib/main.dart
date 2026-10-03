import 'package:flutter/widgets.dart';

import 'src/app.dart';
import 'src/controller/app_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController();
  await controller.initialize();
  runApp(TetherLockApp(controller: controller));
}
