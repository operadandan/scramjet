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
V_mh = V.copy()
V = to_game(V); J = {k: to_game(v) for k, v in J.items()}

# which game segment each MakeHuman bone belongs to
def seg_of(b):
    s = b.split('.')[-1] if '.' in b else ''
    S = 'L' if s == 'L' else 'R'
    if b.startswith(('upperarm', 'shoulder01')): return 'sh' + S
    if b.startswith(('lowerarm',)): return 'el' + S
    if b.startswith(('wrist', 'finger', 'metacarpal')): return 'hand' + S
    if b.startswith('upperleg'): return 'lg' + S
    if b.startswith(('lowerleg', 'foot', 'toe')): return 'kn' + S
    if b.startswith(('pelvis', 'root')): return 'hips'
    if b.startswith(('spine', 'clavicle', 'breast')): return 'spine'
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
# skinning: every vertex follows its own segment and, near a joint, partly the neighbouring one. A vertex on the line
# between two segments is in both meshes with the same pair of weights, so both copies land on the same spot in any pose
GSEG = ['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR']
NB = {'hips': ['spine', 'lgL', 'lgR'], 'spine': ['hips', 'neck', 'shL', 'shR'], 'neck': ['spine', 'head'], 'head': ['neck'],
      'shL': ['spine', 'elL'], 'elL': ['shL'], 'shR': ['spine', 'elR'], 'elR': ['shR'], 'lgL': ['hips', 'knL'], 'knL': ['lgL'], 'lgR': ['hips', 'knR'], 'knR': ['lgR']}

# A vertex's two strongest bones are chosen once for the vertex, not per mesh: a vertex on the line between two meshes is in
# both, and both copies must land on the same spot in any pose, or the surface tears (it did at the shoulders and crotch).
# In a mesh whose own bone is one of the two, the other goes in slot 1; otherwise both go in the slots and the own bone
# gets no weight. Slot positions are in the slot bone's frame.
_GI = [SEGS.index(b) for b in GSEG]
def pick2(Wrow, sg):
    ws = np.array([Wrow[i] for i in _GI]); o = np.argsort(-ws)[:2]; o = [k for k in o if ws[k] > 1e-4]
    tot = sum(ws[k] for k in o)
    if not o: return []
    own = GSEG.index(sg)
    if own in o: return [(k, ws[k] / tot) for k in o if k != own]
    return [(k, ws[k] / tot) for k in o]
SW2 = SW.copy()
for S in 'LR': SW2[:, SEGS.index('el' + S)] += SW2[:, SEGS.index('hand' + S)]
# the trunk bends between hips and chest over a band at the waist (MakeHuman's own pelvis weights are a sliver)
tr = SW2[:, HI] + SW2[:, SP]; bl = np.clip((wyv - 0.99) / 0.1, 0, 1); bl = bl * bl * (3 - 2 * bl)
SW2[:, HI] = np.where(tr > 0, tr * (1 - bl), SW2[:, HI]); SW2[:, SP] = np.where(tr > 0, tr * bl, SW2[:, SP])
# the pelvis itself doesn't bend with the thighs: above the crotch the legs' pull fades out (MakeHuman's thigh weights
# reach up over the hip bones, which made the hips and seat slide off the pelvis when a leg swung)
pf = np.clip((0.95 - wyv) / 0.11, 0, 1); pf = pf * pf * (3 - 2 * pf)
for S in 'LR':
    li = SEGS.index('lg' + S); mv = SW2[:, li] * (1 - pf); SW2[:, li] -= mv; SW2[:, HI] += mv

# ---- garments: each one is its own sheet of cloth over the body (and over the garment under it), with its own edge.
# Where a garment ends is a smooth line given by a coverage value per vertex (1 inside, 0 outside, the line at 0.5): the
# sheet is drawn only where coverage is over 0.5, so hems are smooth curves through the triangles, and since the sheet is
# drawn on both sides the inside of the shirt shows at the neck, like real cloth.
#   shirt: crew neck, long sleeves (the cuff goes under the glove), worn untucked: its hem hangs over the trousers
#   trousers: waistband just above the hips, tucked into the boots
#   boots: shaft to about 12 cm above the ankle bone, over the trousers
def ss(x): t = np.clip(x, 0, 1); return t * t * (3 - 2 * t)
segv = np.array([SEGS[k] for k in SW2[:, :len(SEGS)].argmax(1)]) if False else None
vseg = {}
for f in body:
    for i in f: vseg.setdefault(i, set()).add(SEGS[FS[tuple(f)]])
