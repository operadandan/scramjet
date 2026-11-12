# Roblox OBJ export -> BREACH model bin for the G17. Same frame as the M4 (metres, muzzle toward -Z, up +Y, right +X).
# Studio's model is oversized, so it is scaled to a real G17: 202 mm long overall.
import pickle,json,struct,sys
import numpy as np
V,VT,VN,groups,mtl=pickle.load(open('m.pkl','rb'))
V=np.array(V);VT=np.array(VT);VN=np.array(VN)
S=0.202/(-15.744+20.352)
X0=66.754; Y0=2.778; Z0=(-20.298-16.160)/2       # bore axis, middle of the slide
def tf(p): return np.stack([(p[:,0]-X0)*S,(p[:,1]-Y0)*S+0.014,(p[:,2]-Z0)*S],1)
# texture set per part: 0 frame and controls, 1 slide, 2 magazine, 3 barrel, 4 sights (painted), 5 brass round (painted)
MAT={'SlideRelease1':0,'MagRelease1':0,'Frame1':0,'Safety1':0,'Trigger1':0,'Slide1':1,'Magazine1':2,'Barrel1':3,'RearSight1':4,'FrontSight1':4,'Cartridge1':5}
parts=[];blob=bytearray()
def put(b):
    while len(blob)%4: blob.append(0)
    o=len(blob); blob.extend(b); return o
for name,fs in groups.items():
    if name not in MAT: continue      # Shell/Bullet: the chambered round, hidden inside the barrel
    vi=[]; m={}
    for f in fs:
        for t in f:
            if t not in m: m[t]=len(vi); vi.append(t)
    idx=np.array([[m[t] for t in f] for f in fs],dtype=np.uint16 if len(vi)<65536 else np.uint32).ravel()
    P=tf(V[[k[0] for k in vi]]).astype(np.float32)
    N=VN[[k[2] for k in vi]]; N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9
    N=np.round(N*127).astype(np.int8)
    U=VT[[k[1] for k in vi]].astype(np.float32)
    parts.append(dict(name=name[:-1],mat=MAT[name],n=len(vi),ni=len(idx),i32=bool(idx.dtype==np.uint32),
      p=put(P.tobytes()),nr=put(N.tobytes()),uv=put(U.tobytes()),ix=put(idx.tobytes()),
      min=[round(float(x),5) for x in P.min(0)],max=[round(float(x),5) for x in P.max(0)]))
hdr=json.dumps({'v':1,'parts':parts}).encode()
hdr+=b' '*((4-(len(hdr)+4)%4)%4)
open(sys.argv[1],'wb').write(struct.pack('<I',len(hdr))+hdr+bytes(blob))
for p in parts: print(p['name'],p['mat'],p['min'],p['max'])
