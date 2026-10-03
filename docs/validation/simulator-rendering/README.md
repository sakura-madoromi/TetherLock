# 模拟器三维渲染验收

截图来自真实 Linux Tauri / WebKitGTK 应用、Rust 物理模型与 37 个 CAD 部件，窗口为 1440×900。

| 场景 | 浅色 | 深色 |
| --- | --- | --- |
| 盖板关闭 | [查看](../../../assets/evidence/validation/simulator-rendering/closed-light.png) | [查看](../../../assets/evidence/validation/simulator-rendering/closed-dark.png) |
| 盖板打开 | [查看](../../../assets/evidence/validation/simulator-rendering/open-light.png) | [查看](../../../assets/evidence/validation/simulator-rendering/open-dark.png) |
| 透明外壳与机构 | — | [查看](../../../assets/evidence/validation/simulator-rendering/mechanism-dark.png) |

本次调整包括本地摄影棚环境反射、三方向照明、ACES 色调映射、塑料 / 金属 / 亚克力材质、曲面法线、结构轮廓和地面阴影。CAD 颜色及几何、实体运动和 MQTT 协议保持原有定义。透明外壳不写入深度、不投射遮挡内部机构的阴影。

相机预设和「适配视图」覆盖当前模型包围盒；手动拖动与相机偏好继续保留。静止画面跳过重复绘制，运动时更新阴影，重载释放环境贴图、阴影和网格资源。

## 验证

- Svelte / TypeScript 检查：0 错误、0 警告；Linux debug 与 release 构建通过。
- 前端 8 项测试通过，包括宽窄窗口与不同方向下的完整包围盒取景、材质和 CAD 颜色、既有指针与主题逻辑。
- 实际 WebKit：浅深色、开合、透明机构、640×540 / 1100×720 / 1440×900 适配、连续三次重载、暂停状态保留及恢复运动通过。
- 原生鼠标捕获与移出释放、失焦释放、空格键释放、窗口关闭通过；最后一次操作往返 P95 为 5 ms。
- 性能限制：持续拖动及快速盖板操作的最后一次原生测试帧间隔 P95 为 36 ms，未达到脚本要求的 25 ms，脚本因此返回失败。渲染场景检查通过不代表该压力测试通过。

性能采样只代表本机测试窗口的结果；`metrics.txt` 保留 WebKit 实测值。帧间隔采样来自 requestAnimationFrame，包含跳过绘制的静止帧。

## 重现

在 `apps/simulator` 运行 `npm test` 和 `npm run tauri -- build --debug --no-bundle`。

从仓库根目录启动隔离数据目录的驱动，再运行渲染测试：

```sh
XDG_DATA_HOME=$(mktemp -d /tmp/tetherlock-render.XXXXXX) .tools/bin/tauri-driver --port 4470 --native-port 4471
# 另一个终端
python3 scripts/linux/simulator_render_smoke.py
python3 scripts/linux/tauri_native_input.py
```

测试截图与驱动使用独立配置，不修改日常设备数据。
