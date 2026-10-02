include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){window_grille();for(p=window_clamps)translate([p[0]-2,p[1]-2,49.9])cube([4,4,.6]);}