solY = P[bv, 1].min()
def collar_y(x, z):  # world height of the crew neck line round the base of the neck (lower at the front)
    return 1.497 + 0.03 * np.clip((z + 0.02) / 0.08, 0, 1) - 0.4 * x * x
GW = {}   # garment -> coverage per vertex
TRUNK = {'spine', 'hips', 'neck'}; ARM = {'shL', 'shR', 'elL', 'elR', 'handL', 'handR'}; LEG = {'lgL', 'lgR', 'knL', 'knR'}
cov = {g: np.zeros(n) for g in ('shirt', 'pants', 'boots', 'socks')}
bootTop = ankleY + 0.115
for i in range(n):
    sg = vseg.get(i, set()); x, y, z = P[i]; wy = wyv[i]
    if not sg: continue
    if sg & (TRUNK | ARM) and not sg & {'head'}:
        c_col = (collar_y(x, z) - wy) / 0.012          # >0 below the collar line
        c_hem = (wy - 0.905) / 0.012                    # >0 above the shirt hem
        c = min(c_col, c_hem) if sg & TRUNK or sg & {'shL', 'shR'} else 9
        if sg & {'handL', 'handR'} and not sg & {'elL', 'elR'}: c = -9
        cov['shirt'][i] = np.clip(0.5 + 0.5 * c, 0, 1)
    if sg & ({'hips'} | LEG) or (sg & {'spine'} and wy < 1.08):
        c = (1.045 - wy) / 0.012                        # >0 below the waistband
        cov['pants'][i] = np.clip(0.5 + 0.5 * c, 0, 1)
    if sg & {'knL', 'knR'}:
        c = (bootTop - y) / 0.012
        cov['boots'][i] = np.clip(0.5 + 0.5 * c, 0, 1)
        cov['socks'][i] = np.clip(0.5 + 0.5 * (ankleY + 0.16 - y) / 0.012, 0, 1)   # crew socks to mid-calf
        # jeans: worn over the boots, the hem resting just under the ankle bone (the foot itself is not inside the leg)
        cov['pants'][i] = min(cov['pants'][i], np.clip(0.5 + 0.5 * (y - (ankleY - 0.012)) / 0.012, 0, 1))
