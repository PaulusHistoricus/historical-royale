import sys, json, os
sys.path.insert(0,os.path.dirname(__file__))
from extract import *

def row_frames(a,fg,row,x0,splits={}):
    fr=frames_in_row(fg,row[0],row[1],x0)
    res=[]
    for i,b in enumerate(fr):
        res+= split_at(fg,b,splits[i]) if i in splits else [b]
    return res

def cut(a,fg,box):
    x0,y0,x1,y1=box
    rgb=a[y0:y1,x0:x1]; m=fg[y0:y1,x0:x1]
    # alleen het grootste samenhangende stuk + alles wat dichtbij hoort (pijl, vonken)
    return rgb.astype(np.uint8), m

def anchor_of(m):
    h=m.shape[0]; ys,xs=np.where(m[int(h*0.78):])
    return float(xs.mean()), h

def hue_shift(rgb, m, src, dst, minsat=.38, width=22):
    out=rgb.copy().astype(float)/255
    flat=out.reshape(-1,3); mf=m.reshape(-1)
    import numpy as np
    r,g,b=flat[:,0],flat[:,1],flat[:,2]
    mx=flat.max(1); mn=flat.min(1); d=mx-mn+1e-9
    h=np.where(mx==r,((g-b)/d)%6,np.where(mx==g,(b-r)/d+2,(r-g)/d+4))*60
    s=d/(mx+1e-9); v=mx
    dist=np.minimum(abs(h-src),360-abs(h-src))
    sel=mf&(dist<width)&(s>minsat)&(v>.18)
    nh=(h+(dst-src))%360
    hh=nh[sel]/60; i=np.floor(hh).astype(int)%6; f=hh-np.floor(hh)
    V=v[sel]; S=s[sel]; p=V*(1-S); q=V*(1-S*f); t=V*(1-S*(1-f))
    R=np.choose(i,[V,q,p,p,t,V]); G=np.choose(i,[t,V,V,q,p,p]); B=np.choose(i,[p,p,t,V,V,q])
    flat[sel]=np.stack([R,G,B],1)
    return (out*255).clip(0,255).astype(np.uint8)

def build(OUT, name, groups, target_h, ref_group, variants):
    """groups: dict anim -> list of (rgb, mask)"""
    ref_rgb,ref_m=groups[ref_group][0]
    scale=target_h/ref_m.shape[0]
    items=[]
    for anim,frames in groups.items():
        for rgb,m in frames:
            ax,h=anchor_of(m)
            items.append((anim,rgb,m,ax))
    left=max(ax for _,_,_,ax in items); right=max(m.shape[1]-ax for _,_,m,ax in items)
    height=max(m.shape[0] for _,_,m,_ in items)
    cw=int(np.ceil((left+right)*scale))+4; ch=int(np.ceil(height*scale))+4
    ax_cell=int(round(left*scale))+2
    anims={}; n=0
    cols=min(len(items),10); rows=-(-len(items)//cols)  # max 10 kolommen: textuur blijft < 2048 px breed
    sheets={v:Image.new('RGBA',(cw*cols,ch*rows),(0,0,0,0)) for v in variants}
    for anim,rgb,m,ax in items:
        for v,fn in variants.items():
            col=fn(rgb,m)
            alpha=(m*255).astype(np.uint8)
            edge=m & ~ndi.binary_erosion(m,iterations=1)
            alpha[edge]=150
            im=Image.fromarray(np.dstack([col,alpha]),'RGBA')
            # premultiplied resize voorkomt witte randen
            w2=max(1,int(round(m.shape[1]*scale))); h2=max(1,int(round(m.shape[0]*scale)))
            pm=np.array(im).astype(float); pm[...,:3]*=pm[...,3:]/255
            pmr=np.array(Image.fromarray(pm.clip(0,255).astype(np.uint8),'RGBA').resize((w2,h2),Image.LANCZOS)).astype(float)
            al=pmr[...,3:]; pmr[...,:3]=np.where(al>0,pmr[...,:3]*255/np.maximum(al,1),0)
            small=Image.fromarray(pmr.clip(0,255).astype(np.uint8),'RGBA')
            ox=(n%cols)*cw+ax_cell-int(round(ax*scale)); oy=(n//cols)*ch+ch-2-h2
            sheets[v].alpha_composite(small,(ox,oy))
        anims.setdefault(anim,[]).append(n); n+=1
    for v,sh in sheets.items(): sh.save(f'{OUT}/{name}{v}.png',optimize=True)
    return {'frameWidth':cw,'frameHeight':ch,'originX':round(ax_cell/cw,4),'originY':round((ch-2)/ch,4),'anims':anims,
            'textures':[f'{name}{v}' for v in variants]}

def build_units(SRC, OUT, MANIFEST):
    manifest={}
    ident=lambda rgb,m: rgb
    toblue=lambda rgb,m: hue_shift(rgb,m,358,218,minsat=.42,width=16)

    # Legionair
    a=load(SRC+'legionair.png'); fg=fg_mask(a); x0=225
    rows=[r for r in bands(fg[:,x0:].sum(1),2,2) if r[1]-r[0]>40]
    F=[row_frames(a,fg,r,x0,{3:[950,1126]} if i==2 else {}) for i,r in enumerate(rows)]
    G={k:[cut(a,fg,b) for b in F[i]] for i,k in enumerate(['idle','walk','attack','hit','death'])}
    manifest['melee']=build(OUT,'legionary',G,108,'idle',{'-red':ident,'-blue':toblue})

    # Boogschutter
    a=load(SRC+'boogschutter.png'); fg=fg_mask(a)
    rows=[r for r in bands(fg.sum(1),2,2) if r[1]-r[0]>40]
    F=[row_frames(a,fg,r,0,{4:[1178]} if i==2 else {}) for i,r in enumerate(rows)]
    G={k:[cut(a,fg,b) for b in F[i]] for i,k in enumerate(['idle','walk','attack','hit','death'])}
    manifest['archer']=build(OUT,'archer',G,108,'idle',{'':ident})

    # Kanon: lopen/vuren uit afbeelding 3, kapot kanon uit afbeelding 4
    a3=load(SRC+'arena-kanon-a.png'); f3=fg_mask(a3); f3[:600]=False
    r3=[r for r in bands(f3.sum(1),2,2) if r[1]-r[0]>40][0]
    c3=row_frames(a3,f3,r3,0)
    a4=load(SRC+'arena-kanon-b.png'); f4=fg_mask(a4); f4[:700]=False
    r4=[r for r in bands(f4.sum(1),2,2) if r[1]-r[0]>40][0]
    c4=row_frames(a4,f4,r4,0)
    G={'idle':[cut(a3,f3,c3[0])],'walk':[cut(a3,f3,b) for b in c3[0:4]],
       'attack':[cut(a3,f3,c3[3]),cut(a3,f3,c3[4]),cut(a3,f3,c3[5]),cut(a3,f3,c3[6])],
       'death':[cut(a4,f4,c4[-1])]}
    G['hit']=[G['idle'][0]]
    manifest['cannon']=build(OUT,'cannon',G,100,'walk',{'-red':ident,'-blue':toblue})
    json.dump(manifest,open(MANIFEST,'w'),indent=1)
    return manifest
