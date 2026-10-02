include <../../../cad/v3/assembly.scad>
view="metadata";
intersection(){translate([0,.2,0])hinge_pin();union(){hinge_guard(-1);hinge_guard(1);}}