for g in cov: cov[g][list(set(range(n)) - set(bv))] = 0
# which faces each garment covers (any part of)
GF = {g: [f for f in body if max(cov[g][i] for i in f) > 0.0 and SEGS[FS[tuple(f)]] not in ('handL', 'handR', 'head')] for g in cov}
# how far each sits off whatever is under it, and the least it may come in to after smoothing
ORDER = ['socks', 'boots', 'pants', 'shirt']    # inside to outside where they overlap
BASE = {'pants': (0.0055, 0.0035), 'boots': (0.007, 0.005), 'shirt': (0.0065, 0.0048), 'socks': (0.0016, 0.0012)}
GP = {}; GN = {}
under_off = np.zeros(n)          # how far the outermost garment so far sits off the skin, per vertex
for g in ORDER:
    vs_ = sorted(set(i for f in GF[g] for i in f)); vl = np.array(vs_)
    o0, o1 = BASE[g]
    off = np.full(n, 0.0); mino_ = np.full(n, 0.0)
    off[vl] = under_off[vl] * (under_off[vl] > 0) + o0 + (under_off[vl] > 0) * 0.003
    mino_[vl] = under_off[vl] + o1 + (under_off[vl] > 0) * 0.0015
    if g == 'pants':    # trousers hang loose over the seat and the hips
        seatm = (wyv[vl] > 0.7) & (wyv[vl] < 1.05)
        off[vl[seatm]] += 0.008; mino_[vl[seatm]] += 0.003
    if g == 'boots':    # leather: stiff and a little thicker round the foot
        off[vl] += 0.004 * (P[vl, 1] < ankleY + 0.04)
    PCg = P + Nv * off[:, None]
    gad = {}
    for f in GF[g]:
        for k in range(4): a_, b_ = f[k], f[(k + 1) % 4]; gad.setdefault(a_, set()).add(b_); gad.setdefault(b_, set()).add(a_)
    nbr = [np.array(sorted(gad[i])) for i in vs_]
    its = {'pants': 45, 'shirt': 45, 'boots': 70, 'socks': 3}[g]
    for it in range(its):
        avg = np.array([PCg[nb_].mean(0) for nb_ in nbr])
        PCg[vl] += 0.55 * (avg - PCg[vl])
        d = ((PCg[vl] - P[vl]) * Nv[vl]).sum(1); PCg[vl] += Nv[vl] * np.maximum(0, mino_[vl] - d)[:, None]
    if g == 'pants':
        # fill the cleft and the fold across the back of the seat
        back = vl[(Nv[vl, 2] > 0.2) & (wyv[vl] > 0.68) & (wyv[vl] < 1.04)]
        XY = P[back][:, :2]; Z = PCg[back, 2].copy(); Zn = Z.copy()
        for k in range(len(back)):
            m_ = ((XY - XY[k]) ** 2).sum(1) < 0.035 ** 2; Zn[k] = max(Z[k], Z[m_].max() - 0.006)
        PCg[back, 2] = Zn
        for it in range(25):
            avg = np.array([PCg[nb_].mean(0) for nb_ in nbr]); PCg[vl] += 0.5 * (avg - PCg[vl])
            d = ((PCg[vl] - P[vl]) * Nv[vl]).sum(1); PCg[vl] += Nv[vl] * np.maximum(0, mino_[vl] - d)[:, None]
        # straight-leg jeans: below the crotch each leg of the jeans is a straight tube round the leg's own line (hip to
        # ankle), never narrower than a straight-leg cut (12.6 cm across), so it falls straight past the knee and calf
        # instead of following them like skinny jeans; the thigh still fills it where the thigh is wider
        for S in 'LR':
            h0 = mj('upperleg01.' + S); a0 = mj('foot.' + S); ax = (a0 - h0) / np.linalg.norm(a0 - h0)
            lv = np.array([i for i in vl if vseg[i] & {'lg' + S, 'kn' + S} and wyv[i] < 0.8])
            if not len(lv): continue
            fade = ss((0.78 - wyv[lv]) / 0.16)                # full straight cut from a little below the crotch
            for it in range(30):
                rel = PCg[lv] - h0; t = rel @ ax; rv = rel - np.outer(t, ax); rr = np.linalg.norm(rv, axis=1)
                want = np.maximum(rr, 0.063 * fade + rr * (1 - fade))
                PCg[lv] = h0 + np.outer(t, ax) + rv * (want / np.maximum(rr, 1e-6))[:, None]
                idx_ = {v: k for k, v in enumerate(vl)}
                avg = np.array([PCg[nbr[idx_[i]]].mean(0) for i in lv]); PCg[lv] += 0.35 * (avg - PCg[lv])
                d = ((PCg[lv] - P[lv]) * Nv[lv]).sum(1); PCg[lv] += Nv[lv] * np.maximum(0, mino_[lv] - d)[:, None]
    if g == 'boots':
        # a boot is not the shape of a foot: the heavy smoothing above already rounded the toes into one toe box; now a
        # roomier toe box, a flat sole, and a rubber sole edge standing out round the bottom (the welt)
        # the foot part of the boot is the foot's convex hull (no toes, no arch), a few mm out, blending into the shaft
        from scipy.spatial import ConvexHull
        for S in 'LR':
            sd = vl[np.sign(P[vl, 0]) == (-1 if S == 'L' else 1)]
            ft = sd[P[sd, 1] < ankleY + 0.035]; c0 = P[ft].mean(0); hq = ConvexHull(P[ft]).equations
            for v in sd[P[sd, 1] < ankleY + 0.07]:
                dv = P[v] - c0; dl = np.linalg.norm(dv)
                if dl < 1e-6: continue
                dv /= dl; nd = hq[:, :3] @ dv; ok_ = nd > 1e-6
                tt = np.min(-(hq[ok_, :3] @ c0 + hq[ok_, 3]) / nd[ok_])
                tgt = c0 + dv * (tt + 0.0065)
                b_ = np.clip((ankleY + 0.07 - P[v, 1]) / 0.05, 0, 1); b_ = b_ * b_ * (3 - 2 * b_)
                if np.linalg.norm(tgt - c0) > np.linalg.norm(PCg[v] - c0): PCg[v] = PCg[v] + (tgt - PCg[v]) * b_
        for it in range(12):
            avg = np.array([PCg[nb_].mean(0) for nb_ in nbr]); PCg[vl] += 0.4 * (avg - PCg[vl])
            d = ((PCg[vl] - P[vl]) * Nv[vl]).sum(1); PCg[vl] += Nv[vl] * np.maximum(0, mino_[vl] - d)[:, None]
        fr_ = vl[P[vl, 2] < mj('foot.L')[2] - 0.05]   # the front of the foot: toe box
        PCg[fr_] += Nv[fr_] * 0.004
        low = P[vl, 1] < solY + 0.03
        lv_ = vl[low]
        PCg[lv_, 1] = np.maximum(PCg[lv_, 1], solY - 0.002)          # never below the floor
        flat = vl[P[vl, 1] < solY + 0.012]; PCg[flat, 1] = solY - 0.002   # flat tread
        welt = vl[(P[vl, 1] < solY + 0.026)]
        hor = Nv[welt] * np.array([1, 0, 1]); hl = np.linalg.norm(hor, axis=1, keepdims=True)
        PCg[welt] += hor / np.maximum(hl, 1e-6) * 0.006 * (hl > 0.2)
    if g == 'shirt':
        # the shirt hangs from the chest and shoulder blades: below the chest it falls straight instead of following the
        # waist in, and it stands off the trousers at the hem
        tv = vl[(wyv[vl] > 0.88) & (wyv[vl] < 1.36) & np.array([bool(vseg[i] & TRUNK) for i in vl])]
        for it in range(60):
            avg = np.array([PCg[np.array(sorted(gad[i]))].mean(0) for i in tv]); PCg[tv] += 0.6 * (avg - PCg[tv])
            d = ((PCg[tv] - P[tv]) * Nv[tv]).sum(1); PCg[tv] += Nv[tv] * np.maximum(0, mino_[tv] - d)[:, None]
    dd = ((PCg[vl] - P[vl]) * Nv[vl]).sum(1)
    # only where this garment really covers does it become the "under" for the next one
    cm = cov[g][vl] > 0.5
    under_off[vl[cm]] = np.maximum(under_off[vl[cm]], dd[cm])
    NCg = np.zeros_like(P)
    for f in GF[g]:
        a_, b_, c_, d_ = (PCg[i] for i in f); nn = np.cross(c_ - a_, d_ - b_)
        for i in f: NCg[i] += nn
    NCg /= np.maximum(np.linalg.norm(NCg, axis=1, keepdims=True), 1e-9)
    GP[g] = PCg; GN[g] = NCg
    print(g, 'faces', len(GF[g]), 'off mm', round(float(dd.min() * 1000), 1), round(float(np.median(dd) * 1000), 1), round(float(dd.max() * 1000), 1))
