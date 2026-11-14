import numpy as np, sys, json
from PIL import Image
from scipy import ndimage as ndi

def load(p): return np.array(Image.open(p).convert('RGB')).astype(np.int16)

HOLE_MIN = 30   # bronpixels

def fg_mask(a, bg='white', tol=28):
    """Voorgrond = alles wat niet via de rand verbonden is met achtergrondkleur."""
    if bg=='white':
        mx=a.max(2); mn=a.min(2)
        bgish=(mn>255-tol)&(mx-mn<18)
    else:
        border=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]])
        ref=np.median(border,0)
        d=np.abs(a-ref).max(2); sat=a.max(2)-a.min(2)
        bgish=((d<tol)|((a.max(2)<75)&(sat<30)))
    lab,n=ndi.label(bgish)
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bgm=np.isin(lab,list(edge))
    if bg=='white':
        # Ingesloten witte vlakken (binnen een boog, tussen benen) zijn ook achtergrond.
        # Kleine stukjes (oogwit, glimlicht) blijven staan.
        holes=(mn>=234)&(mx-mn<16)&~bgm
        hl,hn=ndi.label(holes)
        if hn:
            sizes=ndi.sum(holes,hl,range(1,hn+1))
            bgm|=np.isin(hl,[i+1 for i,s in enumerate(sizes) if s>=HOLE_MIN])
    fg=~bgm
    fg=ndi.binary_opening(fg,iterations=1)
    lab,n=ndi.label(fg)
    if n:
        sizes=ndi.sum(fg,lab,range(1,n+1))
        fg=np.isin(lab,[i+1 for i,s in enumerate(sizes) if s>=60])
    return fg

def bands(profile, minval, mingap):
    on=profile>minval; runs=[]; i=0;n=len(on)
    while i<n:
        if on[i]:
            j=i
            while j<n and on[j]: j+=1
            runs.append([i,j]); i=j
        else: i+=1
    merged=[]
    for r in runs:
        if merged and r[0]-merged[-1][1]<mingap: merged[-1][1]=r[1]
        else: merged.append(r)
    return merged

def frames_in_row(fg, y0, y1, x0=0, x1=None, mingap=8, minwidth=30):
    sub=fg[y0:y1, x0:x1]
    cols=bands(sub.sum(0),0,mingap)
    # kleine losse stukjes (pijl, vonk) bij dichtstbijzijnde frame voegen
    big=[c for c in cols if c[1]-c[0]>=minwidth]
    for c in cols:
        if c in big: continue
        k=min(range(len(big)),key=lambda i:min(abs(c[0]-big[i][1]),abs(c[1]-big[i][0])))
        big[k]=[min(big[k][0],c[0]),max(big[k][1],c[1])]
    out=[]
    for c in big:
        m=sub[:,c[0]:c[1]]
        ys=np.where(m.any(1))[0]
        out.append((x0+c[0],y0+ys[0],x0+c[1],y0+ys[-1]+1))
    return out

def rgba(a, fg, box, soft_white=True):
    x0,y0,x1,y1=box
    rgb=a[y0:y1,x0:x1].astype(np.float32); m=fg[y0:y1,x0:x1]
    alpha=m.astype(np.float32)
    # randpixels zacht maken
    edge=m & ~ndi.binary_erosion(m,iterations=1)
    alpha[edge]=0.6
    return np.dstack([rgb,alpha*255]).clip(0,255).astype(np.uint8)

def split_box(a, fg, box, k, light=200):
    """Splits een samengevoegd vak in k frames op de minima van 'vaste' (niet-lichte) pixels."""
    x0,y0,x1,y1=box
    sub=a[y0:y1,x0:x1]; m=fg[y0:y1,x0:x1]
    solid=m & (sub.min(2)<light)
    prof=ndi.uniform_filter1d(solid.sum(0).astype(float),9)
    w=x1-x0; cuts=[]
    for i in range(1,k):
        c=int(w*i/k); lo=max(0,c-w//(2*k)); hi=min(w,c+w//(2*k))
        cuts.append(lo+int(np.argmin(prof[lo:hi])))
    edges=[0]+cuts+[w]; out=[]
    for i in range(k):
        mm=m[:,edges[i]:edges[i+1]]; ys=np.where(mm.any(1))[0]; xs=np.where(mm.any(0))[0]
        out.append((x0+edges[i]+xs[0],y0+ys[0],x0+edges[i]+xs[-1]+1,y0+ys[-1]+1))
    return out

def split_at(fg, box, xs):
    """Splits een vak op vaste x-posities (bronpixels)."""
    x0,y0,x1,y1=box; edges=[x0]+list(xs)+[x1]; out=[]
    for i in range(len(edges)-1):
        mm=fg[y0:y1,edges[i]:edges[i+1]]; ys=np.where(mm.any(1))[0]; xx=np.where(mm.any(0))[0]
        out.append((edges[i]+xx[0],y0+ys[0],edges[i]+xx[-1]+1,y0+ys[-1]+1))
    return out


def matte(rgb, m, band=2):
    """Zachte rand: alpha uit 'hoe wit' een randpixel is, en kleur ontmengen van wit."""
    rgb=rgb.astype(np.float32); alpha=m.astype(np.float32)
    inner=ndi.binary_erosion(m,iterations=band)
    edge=m&~inner
    a=np.clip((255-rgb.min(2))/70.0,0.0,1.0)
    alpha[edge]=np.maximum(a[edge],0.0)
    # transparante gaten tussen randpixels niet laten 'uitlopen'
    al=alpha[...,None]
    un=np.where(al>0.05,(rgb-255*(1-al))/np.maximum(al,0.05),rgb)
    out=np.where(edge[...,None],un,rgb)
    return out.clip(0,255).astype(np.uint8),(alpha*255).astype(np.uint8)
