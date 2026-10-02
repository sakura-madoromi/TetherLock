include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
lid_angle=2;intersection(){named("latch");translate([bolt_x-3,6,axis_z-3])cube([6,13,6]);}
