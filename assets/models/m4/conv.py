# Roblox OBJ export -> BREACH model bin. Game frame: barrel toward -Z, up +Y, ejection port on +X, metres.
import pickle,json,struct,sys
import numpy as np
V,VT,VN,groups,mtl=pickle.load(open('m.pkl','rb'))
V=np.array(V);VT=np.array(VT);VN=np.array(VN)
S=0.28
X0=(23.608+23.892)/2; Z0=-7.5465; Y0=1.511
def tf(p): return np.stack([-(p[:,2]-Z0)*S,(p[:,1]-Y0)*S+0.0245,(p[:,0]-X0)*S-0.034],1)
def tn(n): return np.stack([-n[:,2],n[:,1],n[:,0]],1)
print('uv range',VT.min(0),VT.max(0))
parts=[];blob=bytearray()
def put(b):
    while len(blob)%4: blob.append(0)
    o=len(blob); blob.extend(b); return o
for name,fs in groups.items():
    vi=[]; m={}
    for f in fs:
        for t in f:
            k=t
            if k not in m: m[k]=len(vi); vi.append(k)
    idx=np.array([[m[t] for t in f] for f in fs],dtype=np.uint16 if len(vi)<65536 else np.uint32).ravel()
    P=tf(V[[k[0] for k in vi]]).astype(np.float32)
    N=tn(VN[[k[2] for k in vi]]); N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9
    N=np.round(N*127).astype(np.int8)
    U=VT[[k[1] for k in vi]].astype(np.float32)
    parts.append(dict(name=name.rstrip('1'),mat=1 if 'Cartridge' in name else 0,n=len(vi),ni=len(idx),i32=idx.dtype==np.uint32,
      p=put(P.tobytes()),nr=put(N.tobytes()),uv=put(U.tobytes()),ix=put(idx.tobytes()),
      min=[round(float(x),5) for x in P.min(0)],max=[round(float(x),5) for x in P.max(0)]))
hdr=json.dumps({'v':1,'parts':parts}).encode()
hdr+=b' '*((4-(len(hdr)+4)%4)%4)
out=struct.pack('<I',len(hdr))+hdr+bytes(blob)
open(sys.argv[1],'wb').write(out); print(len(out)//1024,'KB')
for p in parts: print(p['name'],p['min'],p['max'])
