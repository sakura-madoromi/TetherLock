// ===================================================================
// 智能玩具电子锁盒 - 零部件 1: 主箱体 (Base Box)
// CAD 级高精度生产模型
// ===================================================================

$fn = 60; // 弧度与圆孔平滑度

// --- 主参数定义 (单位: mm) ---
total_length   = 240.0;
total_width    = 120.0;
total_height   = 55.0;
wall_thick     = 2.4;
divider_x      = 82.0;  // 隔板中心位置 (以箱体中心为原点即 82 - 120 = -38)
fillet_r       = 3.0;

// --- 模块: 倒圆角底盒 ---
module base_box() {
    difference() {
        // 1. 外部基体 (带外倒角)
        hull() {
            translate([-total_length/2 + fillet_r, -total_width/2 + fillet_r, 0])
                cylinder(r=fillet_r, h=total_height);
            translate([total_length/2 - fillet_r, -total_width/2 + fillet_r, 0])
                cylinder(r=fillet_r, h=total_height);
            translate([-total_length/2 + fillet_r, total_width/2 - fillet_r, 0])
                cylinder(r=fillet_r, h=total_height);
            translate([total_length/2 - fillet_r, total_width/2 - fillet_r, 0])
                cylinder(r=fillet_r, h=total_height);
        }

        // 2. 挖空储物仓 (Storage Cavity)
        // 净空: X: [-117.6, 80.8], Y: [-57.6, 57.6], Z: [2.4, 56]
        translate([-total_length/2 + wall_thick, -total_width/2 + wall_thick, wall_thick])
            cube([total_length/2 + divider_x - wall_thick*1.5, total_width - 2*wall_thick, total_height]);

        // 3. 挖空电气仓 (Electronics Cavity)
        translate([divider_x + wall_thick/2, -total_width/2 + wall_thick, wall_thick])
            cube([total_length/2 - divider_x - wall_thick*1.5, total_width - 2*wall_thick, total_height]);

        // 4. 隔板处的锁舌导向穿孔 (Latch Guide Slot, 跨度 X:72~90mm, 宽24mm 完美避让顶盖燕尾榫与开盖运动包络)
        translate([72.0, 20 - 12, 16])
            cube([18.0, 24, total_height]);

        // 5. 前端 OLED 视窗开孔 (Right Face X+)
        translate([total_length/2 - wall_thick - 1, 22 - 13, 32 - 10])
            cube([wall_thick + 4, 26, 20]);

        // 6. 唤醒按键孔 (Right Face X+, 12mm圆孔)
        translate([total_length/2 - 2, -22, 32])
            rotate([0, 90, 0])
            cylinder(d=12.2, h=wall_thick + 4);

        // 7. Type-C 充电母座开孔与外部线缆防干涉沉台 (Right Face X+, 前仓专属 Y=43.0)
        // 内部插头孔
        translate([total_length/2 - 2, 43.0 - 4.5, 12])
            cube([wall_thick + 4, 9.0, 3.8]);
        // 外部充电线粗胶壳喇叭沉头 (深 1.2mm, 宽 12.4mm, 高 6.2mm, 彻底杜绝插头外壳顶撞外壁)
        translate([total_length/2 - 1.2, 43.0 - 6.2, 10.8])
            cube([2.0, 12.4, 6.2]);
    }

    // --- 内部加固与固定座 ---
    // A. 隔板下封底挡边 (宽24mm)
    translate([divider_x - wall_thick/2, 20 - 12, wall_thick])
        cube([wall_thick, 24, 14]);

    // B. 后置转轴铰链母耳 (Base Knuckles at Y=-total_width/2)
    // 销轴中心位于分型线面 Z=55.0, 外挑 Y=-63.5，圆柱外径 Ø6.0mm
    difference() {
        union() {
            for (kx = [-80, 80 - 18]) {
                hull() {
                    // 圆柱形转轴节套 (与销轴同心)
                    translate([kx, -total_width/2 - 3.5, total_height])
                        rotate([0, 90, 0])
                        cylinder(r=3.0, h=18);
                    // 向下与箱体后壁 (Y=-60 到 -57.6, Z=45 到 55) 刚性融合支撑加强肋
                    translate([kx, -total_width/2 - 3.5, total_height - 10])
                        cube([18, 3.5 + wall_thick, 10]);
                }
            }
        }
        // 贯穿销钉穿孔 (直径 2.3mm，适配 1.75mm 耗材或 M2 螺栓，预留 0.3mm 顺滑转动间隙)
        translate([-100, -total_width/2 - 3.5, total_height])
            rotate([0, 90, 0])
            cylinder(d=2.3, h=200);
    }

