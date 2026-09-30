// ===================================================================
// MG90S 9g 金属齿微型舵机 (Standard Micro Servo Model)
// 工业标准 1:1 CAD 实体模型
// ===================================================================

$fn = 40;

module mg90s_servo() {
    // 材质颜色标识: 深灰色主体 + 黄铜色齿轮输出轴
    color([0.2, 0.2, 0.25]) {
        // 1. 舵机主体外壳 (Main Body: 22.8 x 12.2 x 22.7 mm 下箱体)
        translate([-22.8/2, -12.2/2, 0])
            cube([22.8, 12.2, 22.7]);
        
        // 2. 齿轮箱顶部阶梯盖 (Top Gearbox: 22.8 x 12.2 x 5.8 mm)
        translate([-22.8/2, -12.2/2, 22.7])
            cube([22.8, 12.2, 5.8]);

        // 3. 安装固定耳 (Mounting Ears: 总跨度 32.5mm，位于高 Z=17.5mm 处，厚度 2.5mm)
        difference() {
            translate([-32.5/2, -12.0/2, 17.5])
                cube([32.5, 12.0, 2.5]);
            
            // 两侧 M2 安装孔 (孔距 28.0mm, 孔径 Ø2.2mm)
            translate([-28.0/2, 0, 16])
                cylinder(d=2.2, h=5);
            translate([28.0/2, 0, 16])
                cylinder(d=2.2, h=5);
        }

        // 4. 电源信号引出线护套 (Wire exit at bottom corner)
        translate([-22.8/2 - 1.5, -4, 2])
            cube([2.0, 8, 4]);
    }

    // 5. 黄铜色金属输出齿轮轴 (25T Spline Output Shaft: 偏心 5.5mm，外径 Ø4.8mm，高 4.0mm)
    color([0.85, 0.7, 0.25]) {
        translate([-22.8/2 + 5.5, 0, 28.5]) {
            cylinder(d=4.8, h=4.0);
            // 顶端平垫齿圈台阶
            translate([0, 0, -1.0])
                cylinder(d=6.5, h=1.0);
        }
    }
}

mg90s_servo();
