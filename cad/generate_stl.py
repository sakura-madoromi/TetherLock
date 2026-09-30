#!/usr/bin/env python3
"""
High-Precision Binary STL Generator for ToyLock CAD Models
Converts OpenSCAD parametric geometries into accurate binary STLs for 3D printing and Three.js visualization.
"""
import struct
import math
import os

def write_stl(filename, facets):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'wb') as f:
        header = f"Binary STL for ToyLock CAD - {os.path.basename(filename)}".encode('ascii')
        f.write(header.ljust(80, b'\0'))
        f.write(struct.pack('<I', len(facets)))
        for normal, v1, v2, v3 in facets:
            f.write(struct.pack('<3f3f3f3fH', 
                normal[0], normal[1], normal[2],
                v1[0], v1[1], v1[2],
                v2[0], v2[1], v2[2],
                v3[0], v3[1], v3[2],
                0
            ))
    print(f"Generated {filename} ({len(facets)} triangles, {os.path.getsize(filename)/1024:.1f} KB)")

def calc_normal(v1, v2, v3):
    ax, ay, az = v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]
    bx, by, bz = v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]
    nx = ay * bz - az * by
    ny = az * bx - ax * bz
    nz = ax * by - ay * bx
    length = math.sqrt(nx*nx + ny*ny + nz*nz)
    if length > 1e-9:
        return (nx/length, ny/length, nz/length)
    return (0.0, 0.0, 1.0)

def add_quad(facets, p1, p2, p3, p4):
    n1 = calc_normal(p1, p2, p3)
    facets.append((n1, p1, p2, p3))
    n2 = calc_normal(p1, p3, p4)
    facets.append((n2, p1, p3, p4))

def add_box(facets, x0, x1, y0, y1, z0, z1):
    # -Z bottom
    add_quad(facets, (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0))
    # +Z top
    add_quad(facets, (x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1))
    # -X left
    add_quad(facets, (x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1))
    # +X right
    add_quad(facets, (x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0))
    # -Y front/back
    add_quad(facets, (x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0))
    # +Y front/back
    add_quad(facets, (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1))

def add_cylinder(facets, cx, cy, z0, z1, r, segments=32):
    angles = [2 * math.pi * i / segments for i in range(segments)]
    p_bot = [(cx + r * math.cos(a), cy + r * math.sin(a), z0) for a in angles]
    p_top = [(cx + r * math.cos(a), cy + r * math.sin(a), z1) for a in angles]
    c_bot = (cx, cy, z0)
    c_top = (cx, cy, z1)
    for i in range(segments):
        ni = (i + 1) % segments
        # Bottom fan
        facets.append(((0, 0, -1), c_bot, p_bot[ni], p_bot[i]))
        # Top fan
        facets.append(((0, 0, 1), c_top, p_top[i], p_top[ni]))
        # Side quad
        add_quad(facets, p_bot[i], p_bot[ni], p_top[ni], p_top[i])

def add_cylinder_hollow(facets, cx, cy, z0, z1, r_out, r_in, segments=32):
    angles = [2 * math.pi * i / segments for i in range(segments)]
    p_bot_o = [(cx + r_out * math.cos(a), cy + r_out * math.sin(a), z0) for a in angles]
    p_top_o = [(cx + r_out * math.cos(a), cy + r_out * math.sin(a), z1) for a in angles]
    p_bot_i = [(cx + r_in * math.cos(a), cy + r_in * math.sin(a), z0) for a in angles]
    p_top_i = [(cx + r_in * math.cos(a), cy + r_in * math.sin(a), z1) for a in angles]
    for i in range(segments):
        ni = (i + 1) % segments
        # Top annular ring
        add_quad(facets, p_top_o[i], p_top_i[i], p_top_i[ni], p_top_o[ni])
        # Bottom annular ring
        add_quad(facets, p_bot_o[i], p_bot_o[ni], p_bot_i[ni], p_bot_i[i])
        # Outer side
        add_quad(facets, p_bot_o[i], p_bot_o[ni], p_top_o[ni], p_top_o[i])
        # Inner side
        add_quad(facets, p_bot_i[ni], p_bot_i[i], p_top_i[i], p_top_i[ni])

