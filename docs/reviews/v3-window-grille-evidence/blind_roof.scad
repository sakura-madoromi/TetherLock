include <../../../hardware/v3/cad/assembly.scad>
view="metadata";
intersection(){lid();for(p=window_clamps)translate([p[0]-.3,p[1]-.3,54.4])cube([.6,.6,.3]);}
