// ===================================================================
// 智能玩具电子锁盒 - 零部件 2: 顶盖 (Top Lid with Armored Skylight)
// CAD 级高精度生产模型
// ===================================================================

$fn = 60;

total_length   = 240.0;
total_width    = 120.0;
lid_thickness  = 4.5;
fillet_r       = 3.0;

// 天窗视窗尺寸
win_length     = 160.0;
win_width      = 80.0;
win_center_x   = -22.0;
acrylic_thick  = 2.5;

module top_lid() {
    difference() {
        // 1. 顶盖主平板基体 (带倒角)
        hull() {
            translate([-total_length/2 + fillet_r, -total_width/2 + fillet_r, 0])
                cylinder(r=fillet_r, h=lid_thickness);
            translate([total_length/2 - fillet_r, -total_width/2 + fillet_r, 0])
                cylinder(r=fillet_r, h=lid_thickness);
            translate([-total_length/2 + fillet_r, total_width/2 - fillet_r, 0])
                cylinder(r=fillet_r, h=lid_thickness);
            translate([total_length/2 - fillet_r, total_width/2 - fillet_r, 0])
                cylinder(r=fillet_r, h=lid_thickness);
        }

        // 2. 挖空天窗视窗通孔
        translate([win_center_x - win_length/2, -win_width/2, -1])
            cube([win_length, win_width, lid_thickness + 2]);

        // 3. 挖出内侧亚克力沉槽 (Under Pocket, 留 2.5mm 深台阶)
        translate([win_center_x - win_length/2 - 2, -win_width/2 - 2, -0.1])
            cube([win_length + 4, win_width + 4, acrylic_thick + 0.3]);
    }

    // --- 4. 一体化重型防暴格栅 (Prison Bars) ---
    // 8 根横向跨梁 (跨过 win_width)
    rib_count = 8;
    rib_width = 4.0;
    spacing = win_length / (rib_count + 1);

    for (i = [1 : rib_count]) {
        translate([win_center_x - win_length/2 + i * spacing - rib_width/2, -win_width/2, 0])
            cube([rib_width, win_width, lid_thickness]);
    }

    // 1 根纵向中心大梁 (Spine)
    translate([win_center_x - win_length/2, -2.0, 0])
        cube([win_length, 4.0, lid_thickness]);

    // --- 5. 顶盖内侧燕尾滑槽 (Dovetail Female Rail) ---
    // 位置: 靠近隔板锁钩处 (X = 81, Y = 20)
    translate([81 - 8, 20 - 11, -4.5]) {
        difference() {
            // 外滑槽座
            cube([16, 22, 4.5]);
            // 内部燕尾母槽 (倒梯形)
            translate([8, -1, 0])
                rotate([-90, 0, 0])
                linear_extrude(height=24)
                polygon(points=[[-5, 0], [5, 0], [7, 4.6], [-7, 4.6]]);
        }
    }

    // --- 6. 后置铰链公耳 (Mating Hinge Knuckles at Y=-total_width/2) ---
    // 销轴中心位于分型面 Z=0.0, 外挑 Y=-63.5，圆柱外径 Ø6.0mm
    difference() {
        union() {
            for (kx = [-80 + 19, 80 - 18 - 19]) {
                hull() {
                    // 圆柱形转轴节套 (与销轴同心)
                    translate([kx, -total_width/2 - 3.5, 0])
                        rotate([0, 90, 0])
                        cylinder(r=3.0, h=18);
                    // 向上延伸融合至顶盖主板框架 (Z=0 到 4.5, Y=-63.5 到 -60.0)
                    translate([kx, -total_width/2 - 3.5, 0])
                        cube([18, 3.5, lid_thickness]);
                }
            }
        }
        // 销钉穿孔 (直径 2.3mm)
        translate([-100, -total_width/2 - 3.5, 0])
            rotate([0, 90, 0])
            cylinder(d=2.3, h=200);
    }

    // --- 7. 弹簧顶针接触承力垫块 (Spring Plunger Striker Pad) ---
    // 位于顶盖内侧 (X=78.5, Y=40)，为弹簧顶针提供平整稳固受力接触面
    translate([82 - 3.5, 40, -1.8])
        cylinder(d=10.0, h=1.8);
}

top_lid();
