include </home/sakura-madoromi/Github/TetherLock/cad/v3/assembly.scad>
view="metadata";
echo([
 ["closedSize",[L,W,H]],["stroke",stroke],["hinge",[hinge_y,hinge_z]],
 ["shell",[wall,floor_t,shell_top,lid_bottom]],
 ["window",[[window_x0,window_x1],[window_y0,window_y1],window_bar_x,window_bar_w,window_root_r]],
 ["windowStack",[window_inner_z,window_inner_top,window_ear_top,window_pane_z,window_outer_z,H]],
 ["windowPane",[window_x1-window_x0+4,window_y1-window_y0+4,window_pane_t]],
 ["windowConnections",window_clamps],["insert",[insert_od,insert_len,insert_pilot_d]],
 ["hingePin",[hinge_pin_x,hinge_pin_len,hinge_bore,pin_end_play]],
 ["fixedKnuckles",fixed_knuckles],["movingKnuckles",moving_knuckles],
 ["motor",[motor_l,motor_w,motor_h,motor_axis_offset,shaft_l,shaft_d,shaft_pitch]],
 ["button",[button_panel_x,button_y,button_z,button_hole_d,button_flange_d,button_body_l,button_terminal_l,button_face_l]],
 ["tie",[tie_width,tie_slot_width]],
 ["flangeNut",[nut_af,nut_flange_d,nut_height,nut_flange_t]],
 ["lockAxis",[screw_x,bolt_x,axis_z]],["guide",[guide_bottom,guide_top,guide_cap_t,guide_clearance]],
 ["nutPocket",[nut_slot_d,nut_slot_y,nut_slot_t]],
 ["lockMounts",lock_mounts],["guideScrews",guide_screws],["motorScrews",motor_screws],
 ["batteryScrews",battery_screws],["trayScrews",tray_screws],["deckScrews",deck_screws]
]);
let($export_features=true,$feature_part="thermal_insert") {inserts_fixed();inserts_lid();}
