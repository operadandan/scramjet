# Roblox Studio OBJ exports in new/ -> BREACH model bins + texture sets in public/models/<name>/.
# Game frame: metres, muzzle toward -Z, up +Y, right +X (the M4's). Run from this folder: python3 build_new.py
# Every textured part gets a tint so the whole kit lands on the M4's finish (black anodised / polymer, luma ~60 of 255);
# the bin's per-part "col" is that tint (sRGB multiplier on the colour map), "mat" the texture set, or a special:
#   -1 glass (lens, window), -2 brass (cartridges).
import json, struct, os, sys
import numpy as np
from PIL import Image
OUT = '../../public/models/'
TARGET = 60.0   # the M4 colour map's mean luma

def load(src):
    V = []; VT = []; VN = []; groups = {}; mtl = {}; cur = None
    for line in open(src):
        if line.startswith('v '): V.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('vt '): VT.append(tuple(map(float, line.split()[1:3])))
        elif line.startswith('vn '): VN.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('g '): cur = line.split()[1]; groups[cur] = []
        elif line.startswith('usemtl'): mtl[cur] = line.split()[1]
        elif line.startswith('f '):
            f = [tuple(int(x) - 1 for x in t.split('/')) for t in line.split()[1:]]
            for i in range(1, len(f) - 1): groups[cur].append((f[0], f[i], f[i + 1]))
    return np.array(V), np.array(VT), np.array(VN), groups, mtl

def mtllib(path):
    M = {}; cur = None
    for line in open(path):
        p = line.split()
        if not p: continue
        if p[0] == 'newmtl': cur = p[1]; M[cur] = {}
        elif p[0] in ('Kd', 'Ks', 'Ka'): M[cur][p[0]] = [float(x) for x in p[1:4]]
        elif p[0] == 'd': M[cur]['d'] = float(p[1])
        elif p[0].startswith('map_'): M[cur][p[0]] = p[1]
    return M

def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def texset(srcdir, diff, nmap, spec, outbase, metal=1.0, rough=None, size=1024):
    """colour, normal and ORM maps for one texture set; returns the colour map's mean luma"""
    d = Image.open(os.path.join(srcdir, diff)).convert('RGB')
    if max(d.size) > size: d = d.resize((size, size) if d.size[0] == d.size[1] else (min(d.size[0], size), min(d.size[1], size)), Image.LANCZOS)
    d.save(outbase + '_col.jpg', quality=90)
    if nmap and os.path.exists(os.path.join(srcdir, nmap)):
        n = Image.open(os.path.join(srcdir, nmap)).convert('RGB')
        if max(n.size) > size: n = n.resize(d.size, Image.LANCZOS)
    else: n = Image.new('RGB', d.size, (128, 128, 255))
    n.save(outbase + '_nrm.png', optimize=True)
    if spec and os.path.exists(os.path.join(srcdir, spec)):
        s = np.asarray(Image.open(os.path.join(srcdir, spec)).convert('RGB').resize(d.size, Image.LANCZOS)).astype(float)
        met = s[..., 0] * metal; ro = s[..., 1] if rough is None else np.full(s.shape[:2], rough * 255)
    else:
        met = np.full((d.size[1], d.size[0]), 255 * 0.15 * metal); ro = np.full((d.size[1], d.size[0]), 255 * (rough if rough is not None else 0.62))
    orm = np.stack([np.full_like(met, 255), np.clip(ro, 30, 255), np.clip(met, 0, 255)], -1).astype(np.uint8)
    Image.fromarray(orm).save(outbase + '_orm.png', optimize=True)
    a = np.asarray(d).astype(float); return float((a @ [0.299, 0.587, 0.114]).mean())

