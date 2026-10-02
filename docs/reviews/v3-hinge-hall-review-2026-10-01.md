# V3 铰链端盖与霍尔检查独立审查

当前版本无未解决的严重或重要名义几何问题。审查过程发现并修复：端盖铜螺母座侧壁较薄、霍尔实测验收未要求扫描至首次阻滞、0.3°/0.4°锁扣边界缺少回归断言、窗铜螺母试块打印方向与盖不一致。

最终几何证据：端壁1.5mm，两端名义轴向间隙各0.5；Ø2钢销在Ø2.4孔内最大名义前向游隙0.2时仍与端盖脚留0.2mm；连续钢销抽出包络无实体阻碍；先向前滑出再抬起端盖可拆，直接上提会被开启的盖子挡住。两端盖为单连通封闭网格，4mm螺丝刀通道清晰。打印预孔与热装名义状态的差异仅在十个铜螺母孔内。

端盖座最小侧壁1.375mm，电池螺母座径向侧壁1.375mm，窗承座上方1.1mm。新增对应试块供热装深度、裂纹与保持力试验。这里未做力学/拉脱实测。

霍尔候选的3.3V兼容性根据厂家数据表核对，真实磁触发/释放尚未测量；锁扣0.4°已有干涉，因此霍尔接近信号不能自动当作锁扣已对准。台架草图仅串口记录，无电机驱动。

详细独立审查及可复跑OpenSCAD探针：[review.md](v3-hinge-hall-evidence/review.md)、[results.json](v3-hinge-hall-evidence/results.json)、[recheck-results.json](v3-hinge-hall-evidence/recheck-results.json)、[detail-results.json](v3-hinge-hall-evidence/detail-results.json)。代码版本指纹：[source-sha256.json](v3-hinge-hall-evidence/source-sha256.json)。
