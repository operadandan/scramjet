# Builds BREACH's human body from the MakeHuman base mesh (CC0): male target applied, cut into the game's rigid body
# segments by the default skeleton's skin weights, each segment moved onto the game rig (limbs straightened to hang down),
# painted by region (skin, shirt, pants, boots, hair) and decimated in Blender. Output: a JS file with the meshes.
import numpy as np, json, sys, os, base64
D = '/home/claude/makehumancommunity/makehuman/makehuman/data/'
V = []; F = []; G = []; g = None
for l in open(D + '3dobjs/base.obj'):
    if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
    elif l.startswith('g '): g = l.split()[1]
    elif l.startswith('f '): F.append([int(t.split('/')[0]) - 1 for t in l.split()[1:]]); G.append(g)
V = np.array(V)

def target(path, w):
    for l in open(D + 'targets/' + path):
        if l[0] == '#' or not l.strip(): continue
        p = l.split(); V[int(p[0])] += w * np.array([float(x) for x in p[1:4]])
target('macrodetails/universal-male-young-averagemuscle-averageweight.target', 1.0)
target('macrodetails/universal-male-young-maxmuscle-averageweight.target', 0.35)
target('macrodetails/caucasian-male-young.target', 1.0)

sk = json.load(open(D + 'rigs/default.mhskel'))
J = {k: V[v].mean(0) for k, v in sk['joints'].items()}
jh = lambda b: J[sk['bones'][b]['head']]; jt = lambda b: J[sk['bones'][b]['tail']]
W = json.load(open(D + 'rigs/default_weights.mhw'))['weights']

# MakeHuman faces +z with its left on +x, in decimetres. The game faces -z with its left on -x, in metres: turn 180 about y
def to_game(p): p = np.asarray(p) * 0.1; return np.stack([-p[..., 0], p[..., 1], -p[..., 2]], -1)
V = to_game(V); J = {k: to_game(v) for k, v in J.items()}

# which game segment each MakeHuman bone belongs to
def seg_of(b):
    s = b.split('.')[-1] if '.' in b else ''
    S = 'L' if s == 'L' else 'R'
    if b.startswith('upperarm'): return 'sh' + S
    if b.startswith(('lowerarm',)): return 'el' + S
    if b.startswith(('wrist', 'finger', 'metacarpal')): return 'hand' + S
    if b.startswith('upperleg'): return 'lg' + S
    if b.startswith(('lowerleg', 'foot', 'toe')): return 'kn' + S
    if b.startswith(('pelvis', 'root')): return 'hips'
    if b.startswith(('spine', 'clavicle', 'breast', 'shoulder01')): return 'spine'
    if b.startswith('neck'): return 'neck'
    return 'head'
SEGS = ['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR', 'handL', 'handR']
n = len(V); SW = np.zeros((n, len(SEGS)))
for b, lst in W.items():
    si = SEGS.index(seg_of(b))
    for vi, w in lst: SW[vi, si] += w
body = [f for f, gg in zip(F, G) if gg == 'body']
bv = np.array(sorted(set(i for f in body for i in f)))

# game rig at bind pose (world, root at the floor): segment origin and its own length
R = {'hips': (0, 0.95, 0), 'spine': (0, 1.02, 0), 'neck': (0, 1.57, 0), 'head': (0, 1.63, 0)}
LEN = {'sh': 0.3, 'el': 0.3, 'lg': 0.44, 'kn': 0.44}
# MakeHuman joints that line up with those origins
def mj(b): return J[sk['bones'][b]['head']]
def mt(b): return J[sk['bones'][b]['tail']]
MJ = {'hips': (mj('upperleg01.L') + mj('upperleg01.R')) / 2 * np.array([0, 1, 0]) + np.array([0, 0.03, 0]) + mj('spine05') * np.array([1, 0, 1]),
      'neck': mj('neck01'), 'head': mj('head')}
