include <../../../hardware/v3/cad/assembly.scad>
view="metadata";
lid_angle=105; intersection(){union(){for(dy=[.25:.5:9.75])translate([0,dy,0]){hinge_guard(-1);hinge_guard(1);}} named("keeper_service_surround");}