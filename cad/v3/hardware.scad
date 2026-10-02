include <params.scad>
use <enclosure.scad>
// PROVISIONAL purchased component envelopes; not production part drawings.
module motor() {
 union() {
  translate([screw_x-6,motor_front-motor_l,motor_bottom]) cube([12,motor_l,10]);
  yrod(screw_x,motor_front-0.1,axis_z,shaft_d,shaft_l+0.1);
  for(x=[screw_x-3,screw_x+3]) translate([x-0.5,motor_front-motor_l-2,motor_bottom+4.5]) cube([1,2.1,1]);
 }
}
module shaft() { yrod(screw_x,motor_front,axis_z,shaft_d,shaft_l); }
module drive_nut(t=0) {
 difference() {
  translate([screw_x,carriage_back+t+nut_slot_y+0.1,axis_z]) rotate([-90,0,0]) union() {
   cylinder(d=nut_af/cos(30),h=nut_height,$fn=6);
   cylinder(d=nut_flange_d,h=nut_flange_t);
  }
  yrod(screw_x,carriage_back+t+nut_slot_y,axis_z,shaft_d+0.2,nut_height+0.2);
 }
}
module battery_holder(raise=0) {
 // Conservative single envelope including cell, contacts and holder.
 translate([93.2,-52,4.5+raise]) cube([22,74,21]);
}
module esp() {
 union() {
  translate([77.5,28,8.3]) cube([17.8,22.5,1.2]);
  translate([78.5,29,9.5]) cube([15.8,20.5,5]);
  translate([81.5,47,9.5]) cube([9,5,3.3]);
 }
}
module power_board() { translate([99,29,8.3]) cube([15,20,7.2]); }
module bridge_board() { translate([98.5,29,20.3]) cube([15,20,7]); }
module oled() {
 union() {
  translate([87.6,53.5,21.5]) cube([27.8,1.6,27.3]);
  translate([88.15,55.1,25]) cube([26.7,1.4,19.3]);
  translate([96.5,50.5,46]) cube([10,3,2.8]);
 }
}
module button() {
 union() {
  xrod(button_panel_x-button_body_l,button_y,button_z,button_body_d,button_body_l);
  xrod(button_panel_x,button_y,button_z,button_flange_d,2);
  xrod(button_panel_x+2,button_y,button_z,12.9,button_face_l-2);
  // Candidate fastening nut envelope; actual nut diameter/thickness to measure.
  difference() {
   xrod(button_panel_x-6,button_y,button_z,17.8,3);
   xrod(button_panel_x-6.1,button_y,button_z,button_hole_d,3.2);
  }
  // Two terminals only; solder and bend radius need physical confirmation.
  for(y=[button_y-2.425,button_y+2.425])
   translate([button_panel_x-button_body_l-button_terminal_l,y-.3,button_z-1]) cube([button_terminal_l,.6,2]);
 }
}
module acrylic() { translate([window_x0-2,window_y0-2,window_pane_z]) cube([window_x1-window_x0+4,window_y1-window_y0+4,window_pane_t]); }
module hinge_pin() { xrod(hinge_pin_x,hinge_y,hinge_z,2,hinge_pin_len); }
module thread_insert(x,y,z) {
 difference() {
  zhole(x,y,z,insert_od,insert_len);
  zhole(x,y,z-.1,2.05,insert_len+.2);
 }
}
module inserts_fixed() {
 for(p=battery_screws) thread_insert(p[0],p[1],2.9);
 for(x=keeper_x) thread_insert(x,keeper_y,44.3);
}
module inserts_lid() {
 for(p=window_clamps) thread_insert(p[0],p[1],window_ear_top);
}
module battery_connector() { translate([91.5,22,12.5]) cube([4.3,5,5]); }
module motor_pads() {
 // 0.3 mm compressed adhesive shim specification, not unspecified empty space.
 translate([78.5,motor_front-motor_l+.1,motor_bottom-0.3]) cube([12,motor_l-.2,0.3]);
 translate([78.5,motor_front-motor_l+.1,motor_top]) cube([12,motor_l-.2,0.3]);
 difference() {
  translate([78.5,-15,motor_bottom]) cube([12,0.3,10]);
  yrod(screw_x,-15.1,axis_z,4.7,0.6);
 }
 // Rear pad clears the two solder terminals.
 difference() {
  translate([78.5,motor_front-motor_l-.3,motor_bottom]) cube([12,0.3,10]);
  translate([80,motor_front-motor_l-.4,motor_bottom+4]) cube([9,0.5,2]);
 }
}
module board_pads() {
 translate([77.5,28,7.4]) cube([17.8,22.5,0.9]);
 translate([99,29,7.4]) cube([15,20,0.9]);
 translate([98.5,29,19.8]) cube([15,20,0.5]);
}

