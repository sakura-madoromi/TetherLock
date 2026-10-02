include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){window_grille();for(p=[[-94,-43],[39,-43],[-94,45],[39,45]])translate([p[0],p[1],47.45])cylinder(d=3.8,h=.05,$fn=48);}
