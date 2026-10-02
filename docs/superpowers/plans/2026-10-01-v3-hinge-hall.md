# V3 铰链端部限位、可拆紧固与霍尔核验实施计划

**Goal:** 保留Ø2×180钢销，取消独立轴环与紧定螺钉；为十处维护连接加入M2铜螺母座；核验合盖检测几何、电气条件与误判边界。
**Architecture:** 两只镜像打印端盖固定于壳内，端壁挡住钢销，两端名义各0.5mm间隙。M2外径3.2长4mm铜螺母为原型包络，预孔2.9mm须试块确认。霍尔使用3.3V非锁存数字开关候选；模型保留6×6×1.8mm小板包络，实际小板需核对。
**Tech Stack:** 参数化OpenSCAD、真实STL布尔检查、Python、Three.js/Vite。
**Spec:** 用户当前授权；docs/design/v3-cad.md 与 v3-window-grille.md。

保持240×120×55mm及185×95×40mm。用户已要求直接实施，不再走 brainstorming。原型电气验证不宣称实测触发；无硬件时交付测试草图/步骤。预算约百元、允许少量超出。

- [x] 新增scripts/v3/verify_hinge_hall.py；先以沿轴±0.7mm平移的销与端盖交集探针证明旧版无端部挡墙，保存失败证据。
- [x] 修改cad/v3/{params,enclosure,hardware,assembly}.scad：端盖左右分件、轴端挡墙与销维修路径；移除collar与M2紧定；十处M2铜螺母包络/安装孔、三类新手试块。
- [x] 以真实几何验证两端止挡/额定间隙、端盖拆卸/钢销插入路径、铜螺母非配合干涉、开盖0～105°、霍尔磁铁偏移和锁扣角度边界。读取TI DRV5032数据表核对3.3V、阈值、采样、极性、输出；提供独立串口测量草图与验收CSV模板。
- [x] 更新CAD说明、BOM、初学者装配/实测文档、预览标签/打印映射/紧固数量；重跑export_verify.py、verify_window.py、verify_review.py及专项核验。
- [x] 生成CAD图/ZIP、Vite静态包；浏览器验证新分件和下载导出，核对包内源/STL指纹，刷新证据。

命令：python3 scripts/v3/verify_hinge_hall.py --retention-only；python3 scripts/v3/export_verify.py；python3 scripts/v3/verify_hinge_hall.py；python3 scripts/v3/verify_window.py；python3 scripts/v3/verify_review.py；python3 scripts/v3/render.py；python3 scripts/v3/package_cad.py；npm test；npm run package；npm run test:browser -- --url=http://127.0.0.1:4173/workbench/ --output=artifacts/v3/viewer-static。

完成证据：整机几何1,095项、铰链/霍尔几何81项、栅窗30项、附加检查10项、Node测试9项、浏览器19项通过；CAD与静态包成员指纹核对通过。霍尔仅完成候选电气和几何核验，实际触发/释放与锁定授权仍待采购后的实测。
