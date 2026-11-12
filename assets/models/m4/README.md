# M4 (built in Roblox Studio)

src/ holds Studio's Export Selection output (OBJ + MTL). The game loads public/models/m4/ instead:

- m4.bin: every named part, already in the game's frame (metres, barrel toward -Z, ejection port on +X)
- m4_col.jpg / m4_nrm.png / m4_orm.png: colour, normal, and ORM (green roughness, blue metalness) maps
- cart_*: the same for the rounds in the magazine

To rebuild after a new export: `python3 parse.py src/M4.obj && python3 conv.py ../../../public/models/m4/m4.bin`,
then convert the textures (the _spec map has metalness in red and roughness in green; ORM wants them in blue and green).
Part names matter: Magazine, MagazineCartridges, ChargingHandle and BoltCarrier become the moving parts.
