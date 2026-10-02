include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";lid_angle=105;
intersection(){minkowski(){named("hinge_guard_left");cube([.00001,10,.00001]);}named("keeper_service_surround");}
