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
cov = {g: np.zeros(n) for g in ('shirt', 'pants', 'boots')}
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
        # jeans: worn over the boots, the hem resting just under the ankle bone (the foot itself is not inside the leg)
        cov['pants'][i] = min(cov['pants'][i], np.clip(0.5 + 0.5 * (y - (ankleY - 0.012)) / 0.012, 0, 1))
for g in cov: cov[g][list(set(range(n)) - set(bv))] = 0
# which faces each garment covers (any part of)
GF = {g: [f for f in body if max(cov[g][i] for i in f) > 0.0 and SEGS[FS[tuple(f)]] not in ('handL', 'handR', 'head')] for g in cov}
# how far each sits off whatever is under it, and the least it may come in to after smoothing
ORDER = ['boots', 'pants', 'shirt']    # inside to outside where they overlap
BASE = {'pants': (0.0055, 0.0035), 'boots': (0.0035, 0.0025), 'shirt': (0.0065, 0.0048)}
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
    its = {'pants': 45, 'shirt': 45, 'boots': 12}[g]
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
fullcov = np.maximum.reduce([cov['pants'], cov['boots'], shirt_closed])
LAYERS = {'skin': 0, 'shirt': 1, 'pants': 2, 'boots': 3, 'hair': 4}
LAY = [P, GP['shirt'], GP['pants'], GP['boots'], PH]; LN = [Nv, GN['shirt'], GN['pants'], GN['boots'], NH]
COV = [np.ones(n), cov['shirt'], cov['pants'], cov['boots'], hf]
REGOF = {1: 1, 2: 2, 3: 3, 4: 7}   # layer -> paint region (shirt, pants, boots, hair); boot soles get region 4
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
        for g, L in (('shirt', 1), ('pants', 2), ('boots', 3)):
            if max(cov[g][i] for i in f) > 0 and f in GF[g] if False else (max(cov[g][i] for i in f) > 0 and sg not in ('head',)):
                reg = REGOF[L]
                if g == 'boots' and max(P[i, 1] for i in f) < solY + 0.016: reg = 4
                quad(f, L, reg)
    if sg == 'head':
        for f in hairF: quad(f, 4, 7)
    nk = len(keys); pos = np.zeros((nk, 3)); nrm = np.zeros((nk, 3)); nb = np.zeros(nk, dtype=np.int64); nw = np.zeros(nk); p2 = np.zeros((nk, 3)); cv_ = np.zeros(nk)
    for k, (v, L) in enumerate(keys):
        q = LAY[L][v:v + 1]; pos[k] = XF[sg](q)[0]; cv_[k] = COV[L][v]
        pr = XF[sg](q + LN[L][v:v + 1] * 0.01)[0] - pos[k]; nrm[k] = pr / max(np.linalg.norm(pr), 1e-9)
        best = max(NB[sg], key=lambda m: SW2[v, SEGS.index(m)]); wn = SW2[v, SEGS.index(best)]; ws = SW2[v, si]
        if wn <= 1e-4: continue
        nb[k] = GSEG.index(best); nw[k] = wn / (ws + wn) if ws + wn > 0 else 0
        p2[k] = XF[best](q)[0]
    out[sg] = {'p': pos, 'n': nrm, 'fr': np.array(fr), 't': np.array(tris), 'q': p2, 'b': nb, 'w': nw, 'vid': np.array([v * 5 + L for v, L in keys]),
               'lock': np.zeros(nk, dtype=bool), 'h': cv_}
    print(sg, nk, 'verts', len(tris) // 3, 'tris', 'blend', (nw > 0.01).sum())
np.save('/home/claude/hb/segs.npy', out, allow_pickle=True)
for S in 'LR':
    e = XF['head'](J[sk['bones']['eye.' + S]['head']]); print('eye', S, e.round(4), 'tail', XF['head'](J[sk['bones']['eye.' + S]['tail']]).round(4), 'headjoint', XF['head'](mj('head')).round(4))
