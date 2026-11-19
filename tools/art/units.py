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

def build(OUT, name, groups, target_h, ref_group, variants, alt=None, ref_frame=0):
    """groups: dict anim -> list of (rgb, mask[, alpha]).
    alt: {suffix: groups} voor teamvarianten met eigen frames (zelfde animaties en aantallen);
    alle varianten delen dan één celmaat, zodat één manifest voor beide texturen geldt."""
    ref_m=groups[ref_group][ref_frame][1]
    scale=target_h/ref_m.shape[0]
    def collect(gr):
        out=[]
        for anim,frames in gr.items():
            for fr in frames:
                rgb,m=fr[0],fr[1]
                ax,h=anchor_of(m)
                out.append((anim,rgb,m,ax,fr[2] if len(fr)>2 else None))
        return out
    sets={v:collect(groups) for v in variants}
    for v,gr in (alt or {}).items(): sets[v]=collect(gr)
    allit=[it for its in sets.values() for it in its]
    left=max(it[3] for it in allit); right=max(it[2].shape[1]-it[3] for it in allit)
    height=max(it[2].shape[0] for it in allit)
    cw=int(np.ceil((left+right)*scale))+4; ch=int(np.ceil(height*scale))+4
    ax_cell=int(round(left*scale))+2
    first=next(iter(sets.values()))
    cols=min(len(first),10); rows=-(-len(first)//cols)  # max 10 kolommen: textuur blijft < 2048 px breed
    anims={}
    for v,items in sets.items():
        assert len(items)==len(first), (name, v)
        fn=variants.get(v, lambda rgb,m: rgb)
        sheet=Image.new('RGBA',(cw*cols,ch*rows),(0,0,0,0))
        for n,(anim,rgb,m,ax,src_alpha) in enumerate(items):
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
            sheet.alpha_composite(small,(ox,oy))
            if items is first: anims.setdefault(anim,[]).append(n)
        sheet.save(f'{OUT}/{name}{v}.png',optimize=True)
    return {'frameWidth':cw,'frameHeight':ch,'originX':round(ax_cell/cw,4),'originY':round((ch-2)/ch,4),'anims':anims,
            'textures':[f'{name}{v}' for v in sets]}

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
    # ---- Unit expansion 2: bladen met meerdere animaties per rij (zie sheetsplit.py) ----
    from sheetsplit import sheet_frames, pick
    blue2red = lambda rgb,m: hue_shift(rgb,m,222,358,minsat=.30,width=28)
    F=sheet_frames(SRC+'spartaan-blauw.png')
    G=pick(F,{'idle':[(0,0),(0,1),(0,2),(0,1)],'walk':[(0,3),(0,4),(0,5),(0,6),(0,7),(0,8)],
              'attack':[(1,1),(1,2),(1,3),(1,4)],'shield_wall':[(1,5),(1,6),(1,7)],
              'hit':[(2,0),(2,1)],'death':[(2,2),(2,3),(2,4),(2,5),(2,6)]})
    manifest['spartan']=build(OUT,'spartan',G,118,'idle',{'-blue':ident,'-red':blue2red})
    F=sheet_frames(SRC+'pestdokter.png')
    G=pick(F,{'idle':[(0,0),(0,1),(0,2),(0,1)],'walk':[(0,3),(0,4),(0,5),(0,6),(0,7),(0,8)],
              'attack':[(1,1),(1,2),(1,3),(1,4),(1,6)],'hit':[(2,0),(2,1)],
              'death':[(2,2),(2,3),(2,4),(2,5),(2,6),(2,7)]})
    manifest['plague']=build(OUT,'plague',G,112,'idle',{'':ident})
    F=sheet_frames(SRC+'vaandeldraagster.png',rows=[(3,217),(225,389)],splits={(1,4):2})
    G=pick(F,{'idle':[(0,0),(1,0),(0,10),(0,9)],'walk':[(0,1),(0,2),(0,3),(1,1),(1,2),(1,3)],
              'attack':[(0,4),(0,5),(0,6),(0,7)],'rally':[(1,7),(0,8),(1,8)],
              'hit':[(1,9)],'death':[(1,9),(1,10),(1,11)]})
    manifest['banner']=build(OUT,'banner',G,150,'idle',{'-blue':ident,'-red':blue2red})
    F=sheet_frames(SRC+'stepperuiter.png',splits={(0,3):3,(0,4):3,(1,3):4,(1,4):3,(2,3):3,(2,4):3,(3,3):4,(3,4):3})
    spec=lambda a,b:{'idle':[(a,0),(a,1),(a,2),(a,1)],'walk':[(a,5),(a,8),(b,10),(b,11)],
              'charge':[(a,3),(a,9),(a,10)],'attack':[(a,4),(a,6),(a,7)],'hit':[(a,2)],'death':[(b,11),(b,12)]}
    Gb=pick(F,spec(0,1)); Gr=pick(F,spec(2,3))
    manifest['lancer']=build(OUT,'lancer',Gb,140,'idle',{'-blue':ident},alt={'-red':Gr})
    F=sheet_frames(SRC+'sluipmoordenares.png')
    G=pick(F,{'idle':[(3,0),(3,1),(3,2),(3,1)],'walk':[(0,4),(0,5),(0,6),(0,7),(0,8),(0,9)],
              'attack':[(1,2),(1,3),(1,7),(1,8),(1,9)],'backstab':[(3,3),(3,4),(1,4),(1,5),(1,6),(1,8)],
              'hit':[(2,0),(2,1)],'death':[(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,8)]})
    manifest['assassin']=build(OUT,'assassin',G,108,'idle',{'':ident})
    # Vlammenwerper GI: zwarte achtergrond -> rembg (boards.py); blauw = rijen 1-3, rood = rijen 4-6.
    def gi(rows):
        R=board_unit(SRC+'vlammenwerper-gi.png',{'r0':(rows[0][0],rows[0][1],12),'r1':(rows[1][0],rows[1][1],10),
            'r2':(rows[2][0],rows[2][1],8)},0,2170)
        return {'idle':R['r0'][0:3]+[R['r0'][1]],'walk':R['r0'][3:12],'attack':R['r1'][0:3],
                'flame':R['r1'][3:7],'hit':R['r2'][0:2],'death':R['r2'][2:8]}
    manifest['flamegi']=build(OUT,'flamegi',gi([(7,123),(123,231),(235,345)]),108,'idle',{'-blue':ident},
        alt={'-red':gi([(366,483),(483,592),(592,707)])})
    # ---- Unit expansion 3 (moderne oorlog); witte bladen via white_sheet_frames ----
    from sheetsplit import white_sheet_frames
    red2blue = lambda rgb,m: hue_shift(rgb,m,358,218,minsat=.42,width=16)
    F=white_sheet_frames(SRC+'tank.png')
    G=pick(F,{'idle':[(0,0),(0,1),(0,2)],'walk':[(1,i) for i in range(6)],'attack':[(2,i) for i in range(4)],
              'hit':[(3,0),(3,1)],'death':[(4,i) for i in range(6)]})
    manifest['tank']=build(OUT,'tank',G,104,'idle',{'-red':ident,'-blue':red2blue})
    F=white_sheet_frames(SRC+'sluipschutter.png')
    G=pick(F,{'idle':[(0,0),(0,1),(0,2),(0,1)],'walk':[(1,i) for i in range(6)],'attack':[(2,1),(2,2),(2,3),(2,4),(2,5)],
              'hit':[(3,1)],'death':[(4,0),(4,1),(4,2),(4,4)]})
    manifest['sniper']=build(OUT,'sniper',G,116,'idle',{'':ident})
    F=white_sheet_frames(SRC+'bazooka.png',splits={(2,0):3,(5,1):2})
    gb=pick(F,{'idle':[(0,0),(0,1),(0,2),(0,3)],'walk':[(1,i) for i in range(6)],'attack':[(1,7),(2,0),(2,1),(2,2),(2,3),(2,4),(2,5)],
              'hit':[(2,6),(2,7)],'death':[(2,i) for i in range(10,15)]})
    gr=pick(F,{'idle':[(3,0),(3,1),(3,2),(3,3)],'walk':[(4,i) for i in range(6)],'attack':[(4,7),(5,0),(5,1),(5,2),(5,3),(5,4),(5,5)],
              'hit':[(5,6),(5,7)],'death':[(5,i) for i in range(10,15)]})
    manifest['bazooka']=build(OUT,'bazooka',gb,112,'idle',{'-blue':ident},alt={'-red':gr})
    F=white_sheet_frames(SRC+'hospik.png')
    spec=lambda a:{'idle':[(a,0),(a,1),(a,2),(a,3)],'walk':[(a+1,i) for i in range(6)],'attack':[(a+1,6),(a+1,7)],
              'hit':[(a+2,0),(a+2,1)],'death':[(a+2,i) for i in range(2,9)]}
    manifest['medic']=build(OUT,'medic',pick(F,spec(0)),112,'idle',{'-blue':ident},alt={'-red':pick(F,spec(3))})
    # Veldhospitaal: vlaggen wisselen per rij van kleur -> alleen het bovenste kwart (de vlag) omkleuren.
    def flag(src,dst):
        def fn(rgb,m):
            mm=m.copy(); mm[int(m.shape[0]*0.3):]=False
            return hue_shift(rgb,mm,src,dst,minsat=.35,width=30)
        return fn
    F=sheet_frames(SRC+'veldhospitaal.png')
    G=pick(F,{'idle':[(1,0),(1,1),(1,2),(1,3)],'walk':[(1,0)],'attack':[(1,0)],'hit':[(1,0)],
              'appear':[(0,i) for i in range(5)],'death':[(2,i) for i in range(4)]})
    manifest['hospital']=build(OUT,'hospital',G,140,'idle',{'-blue':flag(358,222),'-red':flag(222,358)})
    # Artilleriebeschieting (effect). artillerie-effect-2.png (witte achtergrond) valt af: de witte kern
    # van de explosie is niet van de achtergrond te scheiden.
    F1=sheet_frames(SRC+'artillerie-effect.png')
    spec={'shell':[(0,i) for i in range(4)],'boom':[(1,i) for i in range(8)],'crater':[(2,0)]}
    manifest['barrage']=build(OUT,'barrage',pick(F1,spec),150,'boom',{'':ident},ref_frame=3)
    json.dump(manifest,open(MANIFEST,'w'),indent=1)
    return manifest
