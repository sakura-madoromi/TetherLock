Independent hinge/Hall review — final CAD recheck, 2026-10-01

No critical or important nominal CAD issue remains. No physical magnetic, thermal-insert strength, or print-strength validation is claimed.

All reported findings were addressed: bench acceptance sweeps through first actual bolt interference in both directions with measured margin; .3deg clear/.4deg interference are explicitly asserted; BOM and printing instructions identify separate left/right keepers; keeper installed insert wall is now1.375mm minimum, with matching post coupon; window coupon now uses the actual lid print orientation.

Fresh final-source OpenSCAD evidence (scripts and outputs isolated in this directory):
- results.json: base_box, lid, both keepers each one connected watertight solid; base envelope240x120x55; keeper top55. Continuous full axial steel-cylinder removal swept envelope empty after both keepers removed. Additional .5mm-offset forward-slide and1mm-offset lift samples have no positive-volume obstruction. Coplanar artifacts in intersections have absolute signed volume<=1.35e-10mm³.
- recheck-results.json: steel/keeper intersections empty at nominal,+Y.19,+Y.20,+Y.21. Final foot rear edgeY=-53.6 gives .4mm nominal front-pin clearance and .2mm remaining clearance at full nominal .2mm radial play inØ2.4 bore. Both coupons connected/watertight and bed aligned; keeper coupon8x6.5x4.8; window coupon18x7x5.1 with flippedX orientation. Enlarged post/item intersection is only a zero-volume face atY=-47.5.
- detail-results.json: Ø4 keeper driver paths empty at lid105; cheek central slices each6mm³ (1.5x2x2), leftX[-109,-107.5], rightX[73.5,75]. Steel ends[-107,73] give .5mm nominal axial play. Direct +Z5 removal produces19.7726mm³ interference with opened lid, confirming forward slide must precede lift.
- bore-results.json: prior print-minus-installed geometry consists solely of6 annular bore rings in base and4 in lid; reverse difference empty. Latest tiny foot/orientation delta does not alter these insert cavities. Nominal pilot/cavity shift is confined to ten intended inserts.

Remaining physical qualification limits: window insert minimumY web1.875mm and solid roof1.1mm; battery boss radial web1.375mm; keeper boss minimum1.375mm. Coupons and real printed parts still need thermal fit, crack and pullout testing. Dimensional tolerances, shrinkage, layer strength and wear remain physical checks.

Hall logger review:100ms stable state resets to pending on transitions;20ms CSV samples include raw and stable levels; INPUT_PULLUP plus specified external10k to3.3V suits candidate open-drain output. Sketch does not drive lock hardware; board-pin availability remains expressly conditional. Documentation distinguishes package gap from internal sensing distance, and states hardware trigger/release and lock authorization remain unverified.
