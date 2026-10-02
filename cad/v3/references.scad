// Generated from engineering/references.json; do not edit.
// SHA256 f9069af00d99415f6bf80c07423463d1202e891299ade11124e069a9ba9990c0
// Visual corner/platform profiles are approximate. Dimensions are nominal mm.
module reference_phone() {
 translate([-23,0,0]) union() {
  translate([0,0,9.43]) linear_extrude(height=8.75)
   offset(r=12) square([139.4,54.0],center=true);
  translate([-55.7,0,6.88])
   linear_extrude(height=2.55) offset(r=9) square([28,56],center=true);
  translate([-67.33,-24.630000000000003,5]) cylinder(d=16.2,h=1.88,$fn=64);
  translate([-48.09,-24.630000000000003,5]) cylinder(d=16.2,h=1.88,$fn=64);
  translate([-57.71000000000001,-6.640000000000001,5]) cylinder(d=16.2,h=1.88,$fn=64);
  translate([-50.870000000000005,-39.45,12.475]) cube([6.9,.45,2.66]);
  translate([-38.870000000000005,-39.45,12.475]) cube([11.2,.45,2.66]);
  translate([-24.67,-39.45,12.475]) cube([11.2,.45,2.66]);
  translate([-35.02,39.0,12.475]) cube([17.7,.45,2.66]);
  translate([21.56999999999999,39.0,12.475]) cube([17.1,.45,2.66]);
 }
}
module reference_card() {
 translate([-7,0,18.18])
 linear_extrude(height=0.76) offset(r=3.18)
 square([79.24,47.62],center=true);
}
