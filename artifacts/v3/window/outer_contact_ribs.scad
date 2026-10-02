include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){lid();for(x=window_bar_x)translate([x-1,-2,52])cube([2,4,.05]);}
