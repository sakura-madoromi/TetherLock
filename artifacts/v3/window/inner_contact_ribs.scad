include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){window_grille();for(x=window_bar_x)translate([x-1,-2,50.45])cube([2,4,.05]);}