def build(cfg):
    src = cfg['src']; V, VT, VN, groups, mtl = load(src); M = mtllib(src[:-3] + 'mtl'); srcdir = os.path.dirname(src)
    od = OUT + cfg['name'] + '/'; os.makedirs(od, exist_ok=True)
    S, O, fwd = cfg['scale'], np.array(cfg['origin']), cfg['fwd']; yoff = cfg.get('yoff', 0)
    # muzzle toward model -X (fwd '-x') or +X (fwd '+x'); model Y is up
    if fwd == '-x':
        tf = lambda p: np.stack([-(p[:, 2] - O[2]) * S, (p[:, 1] - O[1]) * S + yoff, (p[:, 0] - O[0]) * S], 1); tn = lambda n: np.stack([-n[:, 2], n[:, 1], n[:, 0]], 1)
    elif fwd == '+x':
        tf = lambda p: np.stack([(p[:, 2] - O[2]) * S, (p[:, 1] - O[1]) * S + yoff, -(p[:, 0] - O[0]) * S], 1); tn = lambda n: np.stack([n[:, 2], n[:, 1], -n[:, 0]], 1)
    else:   # '-z': model -Z is forward, model X is right
        tf = lambda p: np.stack([(p[:, 0] - O[0]) * S, (p[:, 1] - O[1]) * S + yoff, (p[:, 2] - O[2]) * S], 1); tn = lambda n: n
    # texture sets: one per distinct colour map the kept parts use
    sets = {}; lum = {}
    for g in groups:
        if g in cfg.get('drop', []): continue
        m = M[mtl[g]]; key = m.get('map_Kd')
        if g in cfg.get('glass', []) or g in cfg.get('brass', []) or key is None or key in sets: continue
        sets[key] = len(sets); base = od + cfg['sets'].get(key, {}).get('name', 'set%d' % sets[key])
        o = cfg['sets'].get(key, {})
        lum[key] = texset(srcdir, key, m.get('map_Bump'), m.get('map_Ns'), base, o.get('metal', 1.0), o.get('rough'))
    main = M[mtl[cfg['main']]]['Kd']; mainL = float(lin2srgb(np.array(main)).mean())
    parts = []; blob = bytearray()
    def put(b):
        while len(blob) % 4: blob.append(0)
        o = len(blob); blob.extend(b); return o
    for g, fs in groups.items():
        if g in cfg.get('drop', []): continue
        name = cfg.get('names', {}).get(g, g[:-1] if g.endswith('1') else g)
        vi = []; mp = {}
        for f in fs:
            for t in f:
                if t not in mp: mp[t] = len(vi); vi.append(t)
        idx = np.array([[mp[t] for t in f] for f in fs], dtype=np.uint16 if len(vi) < 65536 else np.uint32).ravel()
        P = tf(V[[k[0] for k in vi]]).astype(np.float32)
        N = tn(VN[[k[2] for k in vi]]); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9; N = np.round(N * 127).astype(np.int8)
        U = VT[[k[1] for k in vi]].astype(np.float32)
        m = M[mtl[g]]; col = [1, 1, 1]
        if g in cfg.get('glass', []): mat = -1
        elif g in cfg.get('brass', []): mat = -2
        else:
            key = m['map_Kd']; mat = sets[key]
            # the part's own shade relative to the gun's main part, kept but compressed; then everything scaled to the target
            rel = float(lin2srgb(np.array(m['Kd'])).mean()) / max(mainL, 1e-4); rel = min(1.6, max(0.75, rel ** 0.35))
            rel *= cfg.get('shade', {}).get(g, 1.0)
            k = TARGET / max(lum[key], 1) * rel; col = [round(min(k, 4.0), 4)] * 3
        parts.append(dict(name=name, mat=mat, col=col, n=len(vi), ni=len(idx), i32=bool(idx.dtype == np.uint32),
            p=put(P.tobytes()), nr=put(N.tobytes()), uv=put(U.tobytes()), ix=put(idx.tobytes()),
            min=[round(float(x), 5) for x in P.min(0)], max=[round(float(x), 5) for x in P.max(0)]))
    names = [None] * len(sets)
    for key, i in sets.items(): names[i] = cfg['sets'].get(key, {}).get('name', 'set%d' % i)
    hdr = json.dumps({'v': 2, 'sets': names, 'parts': parts}).encode(); hdr += b' ' * ((4 - (len(hdr) + 4) % 4) % 4)
    open(od + cfg['name'] + '.bin', 'wb').write(struct.pack('<I', len(hdr)) + hdr + bytes(blob))
    print('==', cfg['name'], names)
    for p in parts: print('  %-48s mat %2d col %.2f  %s %s' % (p['name'], p['mat'], p['col'][0], p['min'], p['max']))

