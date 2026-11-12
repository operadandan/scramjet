# Viewmodel arms (from Roblox Studio)

src/ holds the export. rig.py turns it into public/models/arms/arms.bin: both arms skinned to 18 bones (upper arm, forearm,
hand, three joints per finger and thumb), with each joint's bind position, the hand's frame (wrist, palm point, finger
direction, palm normal) and finger radii. Studio's "Rightarm" is geometrically a left hand, so it becomes the left arm and its
mirror the right one.

Joints come from the mesh: fingertips are the farthest points (along the surface) from the glove cuff, each finger's
centreline is fitted through rings of equal distance from its tip, and the joints sit at real phalanx proportions.
Rebuild: `python3 parse.py src/armviewmodel.obj && python3 rig.py ../../../public/models/arms/arms.bin`

In the game (src/client/js/06c-arm-rig.js, 08-hands.js) the hands are placed on each gun and the fingers close until each
phalanx touches what it holds, so a new gun model gets a fitted grip without hand-made poses.