# overall scale: game hip-to-head-joint height over the model's
s_tor = (R['head'][1] - 0.92) / (MJ['head'][1] - mj('upperleg01.L')[1])
print('torso scale', s_tor, 'model height m', (V[bv, 1].max() - V[bv, 1].min()))

def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a.dot(b)
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))

# per segment: a function taking model points (game axes) to segment-local coordinates
XF = {}
def torso_xf(name, anchor):
    def f(p): return (p - anchor) * s_tor
    return f
hip_anchor = np.array([0, (mj('upperleg01.L')[1] + mj('upperleg01.R')[1]) / 2 + (0.03 / s_tor), mj('spine05')[2]])
# the trunk chain (hips, chest, neck, head) shares one placement so it stays one continuous surface at rest
gw = lambda p: (p - hip_anchor) * s_tor + np.array([0, 0.95, 0])
for nm in ('hips', 'spine', 'neck', 'head'):
    XF[nm] = (lambda o: (lambda p: gw(p) - np.array(o)))(R[nm])
def limb_xf(seg, b0, b1, kind, Lmodel=None):
    h, t = mj(b0), mt(b1); L = Lmodel or np.linalg.norm(t - h); Rm = rot_to(t - h, np.array([0, -1.0, 0]))
    ax = (LEN[kind] + (0.04 if kind == 'kn' else 0)) / L
    def f(p):
        q = (p - h) @ Rm.T * s_tor
        q[..., 1] *= ax / s_tor   # along the bone: stretched to the game's segment length
        return q
    return f
for S in 'LR':
    XF['sh' + S] = limb_xf('sh' + S, 'upperarm01.' + S, 'upperarm02.' + S, 'sh')
    XF['el' + S] = limb_xf('el' + S, 'lowerarm01.' + S, 'lowerarm02.' + S, 'el')
    XF['lg' + S] = limb_xf('lg' + S, 'upperleg01.' + S, 'upperleg02.' + S, 'lg')
    # the shin is stretched so the sole, not the ankle, ends on the floor (the rig's ankle sits 4 cm up)
    kh, kt = mj('lowerleg01.' + S), mt('lowerleg02.' + S); ax_ = (kt - kh) / np.linalg.norm(kt - kh)
    soleL = max((V[i] - kh).dot(ax_) for i in bv if SW[i, SEGS.index('kn' + S)] > 0.5)
    XF['kn' + S] = limb_xf('kn' + S, 'lowerleg01.' + S, 'lowerleg02.' + S, 'kn', soleL)

# vertex normals of the whole body (for shading and for pushing clothes out)
P = V; Nv = np.zeros_like(P)
for f in body:
    a, b, c, d = (P[i] for i in f); nn = np.cross(c - a, d - b);
    for i in f: Nv[i] += nn
Nv /= np.maximum(np.linalg.norm(Nv, axis=1, keepdims=True), 1e-9)

# region paint (palette slots): 0 skin, 1 shirt, 2 pants, 3 boots, 4 sole, 5 hair
seg_main = SW.argmax(1)
ankleY = (mj('foot.L')[1] + mj('foot.R')[1]) / 2
wristY = None
browY = J['orbicularis03.L____head'][1] if 'orbicularis03.L____head' in J else mj('head')[1] + 0.12
headTop = P[bv, 1].max(); faceZ = P[bv][P[bv, 1] > mj('head')[1], 2].min()
def region(i):
    sg = SEGS[seg_main[i]]; y = P[i, 1]
    if sg in ('head',):
        # buzz cut: the top and back of the skull above the brow, not the face or ears
        if y > browY + 0.012 and P[i, 2] > faceZ + 0.045: return 5
        if y > browY + 0.035: return 5
        return 0
    if sg == 'neck': return 0
    if sg in ('spine', 'shL', 'shR', 'elL', 'elR'): return 1
    if sg in ('handL', 'handR'): return 0
    if sg in ('hips', 'lgL', 'lgR'): return 2
    if sg in ('knL', 'knR'):
        if y < ankleY + 0.05: return 4 if y < P[bv, 1].min() + 0.018 else 3
        return 2
    return 0
