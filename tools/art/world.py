import sys, json, os
sys.path.insert(0,os.path.dirname(__file__))
import numpy as np
from PIL import Image
from extract import load, fg_mask, frames_in_row
from units import hue_shift

TOWER_H=176   # textuurpixels (2x): toren 88 px hoog in de wereld
CASTLE_H=400  # kasteel 200 px hoog

def build_world(SRC, OUT, MANIFEST):
    S=1920/1672          # arena-bron -> textuur (2x wereldresolutie, wereld = 960 breed)

    # 1. Achtergrond zonder geschilderde torens/kastelen
    a=np.array(Image.open(SRC+'torens-kastelen.png').convert('RGB').crop((0,364,1672,941))).astype(float); out=a.copy()
    def clone(dst,sx,fe=28):
        x0,y0,x1,y1=dst; w=x1-x0; p=a[y0:y1,sx:sx+w]; al=np.ones((y1-y0,w))
        for i in range(fe):
            f=(i+1)/(fe+1)
            if x0>0: al[:,i]=np.minimum(al[:,i],f)
            if x1<a.shape[1]: al[:,w-1-i]=np.minimum(al[:,w-1-i],f)
            al[i,:]=np.minimum(al[i,:],f); al[-1-i,:]=np.minimum(al[-1-i,:],f)
        out[y0:y1,x0:x1]=out[y0:y1,x0:x1]*(1-al[...,None])+p*al[...,None]
    clone((340,60,476,262),480); clone((340,250,476,455),480)
    clone((1216,60,1352,262),900); clone((1216,250,1352,455),900)
    clone((0,0,340,440),470); clone((1340,0,1672,440),650)
    CROP_H=540
    bg=Image.fromarray(out.clip(0,255).astype(np.uint8)).crop((0,0,1672,CROP_H))
    bg=bg.resize((1920,round(CROP_H*S)),Image.LANCZOS); bg.save(f'{OUT}/arena.jpg',quality=88)

    # 2. Schadestadia van toren en kasteel
    d=load(SRC+'torens-kastelen.png')[:300]; fg=fg_mask(d,'dark',tol=26); fg[:78]=False
    def stages(x0,x1):
        fr=frames_in_row(fg,78,300,x0,x1,mingap=6,minwidth=60)
        return fr
    def save_stages(name,boxes,target_h,variants):
        h=max(b[3]-b[1] for b in boxes); w=max(b[2]-b[0] for b in boxes)
        sc=target_h/h; cw=int(w*sc)+4; ch=int(h*sc)+4
        for v,fn in variants.items():
            sheet=Image.new('RGBA',(cw*len(boxes),ch))
            for i,(x0,y0,x1,y1) in enumerate(boxes):
                rgb=fn(d[y0:y1,x0:x1].astype(np.uint8),fg[y0:y1,x0:x1])
                al=(fg[y0:y1,x0:x1]*255).astype(np.uint8)
                im=Image.fromarray(np.dstack([rgb,al]),'RGBA')
                pm=np.array(im).astype(float); pm[...,:3]*=pm[...,3:]/255
                w2,h2=round((x1-x0)*sc),round((y1-y0)*sc)
                r=np.array(Image.fromarray(pm.astype(np.uint8),'RGBA').resize((w2,h2),Image.LANCZOS)).astype(float)
                A=r[...,3:]; r[...,:3]=np.where(A>0,r[...,:3]*255/np.maximum(A,1),0)
                # onderkant gelijk, horizontaal gecentreerd op het midden van de voet
                sheet.alpha_composite(Image.fromarray(r.clip(0,255).astype(np.uint8),'RGBA'),(i*cw+(cw-w2)//2,ch-2-h2))
            sheet.save(f'{OUT}/{name}{v}.png',optimize=True)
        return {'frameWidth':cw,'frameHeight':ch,'stages':len(boxes)}
    ident=lambda rgb,m:rgb
    tb=stages(0,780); cb=stages(780,1672)
    assert len(tb)==5 and len(cb)==5, (tb,cb)
    info={
     'tower':save_stages('tower',tb,TOWER_H,{'-blue':ident,'-red':lambda r,m:hue_shift(r,m,222,358,minsat=.35,width=30)}),
     'castle':save_stages('castle',cb,CASTLE_H,{'-red':ident,'-blue':lambda r,m:hue_shift(r,m,358,222,minsat=.42,width=16)}),
     'arena':{'width':1920,'height':round(CROP_H*S),'sourceScale':S/2},
    }
    json.dump(info,open(MANIFEST,'w'),indent=1)
    return info