CFG = {
  # Barrett M82A1: 1.448 m. Same frame as the old hand-built M107: trigger 0.103 behind the bore origin, bore on y 0
  'm82': dict(name='m82', src='new/M82A1/M82A1.obj', fwd='-x', scale=1.448 / (1.738 + 6.230), origin=[-0.445 - 0.103 / (1.448 / 7.968), 5.078, 8.6345],
    main='Meshesgooglemeshermesher1', glass=['MeshesgunkKitMomentc14scope005c14scope0041'], brass=['Bullets1'],
    names={'Meshesgooglemeshermesher1': 'Receiver', 'MeshesgunkKitMomentc14scope002c14scope0011': 'Scope', 'MeshesgunkKitMomentc14scope005c14scope0041': 'ScopeLens',
           'MeshesgunkKitMomentc14scope003c14scope0021': 'ScopeCapFront', 'MeshesgunkKitMomentc14scope004c14scope0031': 'ScopeCapRear', 'Meshpart1': 'ScopeMount',
           'Meshesgooglemesher001mesher0011': 'Handguard', 'Meshesgooglemesher002mesher0021': 'Grip', 'Meshesgooglemesher003mesher0031': 'Detail',
           'Meshesgooglemesher004mesher0041': 'Pad', 'Meshesgooglemesher005mesher0051': 'BipodL', 'Meshesgooglemesher006mesher0061': 'BipodR', 'Meshesgooglemesher007mesher0071': 'BipodMount',
           'Bullets1': 'MagazineCartridges', 'Mag1': 'Magazine', 'Bolt1': 'ChargingHandle'},
    sets={'Meshpart1_diff.png': dict(name='body'), 'Meshesgooglemesher004mesher0041_diff.png': dict(name='poly', metal=0.15, rough=0.7)},
    shade={'Bolt1': 1.25}),
  # Remington 870: 0.987 m like the old one; trigger at z 0.032, bore on y 0
  'm870': dict(name='m870', src='new/M870/M870.obj', fwd='-x', scale=0.987 / (14.223 - 9.070), origin=[12.372 - 0.032 / (0.987 / 5.153), 5.19, -4.8025],
    main='Body1', names={'MeshesimportMiscm870mo005m870md0051': 'Pump', 'MeshesimportMiscsawnoffm870mo003sawnoffm870md0031': 'ActionBars', 'MeshesimportMiscsawnoffm870mo005sawnoffm870md0051': 'TopRib', 'Sheild1': 'Shield'},
    sets={'MagazineTube1_diff.png': dict(name='steel', metal=0.55), 'Stock1_diff.png': dict(name='poly', metal=0.12, rough=0.72)}, shade={'Body1': 0.85, 'Barrel1': 0.85, 'MagazineTube1': 0.85}),
  # Trijicon MRO on its mount: 66 mm long; objective (the big lens) toward model +X; base of the mount at y 0
  'mro': dict(name='mro', src='new/Trijicon MRO/MRO.obj', fwd='+x', scale=0.066 / 0.205, origin=[25.05, 2.339, -63.40], main='Partc81e1', glass=['Part0b2d1'],
    names={'Partc81e1': 'Body', 'Object3ba71': 'Tube', 'Object201c1': 'Objective', 'Partce3b1': 'Eyepiece', 'Part0b2d1': 'Lens'},
    sets={'Partce3b1_diff.png': dict(name='body', metal=0.6)}),
  # EOTech 552-style: 142 mm long; window toward model -X; base at y 0
  'eotech': dict(name='eotech', src='new/Eotech 522/Eotech522.obj', fwd='-x', scale=0.142 / 2.35, origin=[0.162, 24.37, -0.615], main='Meshpart2', glass=['Meshpart1'],
    names={'Meshpart2': 'Body', 'Meshpart1': 'Window'}, sets={'Meshpart2_diff.png': dict(name='body', metal=0.7)}),
  # vertical foregrip: 95 mm tall; rail clamp along model Z; top of the clamp at y 0
  'vfg': dict(name='vfg', src='new/Vertical Grip/VerticalGrip.obj', fwd='-z', scale=0.095 / 2.0, origin=[58.55, 2.846, 17.23], main='Handle1',
    names={'Handle1': 'Handle', 'Base1': 'Base', 'Adjust1': 'Lever'}, sets={'Adjust1_diff.png': dict(name='body', metal=0.2, rough=0.66)}),
}
for k in (sys.argv[1:] or CFG): build(CFG[k])
