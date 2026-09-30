// ===================================================================
// 智能玩具电子锁盒 - 零部件 3: 易损断裂卡扣 (Breakaway Latch)
// CAD 级高精度生产模型 (建议使用普通 PLA 打印以保证脆断性)
// ===================================================================

$fn = 40;

slider_len   = 20.0;
slider_w     = 10.0;
slider_h     = 4.2;
neck_thick   = 1.2;  // V型切槽处仅保留 1.2mm 厚度
hook_len     = 20.0; // 下垂锁钩长度

module breakaway_latch() {
    union() {
        // 1. 燕尾滑块 (Male Dovetail Slider)
        // 配合顶盖内侧母槽 (单边留 0.2mm 打印滑动公差)
        translate([0, 0, 0])
            rotate([-90, 0, 0])
            linear_extrude(height=slider_len)
            polygon(points=[[-4.7, 0], [4.7, 0], [6.6, slider_h], [-6.6, slider_h]]);

        // 2. V 型断裂颈部 (Breakaway Neck with V-grooves)
        translate([-4.5, 0, -5]) {
            difference() {
                cube([9, slider_len, 5]);
                // 两侧 45° V 型切削槽
                translate([0, -1, 2.5])
                    rotate([0, 45, 0])
                    cube([4, slider_len + 2, 4], center=true);
                translate([9, -1, 2.5])
                    rotate([0, 45, 0])
                    cube([4, slider_len + 2, 4], center=true);
            }
        }

        // 3. 垂直下垂锁钩主体 (Locking Hook Body)
        translate([-4.0, 0, -5 - hook_len]) {
            difference() {
                // 实体方柱
                cube([8.0, slider_len, hook_len]);

                // 侧面供舵机锁舌插入的方槽 (Locking Cavity facing +X)
                // 精准对齐舵机摆臂标高 Z=32.9~35.9mm (留上下各 1.0mm 动态咬合裕量)
                translate([2.5, (slider_len - 10)/2, 6.5])
                    cube([6.0, 10.0, 6.5]);

                // 底部 45° 导向顺滑倒角 (Lead-in Chamfer)
                translate([0, -1, 0])
                    rotate([0, 45, 0])
                    cube([6.0, slider_len + 2, 6.0]);
            }
        }
    }
}

breakaway_latch();
