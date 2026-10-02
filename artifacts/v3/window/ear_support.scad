include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){window_grille();for(p=window_clamps)translate([p[0]+2,p[1]-1,49.7])cube([2,2,.2]);}