# skin faces fully inside a garment are hidden until the garment is shot open; the rest (near any hem) stay drawn
# skin under the shirt stays drawn near the shirt's open ends (you can see up under the hem and down the collar)
trunkv = np.array([bool(vseg.get(i, set()) & {'spine', 'hips', 'neck'}) and not vseg.get(i, set()) & {'shL', 'shR'} for i in range(n)])
near_open = trunkv & ((wyv < 1.07) | ((wyv > np.array([collar_y(x, z) for x, y, z in P]) - 0.04) & (np.abs(P[:, 0]) < 0.13)))
# (arms are closed all the way: the cuffs are under the gloves; skin left drawn under a sleeve pokes through at the bends)
shirt_closed = cov['shirt'] * (~near_open)
# ---- real garments (MakeHuman 1.1 system assets, CC0): the casual outfit (T-shirt and jeans) and lace-up boots.
# Each garment vertex is tied to three body vertices (barycentric weights plus an offset scaled to the body) in its .mhclo
# file, so it fits this body exactly, and it takes its skin weights from those same body vertices, so it bends exactly as
# the skin under it does: nothing pokes through. The body vertices the garment lists as covered are hidden.
GD = '/home/claude/assets/mc/data/clothes/'
def load_mhclo(path):
    scale = {}; refs = []; dele = set(); mode = None
    for l in open(path):
        t = l.split('#')[0].split()
        if not t: continue
        if t[0] in ('x_scale', 'y_scale', 'z_scale'): scale[t[0][0]] = (int(t[1]), int(t[2]), float(t[3])); continue
        if t[0] == 'verts': mode = 'v'; continue
        if t[0] == 'delete_verts': mode = 'd'; continue
        if not t[0].lstrip('-').replace('.', '').isdigit(): mode = None if t[0] not in ('material', 'vertexboneweights_file', 'z_depth') else mode; continue
        if mode == 'v':
            if len(t) == 1 and t[0].isdigit(): refs.append(([int(t[0])] * 3, [1.0, 0, 0], [0, 0, 0])); continue
            if len(t) >= 9:
                try: refs.append(([int(x) for x in t[:3]], [float(x) for x in t[3:6]], [float(x) for x in t[6:9]])); continue
                except ValueError: pass
            mode = None
        elif mode == 'd':
            i = 0
            try:
                while i < len(t):
                    if i + 2 < len(t) and t[i + 1] == '-': dele.update(range(int(t[i]), int(t[i + 2]) + 1)); i += 3
                    else: dele.add(int(t[i])); i += 1
            except ValueError: mode = None
    return scale, refs, dele
