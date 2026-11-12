# Roblox OBJ export -> BREACH model bin for the G17. Same frame as the M4 (metres, muzzle toward -Z, up +Y, right +X).
# Studio gave these parts no usable UVs, so each vertex gets a box-projected UV (for the game's own grain and stipple maps).
import pickle,json,struct,sys
import numpy as np
V,VT,VN,groups,mtl=pickle.load(open('m.pkl','rb'))
V=np.array(V);VN=np.array(VN)
S=0.186/1.043                       # slide length in studs -> a real G17 slide, 186 mm
X0=23.5185; Y0=2.4853; Z0=-7.8045   # bore axis, slide middle
def tf(p): return np.stack([(p[:,0]-X0)*S,(p[:,1]-Y0)*S+0.014,(p[:,2]-Z0)*S],1)
parts=[];blob=bytearray()
def put(b):
    while len(blob)%4: blob.append(0)
    o=len(blob); blob.extend(b); return o
for name,fs in groups.items():
    vi=[]; m={}
    for f in fs:
        for t in f:
            if t not in m: m[t]=len(vi); vi.append(t)
    idx=np.array([[m[t] for t in f] for f in fs],dtype=np.uint16 if len(vi)<65536 else np.uint32).ravel()
    P=tf(V[[k[0] for k in vi]]).astype(np.float32)
    N=VN[[k[2] for k in vi]]; N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9
    ax=np.abs(N).argmax(1)
    U=np.where(ax[:,None]==0,P[:,[2,1]],np.where(ax[:,None]==1,P[:,[0,2]],P[:,[0,1]]))*24
    N=np.round(N*127).astype(np.int8)
    parts.append(dict(name=name[:-1] if name.endswith('1') else name,mat=0,n=len(vi),ni=len(idx),i32=bool(idx.dtype==np.uint32),
      p=put(P.tobytes()),nr=put(N.tobytes()),uv=put(U.astype(np.float32).tobytes()),ix=put(idx.tobytes()),
      min=[round(float(x),5) for x in P.min(0)],max=[round(float(x),5) for x in P.max(0)]))
hdr=json.dumps({'v':1,'parts':parts}).encode()
hdr+=b' '*((4-(len(hdr)+4)%4)%4)
open(sys.argv[1],'wb').write(struct.pack('<I',len(hdr))+hdr+bytes(blob))
for p in parts: print(p['name'],p['min'],p['max'])
