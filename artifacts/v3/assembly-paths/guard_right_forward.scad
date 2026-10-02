include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";lid_angle=105;travel=0;
intersection(){minkowski(){named("hinge_guard_right");cube([.000001,10,.000001]);}named("keeper_service_surround");}
