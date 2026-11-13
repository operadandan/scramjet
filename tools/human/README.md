Builds `src/client/js/02a-human-mesh.js` from the MakeHuman base mesh (CC0, github.com/makehumancommunity/makehuman).

    git clone --depth 1 https://github.com/makehumancommunity/makehuman ../makehumancommunity/makehuman
    pip install bpy numpy
    python3 build_human.py            # male target, cut into the game's body segments, painted, clothes pushed out
    python3 decimate.py ../../src/client/js/02a-human-mesh.js   # Blender decimation, writes the JS mesh file

Paths at the top of the scripts point at /home/claude; change `D` and the npy path for another machine.