def load_obj(path):
    v = []; vt = []; f = []
    for l in open(path):
        if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): vt.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '): f.append([(int(c.split('/')[0]) - 1, int(c.split('/')[1]) - 1) for c in l.split()[1:]])
    return np.array(v), np.array(vt), f
from collections import Counter
GARM = {}; GW_ = {}
deleted = set()
for gname, base in (('suit', 'male_casualsuit06/male_casualsuit06'), ('shoes', 'shoes02/shoes02')):
    sc, refs, dele = load_mhclo(GD + base + '.mhclo'); ov, vt, gf = load_obj(GD + base + '.obj')
    assert len(refs) == len(ov), (gname, len(refs), len(ov))
    ax = {'x': 0, 'y': 1, 'z': 2}; svec = np.ones(3)
    for k, (a_, b_, size) in sc.items(): svec[ax[k]] = abs(V_mh[a_][ax[k]] - V_mh[b_][ax[k]]) / size
    R_ = np.array([r[0] for r in refs]); W_ = np.array([r[1] for r in refs]); O_ = np.array([r[2] for r in refs])
    Gm = (V_mh[R_] * W_[:, :, None]).sum(1) + O_ * svec
    G = to_game(Gm)
    Wg = (SW2[R_] * W_[:, :, None]).sum(1)
    GN_ = np.zeros_like(G)
    for f in gf:
        idx = [c[0] for c in f]
        for k in range(len(idx)):
            a_, b_, c_ = G[idx[k]], G[idx[(k + 1) % len(idx)]], G[idx[k - 1]]; GN_[idx[k]] += np.cross(b_ - a_, c_ - a_)
    GN_ /= np.maximum(np.linalg.norm(GN_, axis=1, keepdims=True), 1e-9)
    GARM[gname] = dict(G=G, N=GN_, W=Wg, vt=vt, f=gf, refs=R_); GW_[gname] = W_
    deleted |= dele
    print(gname, len(G), 'verts', len(gf), 'faces', 'hides', len(dele), 'body verts')
# the garments' own lists stop a little short of their edges in places (skin then pokes through at the shoulders when the
# arms go up): grow them over neighbouring skin that a garment still covers (a garment point within 2.2 cm, outside the
# skin, facing the same way)
from scipy.spatial import cKDTree as _KD
# every garment point stays at least 5 mm outside the skin under it (the MakeHuman collar and armholes are fitted to the
# skin and dip into it where the neck and shoulders meet: skin then showed through in teeth along the neckline)
_bt = _KD(P[:n])
for gname, gd in GARM.items():
    G_ = gd['G']; dd_, jj_ = _bt.query(G_, k=4); wq_ = 1.0 / np.maximum(dd_, 1e-4); wq_ /= wq_.sum(1, keepdims=True)
    Pn = (P[jj_] * wq_[:, :, None]).sum(1); Nn = (Nv[jj_] * wq_[:, :, None]).sum(1); Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
    d_ = ((G_ - Pn) * Nn).sum(1); need = np.clip(0.005 - d_, 0, 0.02) * (dd_[:, 0] < 0.05)
    G_ += Nn * need[:, None]; print(gname, 'pushed out', int((need > 0).sum()), 'points, max', round(float(need.max()) * 1000, 1), 'mm')
_allG = np.vstack([g['G'] for g in GARM.values()]); _allN = np.vstack([g['N'] for g in GARM.values()]); _gt = _KD(_allG)
_adj = {}
for f in body:
    for k in range(4): a_, b_ = f[k], f[(k + 1) % 4]; _adj.setdefault(a_, set()).add(b_); _adj.setdefault(b_, set()).add(a_)
def _covered(v):
    d_, j_ = _gt.query(P[v]); return d_ < 0.022 and _allN[j_] @ Nv[v] > 0.3 and (_allG[j_] - P[v]) @ Nv[v] > -0.001
dl_ = set(d for d in deleted if d < n)
for ring in range(4):
    add = set()
    for v in dl_:
        for u in _adj.get(v, ()):
            if u not in dl_ and _covered(u): add.add(u)
    dl_ |= add
