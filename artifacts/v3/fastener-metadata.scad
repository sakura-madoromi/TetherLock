include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
echo([for(k=["fixed","drive","lid"]) [k,fastener_specs(k),fastener_ids(k)]]);