def add_cylinder_x(facets, x0, x1, cy, cz, r, segments=24):
    angles = [2 * math.pi * i / segments for i in range(segments)]
    p_left = [(x0, cy + r * math.cos(a), cz + r * math.sin(a)) for a in angles]
    p_right = [(x1, cy + r * math.cos(a), cz + r * math.sin(a)) for a in angles]
    c_left = (x0, cy, cz)
    c_right = (x1, cy, cz)
    for i in range(segments):
        ni = (i + 1) % segments
        # Left cap (-X normal)
        facets.append(((-1, 0, 0), c_left, p_left[i], p_left[ni]))
        # Right cap (+X normal)
        facets.append(((1, 0, 0), c_right, p_right[ni], p_right[i]))
        # Side quad
        add_quad(facets, p_left[i], p_right[i], p_right[ni], p_left[ni])

def add_corner_fillet(facets, cx, cy, z0, z1, r, start_deg, end_deg, segments=8):
    angles = [math.radians(start_deg + (end_deg - start_deg) * i / segments) for i in range(segments + 1)]
    p_bot = [(cx + r * math.cos(a), cy + r * math.sin(a), z0) for a in angles]
    p_top = [(cx + r * math.cos(a), cy + r * math.sin(a), z1) for a in angles]
    for i in range(segments):
        add_quad(facets, p_bot[i], p_bot[i+1], p_top[i+1], p_top[i])

