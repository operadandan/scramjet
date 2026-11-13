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
    if sg == 'spine':
        # crew neck: a smooth line round the base of the neck, a little lower at the front
        wyc = (y - hip_anchor[1]) * s_tor + 0.95
        if wyc > 1.497 + 0.03 * np.clip((c[2] + 0.02) / 0.08, 0, 1) - 0.4 * (c[0] ** 2): return 0
        return 1
    if sg in ('shL', 'shR', 'elL', 'elR'): return 1
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
    if sg == 'spine':
        # crew neck: a smooth line round the base of the neck, a little lower at the front
        wyc = (y - hip_anchor[1]) * s_tor + 0.95
        if wyc > 1.497 + 0.03 * np.clip((c[2] + 0.02) / 0.08, 0, 1) - 0.4 * (c[0] ** 2): return 0
        return 1
    if sg in ('shL', 'shR', 'elL', 'elR'): return 1
    if sg in ('hips', 'lgL', 'lgR'): return 2
    if sg in ('knL', 'knR'):
        if y < ankleY + 0.05: return 4 if y < P[bv, 1].min() + 0.018 else 3
        return 2
    return 0
FREG = {tuple(f): face_reg(f) for f in body}
# ---- hair: its own layer over the scalp. A coverage value per vertex (1 under the hair, 0 off it, smoothed) is drawn with
# the shell only where it is over 0.5, so the hairline runs as a smooth curve through the triangles instead of stepping
# along their edges, and the shell's thickness grows from nothing at that line to a short crop on top
HEADI = SEGS.index('head')
adjA = {}
for f in body:
    for k in range(4): a_, b_ = f[k], f[(k + 1) % 4]; adjA.setdefault(a_, set()).add(b_); adjA.setdefault(b_, set()).add(a_)
headV = sorted(set(i for f in body if FS[tuple(f)] == HEADI for i in f))
hf = np.zeros(n)
for f in body:
    if FREG[tuple(f)] == 5:
        for i in f: hf[i] = 1.0
hvl = np.array(headV); hnb = [np.array(sorted(adjA[i])) for i in headV]
for it in range(7): hf[hvl] = 0.5 * hf[hvl] + 0.5 * np.array([hf[nb_].mean() for nb_ in hnb])
for f in body:
    if FREG[tuple(f)] == 5: FREG[tuple(f)] = 0
