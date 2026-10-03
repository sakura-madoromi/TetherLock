include <../../../hardware/v3/cad/assembly.scad>
view="metadata";
lid_angle=105; intersection(){translate([0,0,5]){hinge_guard(-1);hinge_guard(1);}named("keeper_service_surround");}