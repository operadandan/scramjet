# Rig the Studio arm viewmodel: bones for upper arm, forearm, hand, three per finger and thumb; skin weights; joint frames.
import pickle,json,struct,sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
V,VT,VN,groups,mtl=pickle.load(open('m.pkl','rb')); V=np.array(V); VT=np.array(VT); VN=np.array(VN)
S=0.088
fs=groups['Rightarm1']
corner={}   # unique corner (v,vt,vn) -> index
tri=[]
for f in fs:
    t=[]
    for c in f:
        if c not in corner: corner[c]=len(corner)
        t.append(corner[c])
    tri.append(t)
tri=np.array(tri); C=list(corner.keys())
P=V[[c[0] for c in C]]*S; N=VN[[c[2] for c in C]]; UV=VT[[c[1] for c in C]]
# weld by position for connectivity
key=np.round(P,5); uk,wid=np.unique(key,axis=0,return_inverse=True); wid=wid.ravel(); Wp=uk
E=set()
for a,b,c in tri:
    for x,y in ((wid[a],wid[b]),(wid[b],wid[c]),(wid[c],wid[a])):
        if x!=y: E.add((min(x,y),max(x,y)))
E=np.array(list(E)); L=np.linalg.norm(Wp[E[:,0]]-Wp[E[:,1]],axis=1)
G=coo_matrix((np.r_[L,L],(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),shape=(len(Wp),)*2).tocsr()
nc,lab=connected_components(G,directed=False)
sizes=[(lab==i).sum() for i in range(nc)]; handc=int(np.argmax(sizes)); sleevec=1-handc
hand=np.where(lab==handc)[0]; sleeve=np.where(lab==sleevec)[0]
cuffsrc=hand[Wp[hand,2]>Wp[hand,2].max()-0.06*S]
Dc=dijkstra(G,indices=cuffsrc,min_only=True)
# fingertips: geodesic maxima from the cuff
tips=[]
for v in hand[np.argsort(-Dc[hand])]:
    if Dc[v]<1.0*S: break
    dv=dijkstra(G,indices=v,limit=0.5*S); near=np.where(np.isfinite(dv))[0]
    if Dc[near].max()<=Dc[v]+1e-12: tips.append(v)
assert len(tips)==5, tips
# order: thumb = largest x; then by x descending: index, middle, ring, pinky
tips=sorted(tips,key=lambda v:-Wp[v,0])
names=['thumb','index','middle','ring','pinky']
Dt=np.array([dijkstra(G,indices=t) for t in tips])      # geodesic from each tip
Lf=np.array([1.19,1.05,1.10,1.07,0.84])*S               # MCP (CMC for thumb) to tip, from real proportions
ratio={'thumb':[0.44,0.30,0.26],'other':[0.46,0.29,0.25]}
near=np.argmin(Dt,axis=0)
# distal part of each finger: geodesically close to its own tip (clean); centerline from ring centroids
def ring(f,d,w=0.03*S):
    m=(near==f)&(np.abs(Dt[f]-d)<w)&(lab==handc); return Wp[m].mean(0)
J={}
for f,nm in enumerate(names):
    r=ratio['thumb' if f==0 else 'other']; Lt=Lf[f]
    ds=[];cs=[]
    for k in np.arange(0.06,0.78,0.04):
        m=(near==f)&(np.abs(Dt[f]-k*Lt)<0.03*S)&(lab==handc)
        if m.sum()>2: ds.append(k*Lt); cs.append(Wp[m].mean(0))
    ds=np.array(ds); cs=np.array(cs)
    co=[np.polyfit(ds,cs[:,i],2) for i in range(3)]
    ev=lambda d: np.array([np.polyval(c,d) for c in co])
    J[nm]=[ev(Lt),ev((r[2]+r[1])*Lt),ev(r[2]*Lt),ev(0.02*Lt)]
wristP=Wp[hand][np.abs(Dc[hand]-0.33*S)<0.05*S].mean(0)
# sleeve: elbow where the sleeve bends, shoulder end
sz=Wp[sleeve]
fore_dir0=None
elbowP=sz[np.abs(sz[:,2]-(-11.35*S))<0.12*S].mean(0)
endP=sz[sz[:,2]>sz[:,2].max()-0.12*S].mean(0)
wristEnd=sz[sz[:,2]<sz[:,2].min()+0.1*S].mean(0)
# hand frame
mcp=J['middle'][0]; fwd=mcp-wristP; fwd/=np.linalg.norm(fwd)
lat=J['index'][0]-J['pinky'][0]; lat-=fwd*np.dot(lat,fwd); lat/=np.linalg.norm(lat)
pn=np.cross(lat,fwd)
# palm side = the side the fingertips curl toward
curl=np.mean([np.dot(J[n][3]-J[n][0],pn) for n in names[1:]])
if curl<0: pn=-pn
fl=np.where(Dt[near,np.arange(len(Wp))]<0.55*Lf[near],near,-1)
palm=hand[np.min(Dt[:,hand]/Lf[:,None],axis=0)>1.0]; pc=Wp[palm]; dots=(pc-wristP)@pn
palmC=pc[dots>np.percentile(dots,80)].mean(0)     # a point on the palm surface
print('wrist',wristP/S,'elbow',elbowP/S,'end',endP/S,'mcp',mcp/S)
for n in names: print(n,[ (j/S).round(3).tolist() for j in J[n]])
# bones
bones=[]   # name,parent,pos
def add(nm,par,pos): bones.append([nm,par,np.asarray(pos,float)]); return len(bones)-1
bU=add('upper',-1,endP); bF=add('fore',-1,elbowP); bH=add('hand',-1,wristP)
fb={}
for n in names:
    a=add(n+'1',bH,J[n][0]); b=add(n+'2',a,J[n][1]); c=add(n+'3',b,J[n][2]); fb[n]=[a,b,c]
nb=len(bones)
# weights per welded vertex
Wt=np.zeros((len(Wp),nb))
def seg_t(p,a,b):
    ab=b-a; return np.clip(((p-a)@ab)/(ab@ab),-1,2)
for v in sleeve:
    p=Wp[v]; fd=elbowP-wristEnd; t=((p-elbowP)@(endP-elbowP))/np.linalg.norm(endP-elbowP)
    k=np.clip((t+0.25*S)/(0.5*S),0,1); k=k*k*(3-2*k)
    Wt[v,bU]=k; Wt[v,bF]=1-k
segs=[]   # (bone, a, b) for nearest-segment assignment in the hand
for n in names:
    a_,b_,c_=fb[n]; segs+= [(a_,J[n][0],J[n][1]),(b_,J[n][1],J[n][2]),(c_,J[n][2],J[n][3])]
for n in names[1:]: segs.append((bH,wristP,J[n][0]))
segs.append((bH,wristP,J['thumb'][0]))
def nearest(p):
    best=None
    for bo,a_,b_ in segs:
        ab=b_-a_; t=np.clip(((p-a_)@ab)/(ab@ab),0,1); d=np.linalg.norm(p-(a_+ab*t))
        if best is None or d<best[0]: best=(d,bo,t)
    return best
parent={bones[i][0]:bones[i][1] for i in range(nb)}
for v in hand:
    p=Wp[v]
    kw=np.clip((Dc[v]-0.12*S)/(0.36*S),0,1); kw=kw*kw*(3-2*kw)   # glove cuff: forearm -> hand
    f=near[v]; Lt=Lf[f]
    if Dt[f,v]<0.55*Lt:
        # distal two phalanges: by geodesic distance from the tip, blended at the joint
        r=ratio['thumb' if f==0 else 'other']; d3=r[2]*Lt; a_,b_,c_=fb[names[f]]
        x=np.clip((Dt[f,v]-(d3-0.012))/0.024,0,1); x=x*x*(3-2*x)
        Wt[v,c_]=1-x; Wt[v,b_]=x; continue
    d,bo,t=nearest(p)
    if bo==bH:
        Wt[v,bF]=1-kw; Wt[v,bH]=kw
        continue
    # proximal phalanx: blend into the hand near its base and into the middle phalanx near its end
    nm=bones[bo][0]
    if nm.endswith('1'):
        k=np.clip((t-0.0)/0.3,0,1); k=k*k*(3-2*k)
        Wt[v,bo]=k*kw; Wt[v,bH]=(1-k)*kw; Wt[v,bF]=1-kw
    else:
        Wt[v,bo]=1
# per corner
Wc=Wt[wid]
idx=np.argsort(-Wc,axis=1)[:,:4]; w=np.take_along_axis(Wc,idx,1); w/=w.sum(1,keepdims=True)
def pack(Pm,Nm,tri,idx,w,bones,frame,mirror):
    blob=bytearray()
    def put(b):
        while len(blob)%4: blob.append(0)
        o=len(blob); blob.extend(b); return o
    T=tri[:,[0,2,1]] if mirror else tri
    d=dict(n=len(Pm),ni=T.size,
        p=put(Pm.astype(np.float32).tobytes()),nr=put(np.round(Nm*127).astype(np.int8).tobytes()),uv=put(UV.astype(np.float32).tobytes()),
        si=put(idx.astype(np.uint8).tobytes()),sw=put(w.astype(np.float32).tobytes()),ix=put(T.astype(np.uint16).ravel().tobytes()))
    return d,blob
# origin at the wrist; the other arm = mirror in x
O=wristP.copy()
def frame_of(mx):
    M=np.array([mx,1,1])
    def t(p): return ((np.asarray(p)-O)*M).round(6).tolist()
    def tv(v): return (np.asarray(v)*M).round(6).tolist()
    return dict(wrist=t(wristP),elbow=t(elbowP),shoulder=t(endP),palm=t(palmC),fwd=tv(fwd),lat=tv(lat),pn=tv(pn),
                bones=[[b[0],b[1],t(b[2])] for b in bones],tips={n:t(J[n][3]) for n in names},
                radius={'thumb':[0.0105,0.0098,0.0088],'index':[0.0092,0.0085,0.0078],'middle':[0.0095,0.0088,0.008],'ring':[0.0092,0.0085,0.0077],'pinky':[0.0082,0.0076,0.007]})
out={'v':1,'arms':{}};blobs=bytearray()
for side,mx in (('L',1),('R',-1)):   # Studio's export is mirrored: its 'Right arm' is geometrically a left hand
    M=np.array([mx,1,1]); Pm=(P-O)*M; Nm=N/np.linalg.norm(N,axis=1,keepdims=True)*M
    d,b=pack(Pm,Nm,tri,idx,w,bones,None,mx<0)
    off=len(blobs)
    while off%4: blobs.append(0); off=len(blobs)
    for k in ('p','nr','uv','si','sw','ix'): d[k]+=off
    blobs.extend(b); d['frame']=frame_of(mx); out['arms'][side]=d
hdr=json.dumps(out).encode(); hdr+=b' '*((4-(len(hdr)+4)%4)%4)
open(sys.argv[1],'wb').write(struct.pack('<I',len(hdr))+hdr+bytes(blobs))
print('bones',nb,'verts',len(P),'tris',len(tri),'finger-labelled',[(fl==i).sum() for i in range(5)])
