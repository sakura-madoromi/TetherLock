include <params.scad>

module lock_base() {
 nominal_difference() {
  union() {
   cube_at([75,-46,lock_floor],[41,68,3]);
   // Continuous independent bolt support: bed, keyed rail, removable roof.
   cube_at([91,-19,lock_floor_top],[20,24.5,guide_bottom-lock_floor_top]);
   cube_at([bolt_x-key_w/2,-19,key_z0],[key_w,24.5,key_z1-key_z0]);
   for(p=guide_screws) translate([p[0],p[1],lock_floor_top-0.01]) cylinder(r=2.3,h=guide_top-lock_floor_top+0.01);
   for(p=motor_screws) translate([p[0],p[1],lock_floor_top-0.01]) cylinder(r=2.2,h=motor_clamp_z-lock_floor_top+0.01);
   // Motor cradle and front locating shoulder; clamp presses through thin pads.
   cube_at([77.2,-41.8,32.4],[14.6,27.5,motor_bottom-0.3-32.4]);
   cube_at([77.2,-16,32.4],[14.6,2.3,motor_clamp_z-32.4]);
   // Blind front socket: usable bore ends Y=19.8; last 1 mm is solid.
   cube_at([bolt_x-6,14.8,32.4],[12,6,11.6]);
  }
  // Conservative 25x12x10 body; includes the 2.5mm output offset.
  cube_at([screw_x-motor_w/2-0.3,motor_front-motor_l-0.3,motor_bottom-0.3],[motor_w+0.6,motor_l+0.6,motor_h+0.6]);
  yhole(screw_x,-16.3,axis_z,4.7,4);
  // Top-open U seat permits vertical insertion of motor + threaded drive.
  cube_at([screw_x-2.35,-16.3,axis_z],[4.7,4,motor_clamp_z-axis_z+0.2]);
  cube_at([bolt_x-latch_hole/2,13.8,axis_z-latch_hole/2],[latch_hole,6,latch_hole]);
  for(p=lock_mounts) pilot(p,29.2,32.6,2.4);
  for(p=guide_screws) pilot(p,33.2,43.1);
  for(p=motor_screws) pilot(p,motor_clamp_z-6,motor_clamp_z+0.2);
  // Flat reusable rail for future mechanical feedback adapters (SKU pending).
  for(y=[-12,2]) for(x=[112,115]) cube_at([x,y,29.2],[tie_slot_width,5,3.5]);
  // Wiring channels; no closed tunnel around the actuator.
  cube_at([110,15,29.2],[3,7.2,3.5]);
 }
}
module guide_cap() {
 nominal_difference() {
  cube_at([92,-20.5,guide_top],[23,26,guide_cap_t]);
  for(p=guide_screws) pilot(p,42.7,45.1,2.4);
 }
}
module motor_clamp() {
 nominal_difference() {
  cube_at([73.8,-35,motor_clamp_z],[21.4,16,2]);
  for(p=motor_screws) pilot(p,motor_clamp_z-0.2,motor_clamp_z+2.2,2.4);
  cube_at([90.8,-20.7,motor_clamp_z-0.2],[4.6,1.8,2.4]);
 }
}
module bolt_raw(t=0) {
 rear=bolt_back+t;
 nominal_difference() {
  union() {
   cube_at([bolt_x-body_w/2,rear-4,axis_z-body_w/2],[body_w,body_l+4,body_w]);
   cube_at([bolt_x-3,rear+body_l,axis_z-3],[6,tongue_l-taper_l+0.01,6]);
   translate([bolt_x,rear+body_l+tongue_l-taper_l,axis_z]) rotate([-90,0,0])
    linear_extrude(height=taper_l,scale=5/6) square([6,6],center=true);
   // Fork overlaps the main body; lateral/vertical float around the drive finger.
   cube_at([92,rear,axis_z-body_w/2],[7.6,6,body_w]);
  }
  cube_at([91,rear+1.7,35.2],[8.6,2.6,5.6]);
  cube_at([bolt_x-(key_w+0.6)/2,rear-4.1,33.2],[key_w+0.6,body_l+4.2,1.6]);
 }
}
module bolt(t=0,shift=0) { translate([0,0,shift]) bolt_raw(t); }
module nut_carriage(t=0) {
 rear=carriage_back+t;
 nominal_difference() {
  union() {
   cube_at([screw_x-7,rear-2,33.4],[13,10,10.6]);
   cube_at([screw_x+4.5,rear-1.5,36],[8.7,2,4]);
  }
  yhole(screw_x,rear-3,axis_z,shaft_d+0.4,12);
  translate([screw_x,rear+nut_slot_y,axis_z]) rotate([-90,0,0]) {
   cylinder(d=nut_slot_d,h=nut_slot_t,$fn=6);
   cylinder(d=nut_flange_d+0.4,h=nut_flange_t+0.2);
  }
  // Wide open top access for the nut: larger than its circumdiameter.
  cube_at([screw_x-5.3,rear+nut_slot_y,axis_z],[10.6,nut_slot_t,6.2]);
  for(x=[screw_x-4.5,screw_x+4.5]) zhole(x,rear-0.2,39.5,1.7,4.7);
 }
}
module nut_cap(t=0) {
 rear=carriage_back+t;
 nominal_difference() {
  cube_at([screw_x-6.5,rear-2,44],[12.5,10,2]);
  for(x=[screw_x-4.5,screw_x+4.5]) zhole(x,rear-0.2,43.8,2.4,2.4);
 }
}
module fit_bar() { cube([tongue_w,tongue_w,25]); }
module fit_gauge() {
 nominal_difference() {
  cube([30,14,8]);
  for(i=[0:2]) cube_at([2+i*9,3,-0.1],[6.4+i*0.2,6.4+i*0.2,8.2]);
 }
}
