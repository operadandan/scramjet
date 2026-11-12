# G17 (built in Roblox Studio)

src/ holds Studio's Export Selection output. The model came out oversized; conv.py scales it to a real G17 (202 mm).
Texture sets in public/models/g17/: frame (frame, trigger and controls share Studio's SlideRelease1 maps), slide, mag, barrel.
The colour maps were brightened to the M4's tone; slide and barrel get some metalness. Sights and the top round are painted in code.

Rebuild: `python3 parse.py src/G17.obj && python3 conv.py ../../../public/models/g17/g17.bin`
Part names matter: Slide (with the sights) moves, Magazine plus Cartridge come out on reloads.