hairF = [f for f in body if FS[tuple(f)] == HEADI and max(hf[i] for i in f) > 0.04]
hset = sorted(set(i for f in hairF for i in f))
def sstep(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
PH = P + Nv * (0.0006 + 0.0075 * sstep(0.45, 1.0, hf))[:, None]
NH = np.zeros_like(P)
for f in hairF:
    a_, b_, c_, d_ = (PH[i] for i in f); nn = np.cross(c_ - a_, d_ - b_)
    for i in f: NH[i] += nn
NH /= np.maximum(np.linalg.norm(NH, axis=1, keepdims=True), 1e-9)
# ---- clothes are their own layer over the skin
# How far each kind of layer sits off the skin (fabric over a fit body, boot leather and sole) and the least it may
# come in after smoothing. Hair is a short crop: about 8 mm on top, thinning to almost nothing at the hairline.
OFF = {1: (0.006, 0.0035), 2: (0.007, 0.0045), 3: (0.010, 0.008), 4: (0.012, 0.010)}
clothF = [f for f in body if FREG[tuple(f)] != 0]
cv = sorted(set(i for f in clothF for i in f))
off = np.zeros(n); mino = np.zeros(n)
for f in clothF:
    r = FREG[tuple(f)]
    if r == 5: continue
    # trousers sit loose over the seat and hips instead of hugging them
    o0, o1 = OFF[r]
    if r == 2 and SEGS[FS[tuple(f)]] == 'hips': o0, o1 = 0.016, 0.009
    for i in f: off[i] = max(off[i], o0); mino[i] = max(mino[i], o1)
hv = set()
PC = P + Nv * off[:, None]
# fabric drapes: smooth the layer (it bridges the hollows of the body, like the cleft of the buttocks or along the spine),
# then make sure nothing came closer to the skin than the fabric allows
cadj = {}
for f in clothF:
    for k in range(4): a_, b_ = f[k], f[(k + 1) % 4]; cadj.setdefault(a_, set()).add(b_); cadj.setdefault(b_, set()).add(a_)
cvl = np.array(cv); nbrs = [np.array(sorted(cadj[i])) for i in cv]
ishair = np.isin(cvl, list(hv))
for it in range(45):
    avg = np.array([PC[nb_].mean(0) for nb_ in nbrs])
    lam = np.where(ishair, 0.25 if it < 10 else 0.0, 0.6)[:, None]
    PC[cvl] = PC[cvl] + lam * (avg - PC[cvl])
    d = ((PC[cvl] - P[cvl]) * Nv[cvl]).sum(1); lo = mino[cvl]
    PC[cvl] += Nv[cvl] * np.maximum(0, lo - d)[:, None]
# the seat: trousers hang over the buttocks instead of following the cleft and the fold under them
seatY = (P[cvl, 1] - hip_anchor[1]) * s_tor + 0.95
seat = (~ishair) & (seatY > 0.68) & (seatY < 1.04) & (P[cvl, 2] > hip_anchor[2] - 0.02)
si_ = np.where(seat)[0]
for it in range(220):
    avg = np.array([PC[nbrs[k]].mean(0) for k in si_])
    v_ = cvl[si_]; PC[v_] = PC[v_] + 0.6 * (avg - PC[v_])
    d = ((PC[v_] - P[v_]) * Nv[v_]).sum(1); PC[v_] += Nv[v_] * np.maximum(0, mino[v_] - d)[:, None]
# fill the cleft and the fold across the back of the seat: each back-facing point comes out to near the highest point
# of the fabric within a few centimetres (cloth spans a hollow, it doesn't sink into it), then a light smoothing pass
back = si_[(Nv[cvl[si_], 2] > 0.2)]
bv_ = cvl[back]; XY = P[bv_][:, :2]; Z = PC[bv_, 2].copy(); Zn = Z.copy()
for k in range(len(bv_)):
    m_ = ((XY - XY[k]) ** 2).sum(1) < 0.035 ** 2
    Zn[k] = max(Z[k], Z[m_].max() - 0.006)
PC[bv_, 2] = Zn
for it in range(30):
    avg = np.array([PC[nbrs[k]].mean(0) for k in si_])
    v_ = cvl[si_]; PC[v_] = PC[v_] + 0.5 * (avg - PC[v_])
    d = ((PC[v_] - P[v_]) * Nv[v_]).sum(1); PC[v_] += Nv[v_] * np.maximum(0, mino[v_] - d)[:, None]
# layer normals from the smoothed layer itself
NC = np.zeros_like(P)
for f in clothF:
    a_, b_, c_, d_ = (PC[i] for i in f); nn = np.cross(c_ - a_, d_ - b_)
    for i in f: NC[i] += nn
NC /= np.maximum(np.linalg.norm(NC, axis=1, keepdims=True), 1e-9)
P2 = P   # (the skin itself is no longer pushed out)
LAY = [P, PC, PH]; LN = [Nv, NC, NH]

# skinning: every vertex follows its own segment and, near a joint, partly the neighbouring one. A vertex on the line
# between two segments is in both meshes with the same pair of weights, so both copies land on the same spot in any pose
GSEG = ['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR']
NB = {'hips': ['spine', 'lgL', 'lgR'], 'spine': ['hips', 'neck', 'shL', 'shR'], 'neck': ['spine', 'head'], 'head': ['neck'],
      'shL': ['spine', 'elL'], 'elL': ['shL'], 'shR': ['spine', 'elR'], 'elR': ['shR'], 'lgL': ['hips', 'knL'], 'knL': ['lgL'], 'lgR': ['hips', 'knR'], 'knR': ['lgR']}
SW2 = SW.copy()
for S in 'LR': SW2[:, SEGS.index('el' + S)] += SW2[:, SEGS.index('hand' + S)]
# the trunk bends between hips and chest over a band at the waist (MakeHuman's own pelvis weights are a sliver)
tr = SW2[:, HI] + SW2[:, SP]; bl = np.clip((wyv - 0.99) / 0.1, 0, 1); bl = bl * bl * (3 - 2 * bl)
SW2[:, HI] = np.where(tr > 0, tr * (1 - bl), SW2[:, HI]); SW2[:, SP] = np.where(tr > 0, tr * bl, SW2[:, SP])
edgeF = {}
for f in body:
    for k in range(4): a_, b_ = f[k], f[(k + 1) % 4]; edgeF.setdefault((min(a_, b_), max(a_, b_)), []).append(f)
out = {}
for si, sg in enumerate(SEGS):
    if sg.startswith('hand'): continue    # the game keeps its own gloved hands (fingers curl round the grip)
    fs = [f for f in body if FS[tuple(f)] == si]
    # vertices are (model vertex, layer): layer 0 the skin, layer 1 the clothes or hair over it
    keys = []; kidx = {}
    def K(v, L):
        k = (v, L)
        if k not in kidx: kidx[k] = len(keys); keys.append(k)
        return kidx[k]
    tris = []; fr = []; lock = set()
    for f in fs:
        r = FREG[tuple(f)]
        if r == 0: L, rr = 0, [0]
        else: L, rr = None, [6, r]      # 6: skin under the clothes (shown only once the clothes are shot open)
        for j, reg in enumerate(rr):
            lay = 1 if reg != 6 and r != 0 else 0
            a_, b_, c_, d_ = (K(i, lay) for i in f); tris += [a_, b_, c_, a_, c_, d_]; fr += [reg] * 2
    # hems: where clothes or hair end on bare skin, a strip joins the edge of the layer to the skin, so the fabric shows its
    # thickness instead of an open gap into the body
    for f in fs:
        r = FREG[tuple(f)]
        if r == 0: continue
        for k in range(4):
            a_, b_ = f[k], f[(k + 1) % 4]
            if any(FREG[tuple(g)] == 0 and a_ in g and b_ in g for g in edgeF[(min(a_, b_), max(a_, b_))]):
                A1, B1, A0, B0 = K(a_, 1), K(b_, 1), K(a_, 0), K(b_, 0)
                tris += [A1, B1, B0, A1, B0, A0, A1, B0, B1, A1, A0, B0]; fr += [r] * 4; lock.update((A1, B1, A0, B0))
    if sg == 'head':
        for f in hairF:
            a_, b_, c_, d_ = (K(i, 2) for i in f); tris += [a_, b_, c_, a_, c_, d_]; fr += [7] * 2
    nk = len(keys); pos = np.zeros((nk, 3)); nrm = np.zeros((nk, 3)); nb = np.zeros(nk, dtype=np.int64); nw = np.zeros(nk); p2 = np.zeros((nk, 3))
    for k, (v, L) in enumerate(keys):
        q = LAY[L][v:v + 1]; pos[k] = XF[sg](q)[0]
        pr = XF[sg](q + LN[L][v:v + 1] * 0.01)[0] - pos[k]; nrm[k] = pr / max(np.linalg.norm(pr), 1e-9)
        best = max(NB[sg], key=lambda m: SW2[v, SEGS.index(m)]); wn = SW2[v, SEGS.index(best)]; ws = SW2[v, si]
        if wn <= 1e-4: continue
        nb[k] = GSEG.index(best); nw[k] = wn / (ws + wn) if ws + wn > 0 else 0
        p2[k] = XF[best](q)[0]
    out[sg] = {'p': pos, 'n': nrm, 'fr': np.array(fr), 't': np.array(tris), 'q': p2, 'b': nb, 'w': nw, 'vid': np.array([v * 3 + L for v, L in keys]), 'lock': np.array([k in lock for k in range(len(keys))]), 'h': np.array([hf[v] if L == 2 else 0 for v, L in keys])}
    print(sg, nk, 'verts', len(tris) // 3, 'tris', 'blend', (nw > 0.01).sum())
np.save('/home/claude/hb/segs.npy', out, allow_pickle=True)
for S in 'LR':
    e = XF['head'](J[sk['bones']['eye.' + S]['head']]); print('eye', S, e.round(4), 'tail', XF['head'](J[sk['bones']['eye.' + S]['tail']]).round(4), 'headjoint', XF['head'](mj('head')).round(4))