print('hidden skin vertices', len(set(d for d in deleted if d < n)), '->', len(dl_))
fullcov = np.zeros(n); fullcov[list(dl_)] = 1.0
fullcov = np.maximum(fullcov, cov['socks'])
LAYERS = {'skin': 0, 'shirt': 1, 'pants': 2, 'boots': 3, 'hair': 4, 'socks': 5}
# skin under a garment sits a centimetre further in, so where a garment's edge runs over skin (the collar, cuffs, waist)
# the last visible skin quads slope in under the cloth instead of poking out through it
P_in = P.copy(); _dl = np.array(sorted(dl_)); P_in[_dl] -= Nv[_dl] * 0.01
# and the first two rings of skin past a garment's edge ease in (6 and 3 mm), so the edge of the cloth lies over them
_r0 = set(dl_)
for _d in (0.006, 0.003):
    _r1 = set(u for v in _r0 for u in _adj.get(v, ()) if u not in dl_ and u < n) - _r0
    _r1 = np.array(sorted(_r1)); P_in[_r1] -= Nv[_r1] * _d; _r0 |= set(_r1.tolist())
LAY = [P_in, GP['shirt'], GP['pants'], GP['boots'], PH, GP['socks']]; LN = [Nv, GN['shirt'], GN['pants'], GN['boots'], NH, GN['socks']]
COV = [np.ones(n), cov['shirt'], cov['pants'], cov['boots'], hf, cov['socks']]
REGOF = {1: 1, 2: 2, 3: 3, 4: 7, 5: 8}
# ---- cloth simulation rig: the free parts of the garments hang from hoops of particles that the game simulates.
# Shirt: two hoops of 12 round the trunk (at the waist and at the hem), the shirt pinned still above the chest line.
# Jeans: two hoops of 8 round each leg (mid-shin and hem), pinned above the knee. Each garment vertex gets which set it
# follows (ck: 1 shirt, 2 left leg, 3 right leg), where between the pin line and the hoops it sits (cr: 0 pinned, 1 first
# hoop, 2 second) and its angle round the hoop (ca, in particle steps).
CLN = {1: 12, 2: 8, 3: 8}
LEGAX = {}
for S in 'LR':
    h0 = mj('upperleg01.' + S); a0 = mj('foot.' + S); LEGAX[S] = (h0, (a0 - h0) / np.linalg.norm(a0 - h0))
def cloth_coord(v, L):
    sg_ = vseg.get(v, set()); wy = wyv[v]
    if L == 1 and sg_ & {'spine', 'hips'} and not sg_ & {'shL', 'shR', 'elL', 'elR', 'neck'}:
        r = 0 if wy >= 1.30 else ((1.30 - wy) / 0.20 if wy >= 1.10 else 1 + (1.10 - wy) / 0.195)
        a = (np.arctan2(P[v, 0], P[v, 2] - hip_anchor[2]) / (2 * np.pi)) % 1.0 * 12
        return 1, min(r, 2.0), a
    if L == 2:
        for S, k in (('L', 2), ('R', 3)):
            if sg_ & {'lg' + S, 'kn' + S} and wy < 0.62:
                h0, ax = LEGAX[S]; rel = P[v] - h0; rv = rel - rel.dot(ax) * ax
                r = (0.62 - wy) / 0.27 if wy >= 0.35 else 1 + (0.35 - wy) / 0.27
                a = (np.arctan2(rv[0], rv[2]) / (2 * np.pi)) % 1.0 * 8
                return k, min(r, 2.0), a
    return 0, 0, 0   # layer -> paint region (shirt, pants, boots, hair); boot soles get region 4
