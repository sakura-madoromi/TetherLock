// Open this file. Prototype hardware envelopes are orange; printable structure gray.
include <params.scad>
include <references.scad>
use <enclosure.scad>
use <lock.scad>
use <electronics.scad>
use <hardware.scad>
view="assembly"; part="base_box"; travel=0; lid_angle=0;
a="base_box"; b="bolt"; bolt_shift_z=0; bolt_shift_x=0; item_raise=0; battery_raise=0; nut_raise=0; drive_raise=0;
window_raise=0;
show_hardware=true; show_fasteners=true;

module named(n) {
 if(n=="base_box") base_box();
 else if(n=="lid") lid_turn(lid_angle) lid();
 else if(n=="latch") lid_turn(lid_angle) latch();
 else if(n=="latch_retainer") lid_turn(lid_angle) latch_retainer();
 else if(n=="window_grille") lid_turn(lid_angle) window_grille();
 else if(n=="battery_hatch") battery_hatch();
 else if(n=="lock_base") lock_base();
 else if(n=="guide_cap") guide_cap();
 else if(n=="motor_clamp") motor_clamp();
 else if(n=="bolt") translate([bolt_shift_x,0,0]) bolt(travel,bolt_shift_z);
 else if(n=="nut_carriage") nut_carriage(travel);
 else if(n=="nut_cap") nut_cap(travel);
 else if(n=="electronics_tray") electronics_tray();
 else if(n=="upper_deck") upper_deck();
 else if(n=="esp_clip") esp_clip();
 else if(n=="upper_clip") upper_clip();
 else if(n=="oled_bridge") oled_bridge();
 else if(n=="motor") motor();
 else if(n=="shaft") shaft();
 else if(n=="drive_nut") translate([0,0,nut_raise]) drive_nut(travel);
 else if(n=="battery_holder") battery_holder(battery_raise);
 else if(n=="esp") esp();
 else if(n=="power_board") power_board();
 else if(n=="bridge_board") bridge_board();
 else if(n=="oled") oled();
 else if(n=="button") button();
 else if(n=="acrylic") lid_turn(lid_angle) acrylic();
 else if(n=="hinge_pin") hinge_pin();
 else if(n=="inserts_fixed") inserts_fixed();
 else if(n=="inserts_lid") lid_turn(lid_angle) inserts_lid();
 else if(n=="battery_connector") battery_connector();
 else if(n=="motor_pads") motor_pads();
 else if(n=="board_pads") board_pads();
 else if(n=="hinge_guard_left") hinge_guard(-1);
 else if(n=="hinge_guard_right") hinge_guard(1);
 else if(n=="insert_coupon") insert_coupon();
 else if(n=="keeper_insert_coupon") keeper_insert_coupon();
 else if(n=="window_insert_coupon") window_insert_coupon();
 else if(n=="hinge_bore_coupon") hinge_bore_coupon();
 else if(n=="item") translate([-115.5,-47.5,5+item_raise]) cube([185,95,40]);
 else if(n=="fit_bar") fit_bar();
 else if(n=="fit_gauge") fit_gauge();
 else if(n=="moving_lid") {
  for(p=["lid","latch","latch_retainer","window_grille","acrylic","inserts_lid"]) named(p);
  if(show_fasteners) lid_turn(lid_angle) lid_fasteners();
 }
 else if(n=="lock_all") {
  for(p=["lock_base","guide_cap","motor_clamp","bolt","nut_carriage","nut_cap","motor","drive_nut","motor_pads"]) named(p);
 }
 else if(n=="electronics_all") {
  for(p=["electronics_tray","upper_deck","esp_clip","upper_clip","oled_bridge","esp","power_board","bridge_board","oled","button","battery_connector","board_pads"]) named(p);
 }
 else if(n=="drive_install") translate([0,0,drive_raise]) { for(p=["motor","nut_carriage","nut_cap","drive_nut","bolt"]) named(p); moving_fasteners(travel); }
 else if(n=="drive_install_surround") { named("base_box"); named("lock_base"); named("electronics_all"); named("moving_lid"); }
 else if(n=="stationary_extras") { for(p=["hinge_guard_left","hinge_guard_right","hinge_pin","battery_hatch","battery_holder"]) named(p); }
 else if(n=="keeper_service_surround" || n=="pin_service_surround") {
  for(p=assembly_parts) if(p!="hinge_guard_left"&&p!="hinge_guard_right") named(p);
  for(p=hardware_parts) if(n=="keeper_service_surround"||p!="hinge_pin") named(p);
 }
 else if(n=="fixed_fasteners") fixed_fasteners();
 else if(n=="nut_insert_surround") { named("base_box"); named("nut_carriage"); named("bolt"); }
 else if(n=="battery_service_surround") {
  named("base_box"); named("lock_all"); named("electronics_all");
 }
 else if(n=="whole") {
  for(p=assembly_parts) named(p);
  for(p=hardware_parts) named(p);
 }
 else if(n=="window_install") lid_turn(lid_angle) translate([0,0,window_raise]) {
  window_grille(); acrylic();
 }
 else if(n=="window_service_surround") {
  for(p=assembly_parts) if(p!="window_grille") named(p);
  for(p=hardware_parts) if(p!="acrylic") named(p);
  fixed_fasteners();moving_fasteners(travel);
  // The four window screws are removed for service; retain the latch screws.
  lid_turn(lid_angle) for(s=fastener_specs("lid")) if(s[8][0]=="latch_retainer") render_screw(s);
 }
 else assert(false,str("Unknown part: ",n));
}
module print_part(n) {
 let($print_bores=true)
 if(n=="lid") translate([0,0,H]) rotate([180,0,0]) lid();
 else if(n=="window_insert_coupon") translate([0,0,5.1]) rotate([180,0,0]) window_insert_coupon();
 else if(n=="bolt") translate([-101.25,6.75,-33.4]) bolt();
 else if(n=="latch") translate([-bolt_x,40,-latch_y]) rotate([90,0,0]) latch();
 else {
  z0 = n=="base_box" || n=="battery_hatch" || n=="fit_bar" || n=="fit_gauge" ? 0 :
       n=="lock_base" ? lock_floor : n=="guide_cap" ? guide_top :
       n=="motor_clamp" ? motor_clamp_z : n=="nut_carriage" ? 33.4 : n=="nut_cap" ? 44 :
       n=="latch_retainer" ? retainer_z : n=="window_grille" ? window_inner_z :
       n=="electronics_tray" ? 5.4 : n=="upper_deck" ? 18 :
       n=="esp_clip" ? 14.8 : n=="upper_clip" ? 27.6 : n=="oled_bridge" ? 49.2 : n=="hinge_guard_left"||n=="hinge_guard_right" ? 48.3 : 0;
  translate([0,0,-z0]) named(n);
 }
}
module fastener_conflicts() {
 for(kind=["fixed","drive","lid"]) for(s=fastener_specs(kind,travel)) {
  intersection() {
   named("whole");
   if(kind=="lid") lid_turn(lid_angle) difference() {
    render_screw(s);
    // Check a fixed-angle mating pose within the rotated local group.
    for(n=s[8]) if(n=="lid") lid(); else if(n=="latch_retainer") latch_retainer(); else if(n=="window_grille") window_grille();
   }
   else difference() { render_screw(s); for(n=s[8]) named(n); }
  }
 }
}
// Straight 4 mm driver envelopes above installed heads, with lid opened.
module tool_conflicts() {
 intersection() {
  named("whole");
  union() {
   for(p=guide_screws) zhole(p[0],p[1],46.5,4,30);
   for(p=motor_screws) zhole(p[0],p[1],motor_clamp_z+3.6,4,30);
   for(x=[screw_x-4.5,screw_x+4.5]) zhole(x,carriage_back+travel-0.2,47.6,4,30);
   for(x=[86.8,115.8]) zhole(x,56.3,51.2,4,30);
  }
 }
}
module window_tool_conflicts() {
 intersection() {
  named("whole");
  lid_turn(lid_angle) for(p=window_clamps) zhole(p[0],p[1],window_inner_z-30,4,29.95);
 }
}
module keeper_tool_conflicts() {
 intersection() {
  named("whole");
  for(x=keeper_x) zhole(x,keeper_y,51.15,4,30);
 }
}
module assembled() {
 color([0.73,0.77,0.82]) named("base_box");
 color([0.73,0.77,0.82]) {named("lid");named("window_grille");}
 for(p=assembly_parts) if(p!="base_box" && p!="lid" && p!="window_grille") color(p=="latch"?[0.95,0.4,0.25]:p=="bolt"?[0.3,0.6,0.9]:[0.57,0.65,0.7]) named(p);
 if(show_hardware) for(p=hardware_parts)
  color(p=="acrylic"?[0.4,0.8,0.95,0.28]:p=="battery_holder"?[0.25,0.68,0.5]:[0.9,0.66,0.3]) named(p);
 if(show_fasteners) { fixed_fasteners(); moving_fasteners(travel); lid_turn(lid_angle) lid_fasteners(); }
}
module exploded() {
 color([0.73,0.77,0.82]) base_box();
 translate([0,0,100]) color([0.73,0.77,0.82]) lid();
 translate([0,0,75]) color([0.4,0.8,0.95,0.3]) acrylic();
 translate([0,0,50]) color([0.9,0.4,0.3]) { latch(); latch_retainer(); }
 translate([0,0,45]) color([0.73,0.77,0.82]) window_grille();
 translate([0,0,15]) color([0.6,0.65,0.7]) lock_base();
 translate([0,0,35]) { bolt(); nut_carriage(); motor(); drive_nut(); }
 translate([0,0,50]) { guide_cap(); motor_clamp(); nut_cap(); }
 translate([0,0,-35]) color([0.25,0.68,0.5]) battery_holder();
 translate([0,0,-65]) battery_hatch();
 translate([0,0,15]) { electronics_tray(); upper_deck(); esp(); power_board(); bridge_board(); oled(); }
}
if(view=="metadata") echo([["print_parts",print_parts],["assembly_parts",assembly_parts],
 ["hardware_parts",hardware_parts],["stroke",stroke],["closed_min",[-120,-60,0]],
 ["closed_max",[120,60,55]],["hinge_y",hinge_y],["hinge_z",hinge_z]]);
else if(view=="part") named(part);
else if(view=="print") print_part(part);
else if(view=="intersection") intersection() { named(a); named(b); }
else if(view=="fastener_check") fastener_conflicts();
else if(view=="tool_check") tool_conflicts();
else if(view=="exploded") exploded();
else if(view=="lock") { named("lock_all"); for(s=fastener_specs("fixed")) if(s[8][0]=="lock_base" || s[8][0]=="guide_cap" || s[8][0]=="motor_clamp") render_screw(s); moving_fasteners(travel); }
else if(view=="assembly") assembled();
else assert(false,str("Unknown view: ",view));
