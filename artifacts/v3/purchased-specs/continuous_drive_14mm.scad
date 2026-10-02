include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){minkowski(){union(){for(p=["bolt", "nut_carriage", "nut_cap", "drive_nut"])named(p);moving_fasteners(0);}cube([.000001,stroke,.000001]);}union(){for(p=concat(assembly_parts,hardware_parts))if(!(p=="bolt"||p=="nut_carriage"||p=="nut_cap"||p=="drive_nut"))named(p);fixed_fasteners();lid_fasteners();}}