# ==========================================
# 1. Base Box (主箱体)
# ==========================================
def gen_base_box():
    facets = []
    L, W, H = 240.0, 120.0, 55.0
    wall = 2.4
    div_x = 82.0
    R = 3.0  # Outer corner fillet radius

    # --- A. Bottom Plate ---
    add_box(facets, -L/2 + R, L/2 - R, -W/2 + R, W/2 - R, 0, wall)
    # Bottom plate corner extensions
    add_box(facets, -L/2, -L/2 + R, -W/2 + R, W/2 - R, 0, wall)
    add_box(facets, L/2 - R, L/2, -W/2 + R, W/2 - R, 0, wall)
    add_box(facets, -L/2 + R, L/2 - R, -W/2, -W/2 + R, 0, wall)
    add_box(facets, -L/2 + R, L/2 - R, W/2 - R, W/2, 0, wall)

    # --- B. Outer Walls ---
    # Back Wall (Y = -W/2 to -W/2 + wall)
    add_box(facets, -L/2 + R, L/2 - R, -W/2, -W/2 + wall, wall, H)
    # Front Wall (Y = W/2 - wall to W/2)
    add_box(facets, -L/2 + R, L/2 - R, W/2 - wall, W/2, wall, H)
    # Left Wall (X = -L/2 to -L/2 + wall)
    add_box(facets, -L/2, -L/2 + wall, -W/2 + R, W/2 - R, wall, H)

    # Right Wall with Precision Openings (X = L/2 - wall to L/2)
    # Total right face spans Y in [-60 + R, 60 - R] = [-57, 57]
    # 1. Lower solid strip under all ports (Z: wall to 12)
    add_box(facets, L/2 - wall, L/2, -W/2 + R, W/2 - R, wall, 12)
    # 2. Upper solid strip above all ports (Z: 44 to H)
    add_box(facets, L/2 - wall, L/2, -W/2 + R, W/2 - R, 44, H)
    # 3. Y strips between ports:
    # Port 1: Button at Y in [-28, -16], Z in [26, 38]
    # Port 2: OLED at Y in [9, 35], Z in [22, 42]
    # Port 3: Type-C at Y in [38.5, 47.5], Z in [12, 16] (Front bay dedicated position)
    # Y from -57 to -28 (Solid)
    add_box(facets, L/2 - wall, L/2, -57, -28, 12, 44)
    # Button under/over:
    add_box(facets, L/2 - wall, L/2, -28, -16, 12, 26)
    add_box(facets, L/2 - wall, L/2, -28, -16, 38, 44)
    # Y between button and OLED (-16 to 9): Solid wall
    add_box(facets, L/2 - wall, L/2, -16, 9, 12, 44)
    # OLED under/over (9 to 35):
    add_box(facets, L/2 - wall, L/2, 9, 35, 12, 22)
    add_box(facets, L/2 - wall, L/2, 9, 35, 42, 44)
    # Y between OLED and Type-C (35 to 38.5): Solid
    add_box(facets, L/2 - wall, L/2, 35, 38.5, 12, 44)
    # Above Type-C (38.5 to 47.5, Z: 16 to 44):
    add_box(facets, L/2 - wall, L/2, 38.5, 47.5, 16, 44)
    # Y from Type-C to front corner (47.5 to 57): Solid
    add_box(facets, L/2 - wall, L/2, 47.5, 57, 12, 44)

    # 4 Corner Fillets (Quarter Cylinders)
    add_corner_fillet(facets, -L/2 + R, -W/2 + R, 0, H, R, 180, 270)
    add_corner_fillet(facets, L/2 - R, -W/2 + R, 0, H, R, 270, 360)
    add_corner_fillet(facets, L/2 - R, W/2 - R, 0, H, R, 0, 90)
    add_corner_fillet(facets, -L/2 + R, W/2 - R, 0, H, R, 90, 180)

    # --- C. Internal Divider Wall (At X = 82) ---
    # Segment 1: Y from -57.6 to 9
    add_box(facets, div_x - wall/2, div_x + wall/2, -W/2 + wall, 9, wall, H)
    # Segment 2: Y from 31 to 57.6
    add_box(facets, div_x - wall/2, div_x + wall/2, 31, W/2 - wall, wall, H)
    # Lower Sill under Latch Guide Slot (Y: 9 to 31, Z: wall to 16, width 22mm)
    add_box(facets, div_x - wall/2, div_x + wall/2, 9, 31, wall, 16)

    # --- D. Rear Hinge Knuckles (Back Y = -W/2 = -60.0) ---
    # Upgraded: Cylindrical barrel concentric with hinge pin (Y=-63.5, Z=55.0, R=3.0)
    # Left knuckle: X in [-80, -62] (width 18mm)
    add_cylinder_x(facets, -80, -62, -W/2 - 3.5, H, 3.0, segments=24)
    add_box(facets, -80, -62, -W/2 - 3.5, -W/2 + wall, H - 8, H)
    # Right knuckle: X in [62, 80] (width 18mm)
    add_cylinder_x(facets, 80 - 18, 80, -W/2 - 3.5, H, 3.0, segments=24)
    add_box(facets, 80 - 18, 80, -W/2 - 3.5, -W/2 + wall, H - 8, H)

    # --- E. MG90S 舵机六角螺母沉槽刚性安装立柱 (Servo Captive Nut Bosses) ---
    # 舵机轴心位于 (X=95.0, Y=20.0), 舵机中心位于 (X=100.9, Y=20.0)
    # 左耳 M2 螺钉中心 (X=86.9, Y=20.0), 右耳 M2 螺钉中心 (X=114.9, Y=20.0)
    # 1. 舵机主体仿形围壁 (X: 89.2 到 112.6)
    # 前外壁 (Y: 11.5 到 13.6)
    add_box(facets, 89.2, 112.6, 11.5, 13.6, wall, 20.9)
    # 后外壁 (Y: 26.4 到 28.5)
    add_box(facets, 89.2, 112.6, 26.4, 28.5, wall, 20.9)

    # 2. 左安装立柱 (X: 84.0 到 89.2, Y: 14.0 到 26.0, 耳部承托面高 Z=20.9)
    # 底层实心基座 (Z: wall 到 13.5)
    add_box(facets, 84.0, 89.2, 14.0, 26.0, wall, 13.5)
    # 中层 M2 六角螺母水平侧插沉槽 (Z: 13.5 到 15.5, 槽宽 4.2mm 位于 X:[84.8, 89.0], 沿 +Y 侧向推入)
    add_box(facets, 84.0, 89.2, 14.0, 16.5, 13.5, 15.5) # 槽后定位挡死壁
    add_box(facets, 84.0, 84.8, 16.5, 26.0, 13.5, 15.5) # 槽左防偏限位侧壁
    add_box(facets, 89.0, 89.2, 16.5, 26.0, 13.5, 15.5) # 槽右防偏限位侧壁
    # 顶层螺钉支承台阶 (Z: 15.5 到 20.9, 留出 Ø2.8mm 螺栓垂直过孔中心在 (86.9, 20.0))
    add_box(facets, 84.0, 89.2, 14.0, 18.5, 15.5, 20.9)
    add_box(facets, 84.0, 89.2, 21.5, 26.0, 15.5, 20.9)
    add_box(facets, 84.0, 85.5, 18.5, 21.5, 15.5, 20.9)
    add_box(facets, 88.3, 89.2, 18.5, 21.5, 15.5, 20.9)

    # 3. 右安装立柱 (X: 112.6 到 117.5, Y: 14.0 到 26.0, 耳部承托面高 Z=20.9)
    # 底层实心基座 (Z: wall 到 13.5)
    add_box(facets, 112.6, 117.5, 14.0, 26.0, wall, 13.5)
    # 中层 M2 六角螺母水平侧插沉槽 (Z: 13.5 到 15.5, 槽宽 4.2mm 位于 X:[112.8, 117.0])
    add_box(facets, 112.6, 117.5, 14.0, 16.5, 13.5, 15.5)
    add_box(facets, 112.6, 112.8, 16.5, 26.0, 13.5, 15.5)
    add_box(facets, 117.0, 117.5, 16.5, 26.0, 13.5, 15.5)
    # 顶层螺钉支承台阶 (Z: 15.5 到 20.9, 螺栓中心在 (114.9, 20.0))
    add_box(facets, 112.6, 117.5, 14.0, 18.5, 15.5, 20.9)
    add_box(facets, 112.6, 117.5, 21.5, 26.0, 15.5, 20.9)
    add_box(facets, 112.6, 113.5, 18.5, 21.5, 15.5, 20.9)
    add_box(facets, 116.3, 117.5, 18.5, 21.5, 15.5, 20.9)

    # --- F. ESP32-C3 SuperMini 前仓专属托架与 Type-C 刚性止推受力挡墙 ---
    # 位于前仓 Y in [33.5, 52.5] (中心 Y=43.0)，后方实心止推受力挡墙 (X: 93.5 到 95.5, Z: wall 到 15.5)
    add_box(facets, 93.5, 95.5, 35.0, 51.0, wall, 15.5)
    # 双侧承托导向侧梁 (Y: 33.5 到 35.5 和 50.5 到 52.5)
    add_box(facets, 95.5, 117.6, 33.5, 35.5, wall, 12.0)
    add_box(facets, 95.5, 117.6, 50.5, 52.5, wall, 12.0)

    # --- G. 18650 锂电池全尺寸仿形承托座与弹性抱爪 ---
    # 位于后仓完整净空区 Y in [-55.0, 8.0] (跨度 63mm，适配 65mm 标准电芯)
    # 底座支撑台阶 (X: 88.0 到 112.0, Y: -55.0 到 8.0, Z: wall 到 10.0)
    add_box(facets, 88.0, 93.0, -55.0, 8.0, wall, 10.0)
    add_box(facets, 107.0, 112.0, -55.0, 8.0, wall, 10.0)
    # 双侧弹性立臂抱爪 (C-Claw Snaps at Y=-45.0 and Y=-15.0)
    for cy in [-47.0, -17.0]:
        add_box(facets, 89.0, 91.2, cy, cy + 4.0, 10.0, 15.5)
        add_box(facets, 108.8, 111.0, cy, cy + 4.0, 10.0, 15.5)

    # --- H. 0.96" OLED 屏幕内贴重力滑槽导轨 ---
    # 下托底台阶 (Z: 21.0 到 23.0)
    add_box(facets, L/2 - wall - 2.8, L/2 - wall, 8.5, 35.5, 21.0, 23.0)
    # 左右侧导向立柱滑条
    add_box(facets, L/2 - wall - 2.8, L/2 - wall, 8.5, 10.5, 23.0, 44.0)
    add_box(facets, L/2 - wall - 2.8, L/2 - wall, 33.5, 35.5, 23.0, 44.0)

    # Spring Plunger Mounting Boss (一体化弹簧顶销安装座套筒)
    # 紧贴隔板 (X=div_x-3.5, Y=40)，自箱底实心长起至 Z=44mm
    add_cylinder(facets, div_x - 3.5, 40.0, wall, 44.0, 4.5, segments=24)

    write_stl('/home/sakura-madoromi/cad/base_box.stl', facets)

