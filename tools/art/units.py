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

def load_rgba(path, cutoff=30):
    """Bron met echte transparantie: alfa onder `cutoff` (waas) telt als leeg."""
    A=np.array(Image.open(path).convert('RGBA')).astype(np.int16)
    al=A[...,3].astype(np.float32)
    al=np.where(al<cutoff,0,np.minimum(255,al*255/250))
    fg=al>0
    lab,n=ndi.label(fg)
    if n:
        sizes=ndi.sum(fg,lab,range(1,n+1))
        fg=np.isin(lab,[i+1 for i,s in enumerate(sizes) if s>=60])
    return A[...,:3], fg, (al*fg).astype(np.uint8)

def rgba_unit(path, anims, splits={}):
    """Eén sheet met één rij per animatie (volgorde `anims`). splits: {(rij, frame): [x, ...]}."""
    rgb,fg,al=load_rgba(path)
    rows=[r for r in bands(fg.sum(1),2,2) if r[1]-r[0]>40]
    assert len(rows)==len(anims), (path, rows)
    G={}
    for ri,(name,row) in enumerate(zip(anims,rows)):
        parts=[]
        for fi,b in enumerate(frames_in_row(fg,row[0],row[1],0)):
            parts += split_components(fg,b,splits[(ri,fi)]) if (ri,fi) in splits else [(b,fg[b[1]:b[3],b[0]:b[2]])]
        G[name]=[(rgb[y0:y1,x0:x1].astype(np.uint8), m, (al[y0:y1,x0:x1]*m).astype(np.uint8)) for (x0,y0,x1,y1),m in parts]
    return G

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
    ref_m=groups[ref_group][0][1]
    scale=target_h/ref_m.shape[0]
    items=[]
    for anim,frames in groups.items():
        for fr in frames:
            rgb,m=fr[0],fr[1]
            ax,h=anchor_of(m)
            items.append((anim,rgb,m,ax,fr[2] if len(fr)>2 else None))
    left=max(it[3] for it in items); right=max(it[2].shape[1]-it[3] for it in items)
    height=max(it[2].shape[0] for it in items)
    cw=int(np.ceil((left+right)*scale))+4; ch=int(np.ceil(height*scale))+4
    ax_cell=int(round(left*scale))+2
    anims={}; n=0
    cols=min(len(items),10); rows=-(-len(items)//cols)  # max 10 kolommen: textuur blijft < 2048 px breed
    sheets={v:Image.new('RGBA',(cw*cols,ch*rows),(0,0,0,0)) for v in variants}
    for anim,rgb,m,ax,src_alpha in items:
        for v,fn in variants.items():
            if src_alpha is not None:   # bron heeft echte transparantie
                col,alpha=fn(rgb,m),src_alpha
            else:
                col,alpha=matte(fn(rgb,m),m)
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
    # Nieuwe eenheden (bronnen met transparantie; één rij per animatie)
    ROWS=['idle','walk','attack','hit','death']
    toredC=lambda rgb,m: hue_shift(rgb,m,222,358,minsat=.30,width=26)
    G=rgba_unit(SRC+'ruiter.png',ROWS,{(2,3):[940,1195]})
    manifest['cavalry']=build(OUT,'cavalry',G,136,'idle',{'-red':ident,'-blue':toblue})
    G=rgba_unit(SRC+'berserker.png',ROWS,{(2,3):[952]})
    manifest['berserker']=build(OUT,'berserker',G,112,'idle',{'-red':ident,'-blue':toblue})
    G=rgba_unit(SRC+'ruiterboogschutter.png',ROWS,{(4,2):[651]})
    manifest['horse_archer']=build(OUT,'horse_archer',G,140,'idle',{'':ident})
    G=rgba_unit(SRC+'musketier.png',ROWS,{(1,1):[376],(2,2):[552,722],(4,0):[176,340]})
    manifest['musket']=build(OUT,'musket',G,114,'idle',{'-blue':ident,'-red':toredC})
    # Animatieborden op donkere achtergrond (zie boards.py). Coördinaten = bronpixels.
    from boards import board_unit
    tored = lambda rgb,m: hue_shift(rgb,m,358,218,minsat=.42,width=16)
    G=board_unit(SRC+'vuurwerper-bord.png',{'idle':(8,150,4),'walk':(163,296,6),
        'attack':(308,448,5,420,1265),'hit':(738,871,3),'death':(883,1022,6)},420,1440,fx={'death':{4,5}})
    manifest['firethrower']=build(OUT,'firethrower',G,110,'idle',{'-red':ident,'-blue':toblue})
    G=board_unit(SRC+'samoerai-bord.png',{'idle':(50,172,4),'walk':(200,308,6),'cloak':(340,452,6),
        'attack':(486,588,6),'reveal':(618,725,4),'hit':(755,860,3),'death':(890,1010,6)},570,1432,
        fx={'cloak':{4,5},'reveal':{0},'death':{4,5}})
    manifest['samurai']=build(OUT,'samurai',G,112,'idle',{'-red':ident,'-blue':toblue})
    G=board_unit(SRC+'spion-bord.png',{'idle':(5,158,4,410,1110),'walk':(168,302,6),'attack':(312,440,6),
        'charm':(447,580,8),'hit':(700,826,3,410,930),'death':(835,990,6)},410,1528,fx={'death':{4,5}},
        bg_blobs=False)   # zwart pak = kleur van het bord
    manifest['spy']=build(OUT,'spy',G,110,'idle',{'':ident})
    G=board_unit(SRC+'genezeres-bord.png',{'idle':(5,155,4,400,1160),'walk':(165,312,6),'heal':(320,485,6),
        'attack':(490,640,6),'hit':(648,790,3,400,880),'death':(798,970,7)},400,1532,fx={'death':{5,6}})
    manifest['healer']=build(OUT,'healer',G,110,'idle',{'':ident})
    json.dump(manifest,open(MANIFEST,'w'),indent=1)
    return manifest
