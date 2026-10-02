include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";lid_angle=105;travel=0;
intersection(){translate([0,10,0])minkowski(){named("hinge_guard_left");cube([.000001,.000001,30]);}named("keeper_service_surround");}
