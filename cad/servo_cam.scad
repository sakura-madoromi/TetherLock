// ===================================================================
// 智能玩具电子锁盒 - 零部件 4: 舵机旋转锁舌 (Servo Locking Cam Horn)
// CAD 级高精度生产模型
// ===================================================================

$fn = 50;

horn_hub_r    = 4.5;
horn_hub_h    = 3.5;
spline_hole_d = 4.8;  // MG90S 齿轮轴外径 (标准 25T 微型花键配合)
cam_len       = 18.0; // 摆臂旋转半径
tongue_thick  = 3.0;

module servo_cam() {
    difference() {
        union() {
            // 1. 舵机轴连接轴套 (Hub)
            cylinder(r=horn_hub_r, h=horn_hub_h);

            // 2. 旋转摆臂 (Arm)
            hull() {
                cylinder(r=horn_hub_r, h=tongue_thick);
                translate([cam_len - 2, 0, 0])
                    cylinder(r=2.5, h=tongue_thick);
            }

            // 3. 前端金属啮合锁舌片 (Beveled Locking Tongue)
            translate([cam_len - 4, -3.0, 0])
                cube([8.0, 6.0, tongue_thick]);
        }

        // 中心固定螺丝穿孔 (适合 M2 自攻螺丝拧入舵机输出齿轮中心)
        translate([0, 0, -1])
            cylinder(d=2.2, h=horn_hub_h + 2);

        // 花键沉孔 (深 2.5mm)
        translate([0, 0, -0.1])
            cylinder(d=spline_hole_d, h=2.5);
    }
}

servo_cam();
