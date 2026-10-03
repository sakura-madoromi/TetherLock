include <params.scad>

module electronics_tray() {
 nominal_difference() {
  union() {
   cube_at([74.5,25.5,5.4],[42,27,2]);
   cube_at([74.5,25.5,7.3],[2.5,27,0.7]);
   cube_at([114,25.5,7.3],[2.5,27,0.7]);
   for(p=deck_screws) translate([p[0],p[1],7.3]) cylinder(r=1.3,h=10.7);
   for(x=[76.2,96.7]) cube_at([x-1.2,37,7.3],[2.4,4,7.5]);
  }
  for(p=tray_screws) pilot(p,5.2,8.2,2.4);
  for(x=[90,117]) zhole(x,24,5.2,6.4,3.2);
  for(p=deck_screws) pilot(p,13,18.2,1.7);
  for(x=[76.2,96.7]) zhole(x,39,9.8,1.7,5.2);
  // Tie slots for the lower power board; underside remains accessible off-box.
  for(x=[99.5,112.75]) cube_at([x,33,5.2],[tie_slot_width,8,3.2]);
 }
}
module upper_deck() {
 nominal_difference() {
  union() {
   cube_at([96,25.3,18],[21,27.2,1.8]);
   cube_at([96,27,19.7],[2.3,24,1.8]);
   cube_at([114.3,27,19.7],[2.7,24,1.8]);
   for(x=[97,115]) cube_at([x-1.3,36,19.7],[2.6,4,7.9]);
  }
  for(p=deck_screws) pilot(p,17.8,20,2.4);
  zhole(96.7,39,17.8,4,0.6);
  for(x=[97,115]) zhole(x,38,22.3,1.7,5.5);
 }
}
module esp_clip() {
 nominal_difference() {
  cube_at([74.5,37,14.8],[24,4,2]);
  for(x=[76.2,96.7]) zhole(x,39,14.6,2.4,2.4);
 }
}
module upper_clip() {
 nominal_difference() {
  cube_at([95.5,36,27.6],[21.5,4,2]);
  for(x=[97,115]) zhole(x,38,27.4,2.2,2.4);
 }
}
module oled_bridge() {
 nominal_difference() {
  cube_at([84.3,52.5,49.2],[34,6.1,1.8]);
  for(x=[86.8,115.8]) {
   zhole(x,56.3,49,2.4,2.2);
   countersink(x,56.3,49.7,2.4,4,1.3);
  }
 }
}