    // C. MG90S 舵机六角螺母沉槽与 M2 内六角螺钉刚性固定座 (Captive Nut Bosses)
    // 输出轴心位于 (X=95.0, Y=20.0), 舵机中心位于 (X=100.9, Y=20.0)
    // 双耳孔距 28mm: 左孔 (X=86.9, Y=20.0), 右孔 (X=114.9, Y=20.0)
    difference() {
        union() {
            // 外围实心加强壁座 (X: 84.0 到 117.5, Y: 11.5 到 28.5, Z: 2.4 到 20.9)
            translate([84.0, 11.5, wall_thick])
                cube([33.5, 17.0, 18.5]);
        }
        // 1. 内部掏出舵机本体落座空腔 (23.4 x 12.8 mm, 抬升至 Z=3.4 支撑)
        translate([100.9 - 23.4/2, 20.0 - 12.8/2, wall_thick + 1.0])
            cube([23.4, 12.8, 25.0]);

        // 2. 双侧 M2 螺钉垂直穿孔 (Ø2.4mm，垂直通孔)
        for (hx = [86.9, 114.9]) {
            translate([hx, 20.0, 10.0])
                cylinder(d=2.4, h=15.0);
        }

        // 3. 双侧 M2 六角螺母水平侧插沉槽 (Captive Nut T-Slots, 从 +Y 前方推入)
        // 槽宽 4.2mm (适配 4.0mm 六角对边), 槽高 2.0mm (适配 1.6mm 螺母厚度), 深至 Y=16.0
        for (hx = [86.9, 114.9]) {
            translate([hx - 4.2/2, 16.0, 13.5])
                cube([4.2, 13.0, 2.0]);
        }

        // 4. 底部走线穿线缺口
        translate([88.0, 17.0, wall_thick - 0.1])
            cube([5.0, 6.0, 4.0]);
    }

    // E. ESP32-C3 SuperMini 前仓专属纯打印托架与 Type-C 刚性止推受力挡墙
    // 对准右壁 Type-C 开孔 (Y=43.0, Z=12~16)，后置 2.0mm 实心硬质挡墙吸收 USB 插拔推力
    translate([95.0, 43.0 - 9.5, wall_thick]) {
        difference() {
            // 外部支撑围框 (X: 95 到 117.6, Y: 33.5 到 52.5)
            cube([22.6, 19.0, 13.5]);
            // 内部 PCB 放置沉槽 (22.8 x 18.4 mm, 抬升至 Z=12.0mm 齐平 Type-C 母座)
            translate([1.8, 0.3, 9.6])
                cube([22.0, 18.4, 6.0]);
            // 中间散热与排线通孔
            translate([5.0, 3.5, -1])
                cube([14.0, 12.0, 12.0]);
        }
    }
    // Type-C 背后实心止推受力骨架 (坚固抗击打插头推力)
    translate([93.5, 43.0 - 8.0, wall_thick])
        cube([2.0, 16.0, 13.5]);

    // F. 18650 锂电池全尺寸弧形仿形沉槽与双弹性抱爪 (Resilient C-Claws)
    // 位于后仓完整净空区 Y in [-55, 8] (长 63mm)，横向 X in [88, 112]
    translate([87.5, -55.0, wall_thick]) {
        difference() {
            // 电池托架底座台阶 (长 63mm, 宽 24.5mm, 高 9.5mm)
            cube([24.5, 63.0, 9.5]);
            // 弧形仿形凹槽 (半径 9.4mm 顺滑贴合 Ø18.4mm 电芯)
            translate([12.25, -1, 10.0])
                rotate([-90, 0, 0])
                cylinder(r=9.4, h=65);
        }
        // 前后两道弹性环抱卡爪 (C-Claw Snaps, 带有导向倒角，按压咔哒自锁)
        for (claw_y = [10.0, 40.0]) {
            translate([1.5, claw_y, 8.5])
                cube([2.2, 4.0, 6.5]);
            translate([20.8, claw_y, 8.5])
                cube([2.2, 4.0, 6.5]);
            // 内扣防脱卡爪倒钩
            translate([2.5, claw_y, 14.0])
                rotate([0, 45, 0])
                cube([1.8, 4.0, 1.8]);
            translate([21.0, claw_y, 14.0])
                rotate([0, -45, 0])
                cube([1.8, 4.0, 1.8]);
        }
    }

    // G. 0.96" OLED 屏幕内贴重力滑槽与点胶沉台 (OLED Slide-in Bezel)
    // 紧贴右侧内壁 (X = 117.6)，垂直对应 Y in [9, 35], Z in [22, 42]
    translate([total_length/2 - wall_thick - 2.8, 8.5, 21.0]) {
        // 下托底挡沿 (Bottom Stop Shelf)
        cube([2.8, 27.0, 2.0]);
        // 左右侧导向滑条 (Guide Flanges, 屏幕沿内壁由上至下滑入)
        cube([2.8, 2.0, 23.0]);
        translate([0, 25.0, 0])
            cube([2.8, 2.0, 23.0]);
    }

    // D. 弹簧顶针一体化套筒立柱 (Spring Plunger Boss & Socket)
    // 紧贴隔板 (X=82) 与侧沿 (Y=40)，高度从底板直达 Z=44mm，与隔板融为一体
    translate([divider_x - 3.5, 40, wall_thick]) {
        difference() {
            // 外立柱：外径 9.0mm，自底面直通向上
            cylinder(d=9.0, h=44 - wall_thick);
            // 内部沉孔：直径 6.2mm，配合标准 6mm 弹簧顶销，深度 25mm
            translate([0, 0, (44 - wall_thick) - 25])
                cylinder(d=6.2, h=26);
            // 底部排气孔 / 拆卸顶出通孔：直径 2.5mm
            translate([0, 0, -1])
                cylinder(d=2.5, h=wall_thick + 20);
        }
    }
}

base_box();
