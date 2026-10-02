include <../../../cad/v3/assembly.scad>
view="metadata"; // Suppress the normal assembly output; retain exact named geometry.
 moving=["bolt","nut_carriage","nut_cap","drive_nut"]; intersection(){union(){for(p=moving)named(p);moving_fasteners(travel);}union(){for(p=concat(assembly_parts,hardware_parts))if(p!="bolt" && p!="nut_carriage" && p!="nut_cap" && p!="drive_nut")named(p);fixed_fasteners();}}
