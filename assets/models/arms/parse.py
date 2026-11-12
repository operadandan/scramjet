import json,sys
src=sys.argv[1] if len(sys.argv)>1 else 'src/M4.obj'
V=[];VT=[];VN=[];groups={};cur=None;mtl={}
for line in open(src):
    if line.startswith('v '): V.append(tuple(map(float,line.split()[1:4])))
    elif line.startswith('vt '): VT.append(tuple(map(float,line.split()[1:3])))
    elif line.startswith('vn '): VN.append(tuple(map(float,line.split()[1:4])))
    elif line.startswith('g '): cur=line.split()[1]; groups[cur]=[]
    elif line.startswith('usemtl'): mtl[cur]=line.split()[1]
    elif line.startswith('f '):
        f=[tuple(int(x)-1 for x in t.split('/')) for t in line.split()[1:]]
        for i in range(1,len(f)-1): groups[cur].append((f[0],f[i],f[i+1]))
import pickle; pickle.dump((V,VT,VN,groups,mtl),open('m.pkl','wb'))
for g,fs in groups.items():
    idx=set(t[0] for f in fs for t in f); xs=[V[i] for i in idx]
    mn=[min(p[k] for p in xs) for k in range(3)]; mx=[max(p[k] for p in xs) for k in range(3)]
    print(f"{g:24s} tris={len(fs):6d} x {mn[0]:.3f}..{mx[0]:.3f} y {mn[1]:.3f}..{mx[1]:.3f} z {mn[2]:.3f}..{mx[2]:.3f}")