# ==========================================
# 2. Top Lid with Armored Skylight (顶盖)
# ==========================================
def gen_top_lid():
    facets = []
    L, W, T = 240.0, 120.0, 4.5
    win_l, win_w = 160.0, 80.0
    win_cx = -22.0
    R = 3.0

    # Top Lid Frame (Zero Overlap Partitioning):
    # Back frame strip (Y: -60 to -40)
    add_box(facets, -L/2 + R, L/2 - R, -W/2, -win_w/2, 0, T)
    # Front frame strip (Y: 40 to 60)
    add_box(facets, -L/2 + R, L/2 - R, win_w/2, W/2, 0, T)
    # Left frame strip (X: -120 to -102, Y: -40 to 40)
    add_box(facets, -L/2, win_cx - win_l/2, -win_w/2, win_w/2, 0, T)
    # Right solid section over electronics (X: 58 to 120, Y: -40 to 40)
    add_box(facets, win_cx + win_l/2, L/2, -win_w/2, win_w/2, 0, T)

    # 4 Corner Fillets for Lid
    add_corner_fillet(facets, -L/2 + R, -W/2 + R, 0, T, R, 180, 270)
    add_corner_fillet(facets, L/2 - R, -W/2 + R, 0, T, R, 270, 360)
    add_corner_fillet(facets, L/2 - R, W/2 - R, 0, T, R, 0, 90)
    add_corner_fillet(facets, -L/2 + R, W/2 - R, 0, T, R, 90, 180)

    # 8 Integrated Prison Bars (Ribs) across Y: [-40, 40]
    rib_count = 8
    rib_w = 4.0
    spacing = win_l / (rib_count + 1)
    for i in range(1, rib_count + 1):
        rx = win_cx - win_l/2 + i * spacing
        add_box(facets, rx - rib_w/2, rx + rib_w/2, -win_w/2, win_w/2, 0, T)

    # 1 Longitudinal Center Spine along X: [-102, 58]
    add_box(facets, win_cx - win_l/2, win_cx + win_l/2, -2.0, 2.0, 0, T)

    # Dovetail Female Rail (underneath lid at X = 81, Y = 20)
    add_box(facets, 81 - 8, 81 + 8, 20 - 11, 20 + 11, -4.5, 0)

    # Mating Hinge Knuckles at Back (Interlocks with Base Box)
    # Upgraded: Cylindrical barrel concentric with hinge pin (Y=-63.5, Z=0.0, R=3.0)
    # Left lid knuckle: X in [-61, -43] (width 18mm)
    add_cylinder_x(facets, -61, -43, -W/2 - 3.5, 0.0, 3.0, segments=24)
    add_box(facets, -61, -43, -W/2 - 3.5, -W/2, 0.0, T)
    # Right lid knuckle: X in [43, 61] (width 18mm)
    add_cylinder_x(facets, 43, 61, -W/2 - 3.5, 0.0, 3.0, segments=24)
    add_box(facets, 43, 61, -W/2 - 3.5, -W/2, 0.0, T)

    # Spring Plunger Striker Pad underneath top lid (X = 78.5, Y = 40)
    add_cylinder(facets, 82.0 - 3.5, 40.0, -1.8, 0.0, 5.0, segments=24)

    write_stl('/home/sakura-madoromi/cad/top_lid.stl', facets)

