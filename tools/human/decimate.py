# Decimates the dense head in Blender (bpy) without touching the vertices it shares with the neck, keeps paint regions,
# skin weights and normals, and writes the game's mesh file
import numpy as np, bpy, base64, json, sys
segs = np.load('/home/claude/hb/segs.npy', allow_pickle=True).item()
RATIO = {'head': 0.4, 'knL': 0.45, 'knR': 0.45, 'spine': 0.75}
allv = {}
for sg, d in segs.items():
    for v in d['vid']: allv[v] = allv.get(v, 0) + 1
def run(sg, d, ratio):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('m'); me.from_pydata(d['p'].tolist(), [], d['t'].reshape(-1, 3).tolist()); me.update()
    a = me.attributes.new('fr', 'INT', 'FACE'); a.data.foreach_set('value', d['fr'].astype(np.int32))
    for k, arr, typ in (('nn', d['n'], 'FLOAT_VECTOR'), ('qq', d['q'], 'FLOAT_VECTOR'), ('ww', d['w'], 'FLOAT'), ('hh', d['h'], 'FLOAT'), ('ck', d['ck'], 'FLOAT'), ('cr', d['cr'], 'FLOAT'), ('ca', d['ca'], 'FLOAT'), ('bb', d['b'], 'INT')):
        a = me.attributes.new(k, typ, 'POINT'); a.data.foreach_set('vector' if typ == 'FLOAT_VECTOR' else 'value', np.asarray(arr, dtype=np.int32 if typ == 'INT' else np.float32).ravel())
    ob = bpy.data.objects.new('o', me); bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.objects.active = ob
    if ratio < 1:
        # only vertices that belong to this segment alone and don't bend with a neighbour may be merged away
        vg = ob.vertex_groups.new(name='free'); free = [k for k, v in enumerate(d['vid']) if allv[v] == 1 and d['w'][k] < 0.001 and not d['lock'][k] and d['ck'][k] == 0]
        vg.add(free, 1.0, 'REPLACE')
        md = ob.modifiers.new('d', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = ratio; md.use_collapse_triangulate = True; md.vertex_group = 'free'
        bpy.ops.object.modifier_apply(modifier='d')
    me = ob.data; nv = len(me.vertices)
    P = np.zeros(nv * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    me.calc_loop_triangles(); T = np.zeros(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', T)
    TP = np.zeros(len(me.loop_triangles), dtype=np.int64); me.loop_triangles.foreach_get('polygon_index', TP)
    FR = np.zeros(len(me.polygons), dtype=np.int32); me.attributes['fr'].data.foreach_get('value', FR)
    def g(k, n):
        a = np.zeros(nv * n, dtype=np.int32 if k == 'bb' else np.float64)
        me.attributes[k].data.foreach_get('vector' if n == 3 else 'value', a); return a
    N = g('nn', 3).reshape(-1, 3); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return P, T, FR[TP], N, g('qq', 3).reshape(-1, 3), g('bb', 1), g('ww', 1), g('hh', 1), g('ck', 1), g('cr', 1), g('ca', 1)
out = {}; tot = 0
e64 = lambda a: base64.b64encode(a.tobytes()).decode()
for sg, d in segs.items():
    P, T, R, N, Q, Bn, Wn, Hc, Ck, Cr, Ca = run(sg, d, RATIO.get(sg, 1))
    tot += len(T) // 3
    out[sg] = {'p': e64(np.round(P * 10000).astype(np.int16)), 'n': e64(np.round(N * 127).astype(np.int8)), 'r': e64(R.astype(np.uint8)),
               't': e64(T.astype(np.uint16)), 'q': e64(np.round(Q * 10000).astype(np.int16)), 'b': e64(Bn.astype(np.uint8)), 'w': e64(np.round(np.clip(Wn, 0, 1) * 255).astype(np.uint8)), 'h': e64(np.round(np.clip(Hc, 0, 1) * 255).astype(np.uint8)),
               'c': e64(np.stack([np.round(Ck), np.round(np.clip(Cr, 0, 2) * 100), np.round(np.clip(Ca, 0, 12) * 20)], 1).astype(np.uint8))}
    print(sg, len(P), 'v', len(T) // 3, 't')
print('total tris', tot)
js = ('// The human body: MakeHuman base mesh (CC0, makehumancommunity.org), male, cut into the game\'s body segments and\n'
      '// skinned across the joints, built by tools/human. Per segment: positions (0.1 mm int16), normals (int8), paint region\n'
      '// per triangle, uint16 triangles, and for skinning each vertex\'s position in its neighbouring segment (q), which neighbour\n'
      '// (b, index into HUMAN_SEGS) and how much it follows it (w, 0-255).\n'
      'const HUMAN_SEGS = ' + json.dumps(['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR']) + ';\n'
      'const HUMAN_MESH = ' + json.dumps(out, separators=(',', ':')) + ';\n'
      '// cloth particles (shirt 2 hoops x 12, each jeans leg 2 x 8): where each is pinned on the body, skinned like a vertex\n'
      'const HUMAN_CLOTH = ' + json.dumps(json.load(open('/home/claude/hb/clothrig.json')), separators=(',', ':')) + ';\n')
open(sys.argv[-1], 'w').write(js); print('bytes', len(js))
