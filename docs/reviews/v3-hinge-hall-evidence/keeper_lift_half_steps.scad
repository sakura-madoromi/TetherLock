include <../../../hardware/v3/cad/assembly.scad>
view="metadata";
lid_angle=105; intersection(){union(){for(dz=[.5:1:29.5])translate([0,10,dz]){hinge_guard(-1);hinge_guard(1);}} named("keeper_service_surround");}