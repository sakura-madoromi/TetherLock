include <params.scad>

module base_box() {
 nominal_difference() {
  union() {
   nominal_difference() {
    linear_extrude(height=shell_top) rounded_rect(L,W,4);
    translate([0,0,floor_t]) linear_extrude(height=49) rounded_rect(L-2*wall,W-2*wall,1);
   }
   cube_at([70.5,-57,2.9],[3,114,48.1]);
   // Stationary rear header reaches the same closed height as the lid.
   intersection() {
    cube_at([-117,-60,47],[234,9,8]);
    union() { cube_at([-118,-61,46],[236,11,5]); xrod(-118,hinge_y,hinge_z,8,236); }
   }
   for(k=fixed_knuckles) xrod(k[0],hinge_y,hinge_z,hinge_od,k[1]-k[0]);
   for(x=keeper_x) cube_at([x-4,-54,43.5],[8,6.5,4.8]);
   // Battery chamber: side/end walls and a fixed ceiling connected to outer wall.
   cube_at([90,-54.5,2.9],[2.7,79,23.1]);
   cube_at([90,-54.5,2.9],[30,2.2,23.1]);
   cube_at([90,22.3,2.9],[30,2.2,23.1]);
   cube_at([90,-54.5,26],[30,79,3.4]);
   for(p=battery_screws) translate([p[0],p[1],2.8]) cylinder(r=3,h=5.5);
   for(p=lock_mounts) if(p[0]<90) translate([p[0],p[1],2.9]) cylinder(r=3,h=26.5);
   for(p=tray_screws) translate([p[0],p[1],2.9]) cylinder(r=2.3,h=2.5);
   // OLED bottom stop and two connected side rails.
   cube_at([85.3,53,19.2],[32.4,4.1,2]);
   cube_at([85.3,53,21.1],[2.3,4.1,28.1]);
   cube_at([115.4,53,21.1],[2.3,4.1,28.1]);
   // Recessed side-wall panel: 5.7mm button face stays inside X=120.
   difference() {
    xrod(button_panel_x-3,button_y,button_z,21,120-(button_panel_x-3));
    xrod(button_panel_x,button_y,button_z,18.8,120-button_panel_x+.1);
   }

  }
  // A continuous bore is essential: otherwise the fixed header traps the pin.
  xhole(-120.1,hinge_y,hinge_z,hinge_bore,240.2);
  // Moving hinge knuckles and webs get a rectangular swept-side relief.
  for(k=moving_knuckles) cube_at([k[0]-0.3,-60.2,46.6],[k[1]-k[0]+0.6,9.8,9]);
  for(x=keeper_x) {
   cube_at([x-4.3,-58.3,48.3],[8.6,11.1,7]);
   zhole(x,keeper_y,43.8,2.4,4.6);
   let($feature_kind="insert") zhole(x,keeper_y,44.2,insert_hole_d(),4.2);
  }
  // Battery extraction aperture, and a shallow seat for the flush service plate.
  cube_at([92.7,-52.3,-0.1],[22.6,74.6,8.6]);
  cube_at([87.7,-56.3,-0.1],[31.6,82.6,3]);
  for(p=battery_screws) {
   pilot(p,2.7,8.4,2.4);
   let($feature_kind="insert") zhole(p[0],p[1],2.8,insert_hole_d(),4.1);
  }
  for(p=lock_mounts) pilot(p,26.2,29.6,1.7);
  for(p=tray_screws) pilot(p,3.1,5.6,1.7);
  // Battery connector passage enters the electronics bay, not the actuator above.
  cube_at([91,21.8,12],[7,3.4,6]);
  // Front optical window / recessed button. There is deliberately no USB hole.
  cube_at([87.7,56.7,24.5],[27.6,3.6,20.5]);
  xhole(button_panel_x-3.1,button_y,button_z,button_hole_d,3.2);
  xhole(button_panel_x,button_y,button_z,18.8,120-button_panel_x+.1);
  // PCB insertion channels; stop ledge remains below them.
  cube_at([87.3,53.2,21.3],[28.4,2.2,28.2]);
  cube_at([84.2,52.4,49.2],[34.2,6.3,1.9]);
  for(x=[86.8,115.8]) zhole(x,56.3,43,1.7,6.5);
 }
}
module lid() {
 union() {
 nominal_difference() {
  union() {
   cube_at([-120,-50.5,lid_bottom],[240,110.5,H-lid_bottom]);
   for(k=moving_knuckles) {
    xrod(k[0],hinge_y,hinge_z,hinge_od,k[1]-k[0]);
    cube_at([k[0],-53,51.4],[k[1]-k[0],4,3.6]);
   }
   // Internal T-head receiver and inside-only retainer screw lands.
   cube_at([92,3,46.7],[22,11,4.8]);
   // Inside-only hard stops carry screw preload instead of crushing the pane.
   for(p=window_clamps) cube_at([p[0]-9,p[1]-3.5,window_ear_top],[18,7,lid_bottom+0.1-window_ear_top]);
  }
  for(k=moving_knuckles) xhole(k[0]-0.1,hinge_y,hinge_z,hinge_bore,k[1]-k[0]+0.2);
  cube_at([window_x0,window_y0,window_ear_top-0.1],[window_x1-window_x0,window_y1-window_y0,H-window_ear_top+0.2]);
  // Interior rebate clears the pane; the outside grille closes it.
  cube_at([window_x0-3,window_y0-3,window_ear_top-0.1],[window_x1-window_x0+6,window_y1-window_y0+6,window_outer_z-window_ear_top+0.1]);
  cube_at([94.7,5.7,46.6],[16.6,5.6,3.7]);
  cube_at([97.2,5.7,45.8],[11.6,5.6,4.5]);
  for(x=[93.5,112.5]) zhole(x,8.5,45.8,2.4,8.4);
  for(p=window_clamps) {
   zhole(p[0],p[1],window_ear_top-0.1,2.4,54.2-window_ear_top+0.1);
   let($feature_kind="insert") zhole(p[0],p[1],window_ear_top-0.1,insert_hole_d(),4.1);
  }
 }
 // Union after cutting the opening: five short-span ribs join both edges.
 translate([0,0,window_outer_z]) linear_extrude(height=H-window_outer_z) window_grid_2d();
 }
}
module latch() {
 nominal_difference() {
  union() {
   cube_at([bolt_x-5.5,latch_y,latch_z0],[11,5,43.1-latch_z0]);
   cube_at([bolt_x-latch_neck_w/2,latch_y,43],[latch_neck_w,5,2.1]);
   cube_at([bolt_x-5.5,latch_y,45],[11,5,2.1]);
   cube_at([bolt_x-8,latch_y,47],[16,5,3]);
  }
  cube_at([bolt_x-latch_hole/2,latch_y-0.1,axis_z-latch_hole/2],[latch_hole,5.2,latch_hole]);
 }
}
module latch_retainer() {
 nominal_difference() {
  cube_at([92,3,retainer_z],[22,11,retainer_t]);
  cube_at([97.2,5.7,45],[11.6,5.6,2]);
  for(x=[93.5,112.5]) zhole(x,8.5,45,3.4,2);
 }
}
module window_grid_2d() {
 union() {
  nominal_difference() {
   translate([window_x0-3,window_y0-3]) square([window_x1-window_x0+6,window_y1-window_y0+6]);
   translate([window_x0,window_y0]) square([window_x1-window_x0,window_y1-window_y0]);
  }
  for(x=window_bar_x) {
   translate([x-window_bar_w/2,window_y0-2]) square([window_bar_w,window_y1-window_y0+4]);
   // Concave radius at all four rib roots, tangent to rib and window frame.
   for(side=[-1,1]) for(end=[0,1])
    translate([x+side*window_bar_w/2,end?window_y1:window_y0]) scale([side,end?-1:1])
     nominal_difference() { square([window_root_r,window_root_r]); translate([window_root_r,window_root_r]) circle(r=window_root_r); }
  }
 }
}
module window_grille() {
 nominal_difference() {
  union() {
   translate([0,0,window_inner_z]) linear_extrude(height=window_inner_t) window_grid_2d();
   for(p=window_clamps) cube_at([p[0]-9,p[1]-3.5,window_inner_z],[18,7,window_ear_t]);
  }
  for(p=window_clamps) {
   zhole(p[0],p[1],window_inner_z-0.1,2.4,window_inner_t+0.2);
   countersink(p[0],p[1],window_inner_z-0.01,4.2,2.4,1.31);
  }
 }
}
module battery_hatch() {
 nominal_difference() {
  union() {
   cube_at([88,-56,0],[31,82,2.6]);
   for(x=[96,112]) for(y=[-47,17]) cube_at([x-2,y-2,2.5],[4,4,1.8]);
  }
  for(p=battery_screws) {
   pilot(p,-0.1,2.8,2.4);
   countersink(p[0],p[1],-0.01,4.2,2.4,1.3);
  }
 }
}
module hinge_guard(side=-1) {
 x=side<0?keeper_x[0]:keeper_x[1];
 stop=side<0?hinge_pin_x-pin_end_play-keeper_wall:hinge_pin_x+hinge_pin_len+pin_end_play;
 nominal_difference() {
  union() {
   intersection() {
    union() {
     cube_at([x-4,-58,53],[8,7.2,2]);
     cube_at([x-4,-52,48.3],[8,1.2,6.7]);
     // End cheek remains within the fixed hinge's radial envelope.
     cube_at([stop,-58,48.3],[keeper_wall,6,6.7]);
    }
    xrod(x-4.1,hinge_y,hinge_z,8.4,8.2);
   }
   cube_at([x-4,-53.6,48.3],[8,6.1,2.8]);
  }
  zhole(x,keeper_y,48.1,2.4,3.2);
  countersink(x,keeper_y,49.8,2.4,4,1.3);
  zhole(x,keeper_y,51.09,4.2,4);
 }
}

module insert_coupon() {
 nominal_difference() {
  cube([36,12,6]);
  for(i=[0:2]) {
   zhole(6+i*12,6,1.8,2.8+i*.1,4.3);
   countersink(6+i*12,6,5.6,2.8+i*.1,3.5,.5);
  }
 }
}
module keeper_insert_coupon() {
 nominal_difference() {
  cube([8,6.5,4.8]);
  zhole(4,3.5,.3,2.4,4.6);
  zhole(4,3.5,.7,insert_pilot_d,4.2);
 }
}
module window_insert_coupon() {
 nominal_difference() {
  cube([18,7,5.1]);
  zhole(9,3.5,-.1,2.4,4.4);
  zhole(9,3.5,-.1,insert_pilot_d,4.1);
 }
}
module hinge_bore_coupon() {
 nominal_difference() {
  cube([20,30,8]);
  for(i=[0:2]) xhole(-.1,5+i*10,4,2.2+i*.2,20.2);
 }
}
