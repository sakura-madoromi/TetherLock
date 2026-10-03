# 当前：V3-purchased-specs-1

M4×0.7输出55mm、右侧R16按钮及3mm绑带槽已适配名义模型；霍尔/磁铁已取消。机械检测开关尚待选型。详见 `../../docs/design/v3-purchased-specs.md`。

当前 `params.scad` 和上述变更说明是本目录的唯一维护入口；旧版霍尔试块和小板采购说明不属于当前基线。

# TetherLock V3 结构 CAD

打开 `assembly.scad`。单位为 mm / °。模型对应 N20 偏置丝杠、浮动拨指、实心锁栓；闭合整机 240×120×55。天窗为双层同色栅栏：外栅随盖一体打印，`window_grille` 内栅独立平放打印，配合上下软垫夹持1.5 mm亚克力。

详细装配、打印、选型边界见 [结构说明](../../../docs/design/v3-cad.md)，物料见 [V3 BOM](../../../docs/design/v3-bom.csv)。这是结构样机版；硬件包络尚需采购实测。

共享尺寸在 `params.scad`，各文件还包含固定接口坐标；改整机尺寸或硬件位置时需同步相关接口并重跑检查，不能只改一项全局尺寸。

参数入口：

| 参数 | 示例 | 用途 |
|---|---|---|
| `view` | `"assembly"` | 总装 |
| `view` | `"exploded"` | 主要件分解 |
| `view` | `"lock"` | 锁模块 |
| `view`, `part` | `"print"`, `"bolt"` | 打印姿态分件 |
| `travel` | `0` / `14` | 退栓 / 闭锁 |
| `lid_angle` | `0` / `105` | 合盖 / 开盖 |
| `show_hardware` | `false` | 隐藏外购件 |
| `show_fasteners` | `false` | 隐藏紧固件 |

例如：

```sh
openscad -o open.png --viewall --autocenter -D 'lid_angle=105' hardware/v3/cad/assembly.scad
openscad -o bolt.stl -D 'view="print"' -D 'part="bolt"' hardware/v3/cad/assembly.scad
python3 scripts/v3/export_verify.py
```

验证脚本通过 `OPENSCAD` 环境变量调用本机 OpenSCAD。网格工具位于 `scripts/shared/stl_probe.py`。29 种分件 STL 在 `generated/v3/print/`；总装 STL 只用于包络检查，不作为打印文件。

铰链端盖左右不同：`hinge_guard_left/right`，取消独立轴环和紧定螺钉。十处M2铜螺母原型：打印预孔Ø2.9，装配后让位Ø3.25；先试`insert_coupon`。新手销孔和霍尔台架试件也在打印清单内。说明与霍尔待测项见 `docs/design/v3-hinge-hall.md`。
