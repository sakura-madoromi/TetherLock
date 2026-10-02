include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";

for(mode=["print-pilot","assembly-clearance"]) {
 for(n=print_parts) let($export_features=true,$feature_part=n,$print_bores=mode=="print-pilot") {
  echo(["TL_PART",n,mode]);named(n);
 }
}
