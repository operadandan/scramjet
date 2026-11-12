# G17 (built in Roblox Studio)

src/ holds Studio's Export Selection output. Studio gave these parts no usable textures or UVs, so the game paints them
with its own finishes (polymer frame, slide steel) and conv.py gives every vertex a box-projected UV.

Rebuild: `python3 parse.py src/G17.obj && python3 conv.py ../../../public/models/g17/g17.bin`
Part names matter: Slide (plus Union, its top plate) moves on the slide, Mag is the magazine.
