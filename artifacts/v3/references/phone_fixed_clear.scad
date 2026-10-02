include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
intersection(){reference_phone();for(p=assembly_parts)if(p!="lid"&&p!="window_grille"&&p!="latch"&&p!="latch_retainer")named(p);for(p=hardware_parts)if(p!="acrylic"&&p!="cover_magnet"&&p!="inserts_lid")named(p);}