// Illustrative screw envelopes. Intentional pilot-thread interference is excluded
// from solid collision assertions. They remain in preview, BOM and total bounds.
module screw_down(x,y,top,len,d=2,flush=false) {
 color([0.45,0.47,0.5]) {
  zhole(x,y,top-len,d,len);
  if(flush) translate([x,y,top-1.3]) cylinder(d1=d,d2=4,h=1.3);
  else zhole(x,y,top,d==3?5.5:3.6,d==3?2:1.4);
 }
}
// Canonical fastener table: x,y,z,length,diameter,flush,rotationX,headless,owners.
// Preview and interference verification consume this SAME table.
// Stable connection names: keep existing names when adapting module brackets.
function fastener_ids(kind="fixed") = kind=="drive" ? ["F-nut-cap-left","F-nut-cap-right"] :
 kind=="lid" ? ["F-latch-left","F-latch-right","F-window-rear-left","F-window-rear-right","F-window-front-left","F-window-front-right"] :
 ["F-lock-rear-left","F-lock-rear-right","F-lock-front-left","F-lock-front-right",
 "F-guide-rear-left","F-guide-rear-right","F-guide-front","F-motor-left","F-motor-right",
 "F-tray-left","F-tray-right","F-deck-left","F-deck-right","F-esp-left","F-esp-right",
 "F-driver-left","F-driver-right","F-oled-left","F-oled-right",
 "F-battery-rear-left","F-battery-rear-right","F-battery-front-left","F-battery-front-right",
 "F-hinge-left","F-hinge-right"];
function fastener_specs(kind="fixed",t=0) = kind=="drive" ?
 [for(x=[screw_x-4.5,screw_x+4.5]) [x,carriage_back+t-0.2,46,6,2,false,0,false,["nut_cap","nut_carriage"]]] :
 kind=="lid" ? concat(
 [for(x=[93.5,112.5]) [x,8.5,45.2,8,3,false,180,false,["latch_retainer","lid"]]],
 [for(p=window_clamps) [p[0],p[1],window_inner_z,6,2,true,180,false,["window_grille","lid"]]]) :
 concat(
 [for(p=lock_mounts) [p[0],p[1],32.4,6,2,false,0,false,["lock_base","base_box"]]],
 [for(p=guide_screws) [p[0],p[1],44.9,8,2,false,0,false,["guide_cap","lock_base"]]],
 [for(p=motor_screws) [p[0],p[1],motor_clamp_z+2,8,2,false,0,false,["motor_clamp","lock_base"]]],
 [for(p=tray_screws) [p[0],p[1],7.4,4,2,false,0,false,["electronics_tray","base_box"]]],
 [for(p=deck_screws) [p[0],p[1],19.8,6,2,false,0,false,["upper_deck","electronics_tray"]]],
 [for(x=[76.2,96.7]) [x,39,16.8,6,2,false,0,false,["esp_clip","electronics_tray"]]],
 [for(x=[97,115]) [x,38,29.6,6,2,false,0,false,["upper_clip","upper_deck"]]],
 [for(x=[86.8,115.8]) [x,56.3,51,6,2,true,0,false,["oled_bridge","base_box"]]],
 [for(p=battery_screws) [p[0],p[1],0,8,2,true,180,false,["battery_hatch","base_box"]]],
 [for(i=[0:1]) [keeper_x[i],keeper_y,51.1,6,2,true,0,false,[i==0?"hinge_guard_left":"hinge_guard_right","base_box","inserts_fixed"]]]);
module render_screw(s) {
 translate([s[0],s[1],s[2]]) rotate([s[6],0,0])
 if(s[7]) zhole(0,0,-s[3],s[4],s[3]);
 else screw_down(0,0,0,s[3],s[4],s[5]);
}
module fixed_fasteners() { for(s=fastener_specs("fixed")) render_screw(s); }
module moving_fasteners(t=0) { for(s=fastener_specs("drive",t)) render_screw(s); }
module lid_fasteners() { for(s=fastener_specs("lid")) render_screw(s); }
