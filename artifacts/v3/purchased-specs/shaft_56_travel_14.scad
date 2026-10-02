include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
travel=14; intersection(){shaft();for(p=assembly_parts)named(p);for(p=hardware_parts)if(p!="motor")named(p);}