out = {}
for si, sg in enumerate(SEGS):
    if sg.startswith('hand'): continue    # the game keeps its own gloved hands (fingers curl round the grip)
    fs = [f for f in body if FS[tuple(f)] == si]
    keys = []; kidx = {}
    def K(v, L):
        k = (v, L)
        if k not in kidx: kidx[k] = len(keys); keys.append(k)
        return kidx[k]
    tris = []; fr = []
    def quad(f, L, reg):
        global tris, fr
        a_, b_, c_, d_ = (K(i, L) for i in f); tris += [a_, b_, c_, a_, c_, d_]; fr += [reg] * 2
    for f in fs:
        hidden = min(fullcov[i] for i in f) >= 0.999
        quad(f, 0, 6 if hidden else 0)
        for g, L in (('socks', 5),):
            if max(cov[g][i] for i in f) > 0 and f in GF[g] if False else (max(cov[g][i] for i in f) > 0 and sg not in ('head',)):
                reg = REGOF[L]
                if g == 'boots' and max(P[i, 1] for i in f) < solY + 0.026: reg = 4   # rubber sole and welt
                quad(f, L, reg)
    if sg == 'head':
        for f in hairF: quad(f, 4, 7)
    nk = len(keys); pos = np.zeros((nk, 3)); nrm = np.zeros((nk, 3)); nb = np.zeros(nk, dtype=np.int64); nw = np.zeros(nk); p2 = np.zeros((nk, 3)); cv_ = np.zeros(nk)
    nb2 = np.zeros(nk, dtype=np.int64); nw2 = np.zeros(nk); p3 = np.zeros((nk, 3))
    for k, (v, L) in enumerate(keys):
        q = LAY[L][v:v + 1]; pos[k] = XF[sg](q)[0]; cv_[k] = COV[L][v]
        pr = XF[sg](q + LN[L][v:v + 1] * 0.01)[0] - pos[k]; nrm[k] = pr / max(np.linalg.norm(pr), 1e-9)
        sl = pick2(SW2[v], sg)
        if len(sl) > 0: nb[k], nw[k] = sl[0]; p2[k] = XF[GSEG[sl[0][0]]](q)[0]
        if len(sl) > 1: nb2[k], nw2[k] = sl[1]; p3[k] = XF[GSEG[sl[1][0]]](q)[0]
    ck = np.zeros(nk); cr = np.zeros(nk); ca = np.zeros(nk)
    for k, (v, L) in enumerate(keys): ck[k], cr[k], ca[k] = cloth_coord(v, L)
    out[sg] = {'p': pos, 'n': nrm, 'fr': np.array(fr), 't': np.array(tris), 'q': p2, 'b': nb, 'w': nw, 'q2': p3, 'b2': nb2, 'w2': nw2, 'vid': np.array([v * 6 + L for v, L in keys]),
               'lock': np.zeros(nk, dtype=bool), 'h': cv_, 'ck': ck, 'cr': cr, 'ca': ca, 'keys': keys}
    print(sg, nk, 'verts', len(tris) // 3, 'tris', 'blend', (nw > 0.01).sum())
# ---- garments cut into the body segments like the body itself, with the same skinning and cloth coordinates
def g_cloth(gname, G, uvv, k):
    p = G[k]; wy = (p[1] - hip_anchor[1]) * s_tor + 0.95
    if gname != 'suit': return 0, 0, 0
    if uvv > 0.5:   # the T-shirt part of the outfit's texture: its lower part hangs from the shirt hoops
        r = 0 if wy >= 1.30 else ((1.30 - wy) / 0.20 if wy >= 1.10 else 1 + (1.10 - wy) / 0.195)
        return 1, min(r, 2.0), (np.arctan2(p[0], p[2] - hip_anchor[2]) / (2 * np.pi)) % 1.0 * 12
    for S, kk in (('L', 2), ('R', 3)):
        if (p[0] < 0) == (S == 'L') and wy < 0.62:
            h0, ax_ = LEGAX[S]; rel = p - h0; rv = rel - rel.dot(ax_) * ax_
            r = (0.62 - wy) / 0.27 if wy >= 0.35 else 1 + (0.35 - wy) / 0.27
            return kk, min(r, 2.0), (np.arctan2(rv[0], rv[2]) / (2 * np.pi)) % 1.0 * 8
    return 0, 0, 0
bseg = np.zeros(n, dtype=np.int64); _bv = {}
for f in body:
    for i in f: _bv.setdefault(i, Counter())[FS[tuple(f)]] += 1
for i, c_ in _bv.items(): bseg[i] = c_.most_common(1)[0][0]
# clothes are fitted to MakeHuman's hidden helper geometry (a tights-shaped shell over the body): a helper vertex goes with
# the body part of the nearest visible skin vertex
from scipy.spatial import cKDTree
_bl = np.array(sorted(_bv)); _tr = cKDTree(V[_bl])
_hl = np.array([i for i in range(n) if i not in _bv]); bseg[_hl] = bseg[_bl[_tr.query(V[_hl])[1]]]
# garment skin weights from the visible skin itself (the helper shell's own weights don't match the skin near the
# shoulders): the 4 nearest skin vertices to each garment vertex, by inverse distance, and its body part from the nearest
_tr_game = cKDTree(P[_bl])
for gd in GARM.values():
    dd_, ii_ = _tr_game.query(gd['G'], k=4); wq = 1.0 / np.maximum(dd_, 1e-4); wq /= wq.sum(1, keepdims=True)
    gd['W'] = (SW2[_bl[ii_]] * wq[:, :, None]).sum(1); gd['bs'] = bseg[_bl[ii_[:, 0]]]
gout = {}
for gname, gd in GARM.items():
    G, Ng, Wg, vt, gf = gd['G'], gd['N'], gd['W'], gd['vt'], gd['f']
    wyg = (G[:, 1] - hip_anchor[1]) * s_tor + 0.95
    # each garment vertex goes with the body part its main body vertex belongs to (so a sleeve is cut where the arm's
    # own skin is cut, and follows the arm), each face with the part most of its corners go with
    R_ = gd['refs']; Wr = np.array([r_[1] for r_ in None]) if False else None
    vsg = list(gd['bs'])
    def gseg(f):
        votes = Counter(vsg[c[0]] for c in f); k = votes.most_common(1)[0][0]
        if k in (SEGS.index('handL'), SEGS.index('handR')): k = SEGS.index('el' + SEGS[k][-1])
        return k
    FSg = [gseg(f) for f in gf]
    gout[gname] = {}
    for si, sg in enumerate(SEGS):
        fs = [f for f, k in zip(gf, FSg) if k == si]
        if not fs: continue
        keys = []; kidx = {}
        def K(v, t_):
            if (v, t_) not in kidx: kidx[(v, t_)] = len(keys); keys.append((v, t_))
            return kidx[(v, t_)]
        tris = []
        for f in fs:
            ids = [K(v, t_) for v, t_ in f]
            for j in range(1, len(ids) - 1): tris += [ids[0], ids[j], ids[j + 1]]
        nk = len(keys); pos = np.zeros((nk, 3)); nrm = np.zeros((nk, 3)); uv = np.zeros((nk, 2)); nb = np.zeros(nk, dtype=np.int64); nw = np.zeros(nk); p2 = np.zeros((nk, 3)); cc = np.zeros((nk, 3)); tm = np.zeros(nk)
        nb2 = np.zeros(nk, dtype=np.int64); nw2 = np.zeros(nk); p3 = np.zeros((nk, 3))
        for k, (v, t_) in enumerate(keys):
            q = G[v:v + 1]; pos[k] = XF[sg](q)[0]; uv[k] = vt[t_]
            pr = XF[sg](q + Ng[v:v + 1] * 0.01)[0] - pos[k]; nrm[k] = pr / max(np.linalg.norm(pr), 1e-9)
            tm[k] = 1.0 if gname == 'suit' and vt[t_][1] > 0.5 else 0.0
            cc[k] = g_cloth(gname, G, vt[t_][1], v)
            sl = pick2(Wg[v], sg)
            if len(sl) > 0: nb[k], nw[k] = sl[0]; p2[k] = XF[GSEG[sl[0][0]]](q)[0]
            if len(sl) > 1: nb2[k], nw2[k] = sl[1]; p3[k] = XF[GSEG[sl[1][0]]](q)[0]
        gout[gname][sg] = {'p': pos, 'n': nrm, 'uv': uv, 't': np.array(tris), 'q': p2, 'b': nb, 'w': nw, 'q2': p3, 'b2': nb2, 'w2': nw2, 'c': cc, 'tm': tm, 'keys': keys}
        print(gname, sg, nk, 'verts', len(tris) // 3, 'tris')
# ---- cloth particles: for each hoop and angle, the outfit vertex nearest it; the game pins the particle where it is
rig = []
for setk in (1, 2, 3):
    N = CLN[setk]
    cand = [(sg, k, d['c'][k]) for sg, d in gout['suit'].items() for k in range(len(d['keys'])) if d['c'][k][0] == setk]
    for ring in (1, 2):
        for i in range(N):
            def cost(c):
                da = abs(c[2] - i); da = min(da, N - da)
                return abs(c[1] - ring) * 4 + da
            sg, k, c = min(cand, key=lambda x: cost(x[2])); d = gout['suit'][sg]
            rig.append({'s': sg, 'p': [round(float(x), 4) for x in d['p'][k]], 'n': [round(float(x), 3) for x in d['n'][k]],
                        'b': int(d['b'][k]), 'w': round(float(d['w'][k]), 3), 'q': [round(float(x), 4) for x in d['q'][k]],
                        'b2': int(d['b2'][k]), 'w2': round(float(d['w2'][k]), 3), 'q2': [round(float(x), 4) for x in d['q2'][k]]})
print('cloth particles', len(rig))
json.dump(rig, open('/home/claude/hb/clothrig.json', 'w'))
for g in gout.values():
    for d in g.values(): del d['keys']
np.save('/home/claude/hb/garments.npy', gout, allow_pickle=True)
for d in out.values(): del d['keys']
np.save('/home/claude/hb/segs.npy', out, allow_pickle=True)
for S in 'LR':
    e = XF['head'](J[sk['bones']['eye.' + S]['head']]); print('eye', S, e.round(4), 'tail', XF['head'](J[sk['bones']['eye.' + S]['tail']]).round(4), 'headjoint', XF['head'](mj('head')).round(4))