# ==========================================
# 3. Sacrificial Breakaway Latch (易损断裂卡扣)
# ==========================================
def gen_breakaway_latch():
    facets = []
    # Centered at its mounting dovetail axis (0, 0, 0)
    # 1. Male Dovetail Slider (Z: 0 to 4.2, Y: -10 to 10)
    add_box(facets, -4.7, 4.7, -10, 10, 0, 4.2)
    # Flange wings
    add_box(facets, -6.6, 6.6, -10, 10, 1.8, 4.2)

    # 2. V-Groove Breakaway Neck (Z: -5 to 0, thickness notched down to 1.2mm in X)
    add_box(facets, -0.6, 0.6, -10, 10, -5, 0)

    # 3. Latch Hook Column (Z: -25 to -5)
    # Body
    add_box(facets, -4.0, 4.0, -10, 10, -25, -5)
    # Lead-in bevel at bottom
    add_box(facets, -4.0, 0.0, -10, 10, -27, -25)

    # Cutout Slot for servo locking tongue:
    # Cavity facing +X at Z in [-18, -13], Y in [-5, 5]
    # We hollow it by subtracting/leaving space or building side blocks:
    # Remove interior by constructing around cavity:
    # Front/Back walls of hook cavity:
    # (The hook has solid back at -X, solid ends in Y, open pocket at +X)
    add_box(facets, 1.0, 4.0, -10, -5, -18, -13)
    add_box(facets, 1.0, 4.0, 5, 10, -18, -13)

    write_stl('/home/sakura-madoromi/cad/breakaway_latch.stl', facets)

