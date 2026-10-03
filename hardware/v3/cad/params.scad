// TetherLock V3 STRUCTURAL PROTOTYPE. mm / degrees. Hardware SKUs NOT frozen.
// World: X long direction; +Y front; Z bottom=0. Closed assembly <=240x120x55.
$fn=48;
L=240; W=120; H=55;
wall=3; floor_t=3; shell_top=51; lid_bottom=51.4;
divider_x=72; divider_t=3;
hinge_y=-55; hinge_z=51; hinge_od=8; hinge_bore=2.4;
fixed_knuckles=[[-102,-90],[-30,-18],[42,54]];
moving_knuckles=[[-89.6,-78],[-17.6,-6],[54.4,66]];
hinge_pin_x=-107; hinge_pin_len=180;
keeper_x=[-108,77.5]; keeper_y=-50.5;
pin_end_play=0.5; keeper_wall=1.5;
insert_od=3.2; insert_len=4; insert_pilot_d=2.9;
$print_bores=false;
function insert_hole_d() = $print_bores ? insert_pilot_d : insert_od+0.05;
stroke=14;
bolt_x=103; axis_z=38; bolt_back=-14.5; carriage_back=-11;
body_w=9.2; body_l=6; tongue_w=6; tongue_l=13.5; taper_l=0.8;
guide_clearance=0.3;
screw_x=84.5; motor_front=-15;
// Seller image: gearbox 9; motor text 16 vs drawing 15; reserve 25 total.
// Output offset 2.5: rotate motor about its shaft so body is ABOVE the axis.
motor_l=25; motor_w=12; motor_h=10; motor_axis_offset=2.5;
shaft_l=55; shaft_d=4; shaft_pitch=0.7; shaft_length_tolerance=1;
motor_bottom=axis_z+motor_axis_offset-motor_h/2;
motor_top=motor_bottom+motor_h; motor_clamp_z=motor_top+0.3;
// Supplier flange nut NOT dimensioned: conservative adjustable candidate.
nut_af=7; nut_flange_d=10; nut_height=5; nut_flange_t=1;
// R16-503 drawing; threaded mounting diameter remains provisional 16mm.
button_y=30; button_z=40.5; button_panel_x=114;
button_hole_d=16.4; button_body_d=15.8; button_flange_d=17.8;
button_body_l=18.3; button_terminal_l=6; button_face_l=5.7;
tie_width=2.5; tie_slot_width=3.0;
lock_floor=29.4; lock_floor_top=32.4;
guide_bottom=33.1; guide_top=42.9; guide_cap_t=2;
key_w=2.8; key_z0=33.0; key_z1=34.5;
nut_slot_d=nut_af/cos(30)+0.4; nut_slot_y=1.5; nut_slot_t=nut_height+0.4;
latch_y=6; latch_t=5; latch_hole=6.8;
latch_z0=32.6; latch_neck_w=6;
retainer_z=45.2; retainer_t=1.5;
window_x0=-100; window_x1=45; window_y0=-38; window_y1=40;
window_clamps=[[-94,-43],[39,-43],[-94,45],[39,45]];
window_bar_x=[-76,-52,-28,-4,20]; window_bar_w=5; window_root_r=2;
window_outer_z=52; window_pane_t=1.5;
window_pane_z=window_outer_z-window_pane_t;
// Pane contact and screw ears are independent: preload is carried by the ears.
window_inner_z=47.4; window_inner_t=3.1;
window_inner_top=window_inner_z+window_inner_t;
window_ear_t=2.5; window_ear_top=window_inner_z+window_ear_t;
assert(window_inner_z>=47,"Window grille must preserve storage headroom");
lock_mounts=[[77,-43],[113,-43],[77,19],[113,19]];
guide_screws=[[93.5,-18],[114,-18],[114,-2]];
motor_screws=[[76,-27],[93,-27]];
battery_screws=[[90,-54],[117,-54],[90,24],[117,24]];
tray_screws=[[76,27],[115,51]];
deck_screws=[[97.5,27],[115,50.8]];
print_parts=["base_box","lid","lock_base","guide_cap","motor_clamp",
 "bolt","nut_carriage","nut_cap","latch","latch_retainer","window_grille",
 "battery_hatch","electronics_tray","upper_deck","esp_clip","upper_clip",
 "oled_bridge","hinge_guard_left","hinge_guard_right","fit_bar","fit_gauge",
 "insert_coupon","keeper_insert_coupon","window_insert_coupon","hinge_bore_coupon"];
assembly_parts=["base_box","lid","lock_base","guide_cap","motor_clamp",
 "bolt","nut_carriage","nut_cap","latch","latch_retainer",
 "window_grille",
 "battery_hatch","electronics_tray","upper_deck","esp_clip","upper_clip","oled_bridge",
 "hinge_guard_left","hinge_guard_right"];
hardware_parts=["motor","drive_nut","battery_holder","esp","power_board",
 "bridge_board","oled","button","acrylic","hinge_pin","inserts_fixed","inserts_lid",
 "battery_connector",
 "motor_pads","board_pads"];
// All holes below are pilot/clearance geometry, not modelled screw threads.
module feature(axis,center,d,h,kind="clearance",details=[]) {
 if(!is_undef($export_features) && $export_features)
  echo(["TL_FEATURE",$feature_part,axis,center,d,h,kind,details]);
}
// These wrappers keep CAD feature dimensions attached to the geometry that uses
// them. The boolean operation is part of the export, not guessed from a mesh.
module nominal_difference() {
 base=is_undef($feature_operation)?"solid":$feature_operation;
 difference() {
  let($feature_operation=base) children(0);
  if($children>1) for(i=[1:$children-1])
   let($feature_operation=base=="solid"?"cut":"solid") children(i);
 }
}
module cube_at(position,size) {
 feature("BOX",position,0,0,"box",[size,is_undef($feature_operation)?"solid":$feature_operation]);
 translate(position) cube(size);
}
module zhole(x,y,z,d,h) {
 feature("Z",[x,y,z],d,h,is_undef($feature_kind)?(d<2?"pilot":"clearance"):$feature_kind);
 translate([x,y,z]) cylinder(d=d,h=h);
}
module yrod(x,y,z,d,h) { translate([x,y,z]) rotate([-90,0,0]) cylinder(d=d,h=h); }
module xrod(x,y,z,d,h) { translate([x,y,z]) rotate([0,90,0]) cylinder(d=d,h=h); }
module yhole(x,y,z,d,h,kind="clearance") { feature("Y",[x,y,z],d,h,kind); yrod(x,y,z,d,h); }
module xhole(x,y,z,d,h,kind="clearance") { feature("X",[x,y,z],d,h,kind); xrod(x,y,z,d,h); }
module countersink(x,y,z,d1,d2,h) {
 feature("Z",[x,y,z],d1,h,"countersink",[d2]);
 translate([x,y,z]) cylinder(d1=d1,d2=d2,h=h);
}
module rounded_rect(l,w,r) { offset(r=r) square([l-2*r,w-2*r],center=true); }
module lid_turn(a) { translate([0,hinge_y,hinge_z]) rotate([a,0,0]) translate([0,-hinge_y,-hinge_z]) children(); }
module pilot(xy,z0,z1,d=1.7) { let($feature_kind=d<2?"pilot":"clearance") zhole(xy[0],xy[1],z0,d,z1-z0); }
