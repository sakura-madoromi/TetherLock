include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";lid_angle=105;travel=0;
intersection(){translate([-180,0,0])minkowski(){hinge_pin();cube([180,.000001,.000001]);}named("pin_service_surround");}
