include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){lid();for(p=[[-94,-43],[39,-43],[-94,45],[39,45]])translate([p[0]+2,p[1]-1,50])cube([2,2,.2]);}