# ==========================================
# 4. Servo Locking Cam Horn (舵机旋转锁舌)
# ==========================================
def gen_servo_cam():
    facets = []
    # Hub center at (0, 0, 0)
    # 1. Central Spline Hub
    add_cylinder_hollow(facets, 0, 0, 0, 3.5, 4.5, 2.4, segments=24)

    # 2. Rotating Arm (extends from hub along -X towards latch by 14.0mm)
    add_box(facets, -14.0, 0.0, -2.8, 2.8, 0, 3.0)

    # 3. Locking Tongue Tip (enters the latch cavity at X=81.0, reaching X=79.0)
    add_box(facets, -16.0, -12.5, -2.2, 2.2, 0, 2.8)
    # Beveled lead-in edge
    add_box(facets, -17.5, -16.0, -1.8, 1.8, 0, 2.2)

    write_stl('/home/sakura-madoromi/cad/servo_cam.stl', facets)

# ==========================================
# 5. Servo M2 Fasteners Hardware (内六角圆柱头螺栓与六角螺母)
# ==========================================
def gen_servo_hardware():
    # A. 2x M2 Socket Head Cap Screws (DIN 912)
    f_screws = []
    for hx in [86.9, 114.9]:
        # Head (OD 3.8mm, H 2.0mm at Z: 23.4 to 25.4)
        add_cylinder(f_screws, hx, 20.0, 23.4, 25.4, 1.9, segments=24)
        # Inner Hex Socket recess imitation (rim)
        add_box(f_screws, hx - 0.7, hx + 0.7, 20.0 - 0.7, 20.0 + 0.7, 25.0, 25.4)
        # Threaded Shank (OD 2.0mm, Z: 12.5 to 23.4)
        add_cylinder(f_screws, hx, 20.0, 12.5, 23.4, 1.0, segments=20)
    write_stl('/home/sakura-madoromi/cad/components/m2_screws.stl', f_screws)

    # B. 2x M2 Hex Nuts (DIN 934, flat-to-flat 4.0mm, thickness 1.6mm at Z: 13.6 to 15.2)
    f_nuts = []
    for hx in [86.9, 114.9]:
        r_nut = 4.0 / math.cos(math.radians(30)) / 2.0 # 2.31mm
        add_cylinder_hollow(f_nuts, hx, 20.0, 13.6, 15.2, r_nut, 1.0, segments=6)
    write_stl('/home/sakura-madoromi/cad/components/m2_nuts.stl', f_nuts)

    # C. Keep dummy servo_clamp.stl so legacy links don't 404
    f_dummy = []
    add_box(f_dummy, -1, 1, -1, 1, -1, 1)
    write_stl('/home/sakura-madoromi/cad/servo_clamp.stl', f_dummy)

