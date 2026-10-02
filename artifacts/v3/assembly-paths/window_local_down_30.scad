include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";lid_angle=105;travel=0;
intersection(){lid_turn(105)translate([0,0,-30])minkowski(){union(){window_grille();acrylic();}cube([.000001,.000001,30]);}named("window_service_surround");}
