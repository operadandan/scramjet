# Decimates each body segment in Blender (bpy), keeps the paint regions, and writes the game's mesh file
import numpy as np, bpy, bmesh, base64, json, sys
segs = np.load('/home/claude/hb/segs.npy', allow_pickle=True).item()
RATIO = {'head': 0.4, 'knL': 0.6, 'knR': 0.6}
NREG = 6
def dec(p, t, fr, ratio):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('m'); me.from_pydata(p.tolist(), [], t.reshape(-1, 3).tolist()); me.update()
    a = me.attributes.new('fr', 'INT', 'FACE'); a.data.foreach_set('value', fr.astype(np.int32))
    ob = bpy.data.objects.new('o', me); bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.objects.active = ob
    if ratio < 1:
        md = ob.modifiers.new('d', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = ratio; md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d')
    me = ob.data; nv = len(me.vertices)
    P = np.zeros(nv * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    me.calc_loop_triangles(); T = np.zeros(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', T)
    TP = np.zeros(len(me.loop_triangles), dtype=np.int64); me.loop_triangles.foreach_get('polygon_index', TP)
    FR = np.zeros(len(me.polygons), dtype=np.int32); me.attributes['fr'].data.foreach_get('value', FR)
    return P, T, FR[TP]
out = {}; tot = 0
for sg, d in segs.items():
    P, T, R = dec(d['p'], d['t'], d['fr'], RATIO.get(sg, 1))
    # smooth vertex normals from the decimated surface
    N = np.zeros_like(P); tri = T.reshape(-1, 3); fn = np.cross(P[tri[:, 1]] - P[tri[:, 0]], P[tri[:, 2]] - P[tri[:, 0]])
    for k in range(3): np.add.at(N, tri[:, k], fn)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    tot += len(tri)
    q = np.round(P * 10000).astype(np.int16)                        # 0.1 mm steps
    nq = np.round(N * 127).astype(np.int8)
    out[sg] = {'p': base64.b64encode(q.tobytes()).decode(), 'n': base64.b64encode(nq.tobytes()).decode(),
               'r': base64.b64encode(R.astype(np.uint8).tobytes()).decode(), 't': base64.b64encode(T.astype(np.uint16).tobytes()).decode()}
    print(sg, len(P), 'v', len(tri), 't')
print('total tris', tot)
js = ('// The human body: MakeHuman base mesh (CC0, makehumancommunity.org), male, cut into the game\'s body segments and\n'
      '// decimated in Blender by tools/build_human.py. Positions in 0.1 mm int16, normals int8, paint region per triangle, uint16 triangles.\n'
      'const HUMAN_MESH = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(sys.argv[-1], 'w').write(js); print('bytes', len(js))