# each face belongs to the segment carrying most of its corners' weight; the trunk is split into hips and chest at the waist
wyv = (P[:, 1] - hip_anchor[1]) * s_tor + 0.95
HI, SP = SEGS.index('hips'), SEGS.index('spine')
def face_seg(f):
    w = SW[list(f)].sum(0); w[HI] += w[SP]; w[SP] = 0; k = int(w.argmax())
    if k == HI: k = HI if wyv[list(f)].mean() < 1.035 else SP
    return k
FS = {tuple(f): face_seg(f) for f in body}
def face_reg(f):
    sg = SEGS[FS[tuple(f)]]; c = P[list(f)].mean(0); y = c[1]
    if sg == 'head':
        if abs(c[0]) > 0.071 and y < browY + 0.03: return 0      # ears
        if y > browY + 0.035 or (y > browY + 0.012 and c[2] > faceZ + 0.045) or (y > browY - 0.03 and c[2] > faceZ + 0.115): return 5
        return 0
    if sg == 'neck': return 0
    if sg in ('spine', 'shL', 'shR', 'elL', 'elR'): return 1
    if sg in ('hips', 'lgL', 'lgR'): return 2
    if sg in ('knL', 'knR'):
        if y < ankleY + 0.05: return 4 if y < P[bv, 1].min() + 0.018 else 3
        return 2
    return 0
FREG = {tuple(f): face_reg(f) for f in body}
VP = np.zeros(n)
PUSH0 = {0: 0, 1: 0.007, 2: 0.008, 3: 0.012, 4: 0.012, 5: 0.002}
for f in body:
    for i in f: VP[i] = max(VP[i], PUSH0[FREG[tuple(f)]])
P2 = P + Nv * VP[:, None]

out = {}
for si, sg in enumerate(SEGS):
    if sg.startswith('hand'): continue    # the game keeps its own gloved hands (fingers curl round the grip)
    # faces of this segment: any corner weighted to it, so neighbouring segments overlap at the joint and no gap opens
    # own faces, plus a ring of the parent's faces round the joint (so a bent joint shows no crack)
    ov = {'neck': 0.3, 'lgL': 0.3, 'lgR': 0.3, 'knL': 0.3, 'knR': 0.3, 'elL': 0.3, 'elR': 0.3, 'shL': 0.45, 'shR': 0.45}.get(sg)
    fs = [f for f in body if FS[tuple(f)] == si or (ov and SEGS[FS[tuple(f)]] not in ('handL', 'handR') and min(SW[i, si] for i in f) >= ov)]
    vs = sorted(set(i for f in fs for i in f)); idx = {v: k for k, v in enumerate(vs)}
    pos = XF[sg](P2[vs]); nrm = Nv[vs]
    # rotate normals with the segment (limbs were turned to hang straight down)
    probe = XF[sg](P2[vs] + nrm * 0.01) - pos; nrm = probe / np.maximum(np.linalg.norm(probe, axis=1, keepdims=True), 1e-9)
    tris = []
    fr = []
    for f in fs: a, b, c, d = (idx[i] for i in f); tris += [a, b, c, a, c, d]; fr += [FREG[tuple(f)]] * 2
    out[sg] = {'p': pos, 'n': nrm, 'fr': np.array(fr), 't': np.array(tris)}
    print(sg, len(vs), 'verts', len(tris) // 3, 'tris', 'y', pos[:, 1].min().round(3), pos[:, 1].max().round(3), 'x', pos[:, 0].min().round(3), pos[:, 0].max().round(3), 'z', pos[:, 2].min().round(3), pos[:, 2].max().round(3))
np.save('/home/claude/hb/segs.npy', out, allow_pickle=True)
for S in 'LR':
    e = XF['head'](J[sk['bones']['eye.' + S]['head']]); print('eye', S, e.round(4), 'tail', XF['head'](J[sk['bones']['eye.' + S]['tail']]).round(4), 'headjoint', XF['head'](mj('head')).round(4))