# ==========================================
# 6. Electronic Components Standard STLs
# ==========================================
def gen_components():
    os.makedirs('/home/sakura-madoromi/cad/components', exist_ok=True)
    
    # A. MG90S Servo
    f_servo = []
    add_box(f_servo, -11.4, 11.4, -6.1, 6.1, 0, 28.5)
    add_box(f_servo, -16.25, 16.25, -6.0, 6.0, 17.5, 20.0)
    add_cylinder(f_servo, -5.9, 0, 28.5, 32.5, 2.4, segments=24)
    write_stl('/home/sakura-madoromi/cad/components/mg90s_servo.stl', f_servo)

    # B. ESP32-C3 SuperMini
    f_esp = []
    add_box(f_esp, -11.25, 11.25, -9.0, 9.0, 0, 1.2)
    add_box(f_esp, -8.0, 4.0, -5.0, 5.0, 1.2, 3.0)
    add_box(f_esp, 4.75, 12.25, -4.5, 4.5, 1.2, 4.4)
    write_stl('/home/sakura-madoromi/cad/components/esp32_c3.stl', f_esp)

    # C. 18650 Battery (Centered at origin along Z for rock-solid Three.js placement)
    f_bat = []
    add_cylinder(f_bat, 0, 0, -32.5, 32.5, 9.2, segments=32)
    add_cylinder(f_bat, 0, 0, 32.5, 34.0, 3.0, segments=20)
    write_stl('/home/sakura-madoromi/cad/components/battery_18650.stl', f_bat)

    # D. 0.96" OLED Display (Pre-aligned for vertical mounting inside right wall)
    # Thickness along X: [-3.0, 0.0] (Glass flush with inner wall at X=0, PCB behind at X=[-3.0, -1.4])
    # Width along Y: [-13.5, 13.5] (27.0mm span)
    # Height along Z: [-13.5, 13.5] (27.0mm span)
    f_oled = []
    # 1. PCB Base
    add_box(f_oled, -3.0, -1.4, -13.5, 13.5, -13.5, 13.5)
    # 2. Glass Display Screen (flush at X=0.0)
    add_box(f_oled, -1.4, 0.0, -13.0, 13.0, -11.0, 4.0)
    # 3. Top I2C 4-Pin Header
    add_box(f_oled, -5.5, -3.0, -5.5, 5.5, 9.5, 13.0)
    write_stl('/home/sakura-madoromi/cad/components/oled_096.stl', f_oled)

if __name__ == '__main__':
    gen_base_box()
    gen_top_lid()
    gen_breakaway_latch()
    gen_servo_cam()
    gen_servo_hardware()
    gen_components()
