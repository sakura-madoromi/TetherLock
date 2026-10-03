include <../../../hardware/v3/cad/assembly.scad>
view="metadata";
intersection(){translate([0,.19,0])hinge_pin();union(){hinge_guard(-1);hinge_guard(1);}}