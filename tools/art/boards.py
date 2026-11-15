"""Animatieborden op donkere achtergrond (art/source/*-bord.png).

Per rij (paneel) worden de frames gevonden op kolommen met inhoud. Elk frame gaat
door rembg (AI-achtergrondverwijdering), want donker haar en zwarte kleding zijn
op een donkere achtergrond niet met een drempel te scheiden. Gloed en effecten
(vuur, paarse rook, magie) worden er daarna bij gemengd met een 'zwart = doorzichtig'
sleutel, zodat ze niet wegvallen.

Vereist: pip install "rembg[cpu]" (downloadt eenmalig een model van ±170 MB).
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from extract import bands

_session = None
def _rembg(img):
    global _session
    from rembg import new_session, remove
    if _session is None:
        _session = new_session('u2net')
    return np.array(remove(img, session=_session))[..., 3]

def panel_frames(a, y0, y1, x0, x1, count, thresh=58, mingap=8):
    """Frames in een paneel op basis van heldere/gekleurde kolommen; splitst samengevoegde stukken."""
    sub = a[y0:y1, x0:x1].astype(int)
    lum = sub.max(2); sat = sub.max(2) - sub.min(2)
    ink = (lum > thresh) | (sat > 45)
    ink = ndi.binary_opening(ink, iterations=1)
    prof = ndi.uniform_filter1d(ink.sum(0).astype(float), 5)
    runs = [r for r in bands(prof, 1.5, mingap) if r[1] - r[0] > 25]
    # te veel stukken: kleinste aan buren plakken; te weinig: breedste splitsen op het minimum
    while len(runs) > count:
        i = min(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
        j = i - 1 if i > 0 and (i == len(runs) - 1 or runs[i][0] - runs[i-1][1] < runs[i+1][0] - runs[i][1]) else i + 1
        runs[min(i, j)] = [min(runs[i][0], runs[j][0]), max(runs[i][1], runs[j][1])]; del runs[max(i, j)]
    while len(runs) < count:
        i = max(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
        r0, r1 = runs[i]; w = r1 - r0
        lo, hi = r0 + w // 4, r1 - w // 4
        c = lo + int(np.argmin(prof[lo:hi]))
        runs[i:i+1] = [[r0, c], [c, r1]]
    return [(x0 + r0, y0, x0 + r1, y1) for r0, r1 in runs]

def cut_frame(a, box, pad=10, glow=True, fx_only=False):
    """Geeft (rgb, mask, alpha) voor één frame."""
    x0, y0, x1, y1 = box
    X0, Y0 = max(0, x0 - pad), max(0, y0)
    X1, Y1 = min(a.shape[1], x1 + pad), min(a.shape[0], y1)
    rgb = a[Y0:Y1, X0:X1].astype(np.uint8)
    al = np.zeros(rgb.shape[:2], np.float32) if fx_only else _rembg(Image.fromarray(rgb)).astype(np.float32)
    if glow:
        # emissieve effecten: helderheid boven de achtergrond = dekking (zwart-sleutel)
        f = rgb.astype(np.float32)
        lum = f.max(2); sat = f.max(2) - f.min(2)
        g = np.clip((lum - 70) / 140, 0, 1) * np.clip(sat / 90, 0, 1) * 255   # alleen heldere, gekleurde gloed
        al = np.maximum(al, g)
    al[al < 24] = 0
    m = al > 0
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        objs = ndi.find_objects(lab)
        # weg: kleine snippers en dunne paneelranden (lange, platte lijnen)
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40 and
                          not (objs[i][0].stop - objs[i][0].start <= 7 and objs[i][1].stop - objs[i][1].start > 30)])
    al = al * m
    # kleur ontmengen van de (zwarte) achtergrond waar alpha < 1
    A = (al / 255)[..., None]
    col = np.where(A > 0.05, np.clip(rgb.astype(np.float32) / np.maximum(A, 0.05), 0, 255), rgb)
    col = np.where(A >= 0.95, rgb, col).astype(np.uint8)
    ys, xs = np.where(m)
    if not len(ys):
        return col[:2, :2], m[:2, :2], al[:2, :2].astype(np.uint8)
    b = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    sl = (slice(b[1], b[3]), slice(b[0], b[2]))
    return col[sl], m[sl], al[sl].astype(np.uint8)

def board_unit(path, panels, x0, x1, glow=True, fx=None):
    """panels: {anim: (y0, y1, aantal) of (y0, y1, aantal, x0, x1)} -> groepen voor build().
    fx: {anim: {frame-indexen}} voor frames met alleen rook/vonken (geen figuur)."""
    a = np.array(Image.open(path).convert('RGB'))
    G = {}
    fx = fx or {}
    for anim, spec in panels.items():
        y0, y1, count = spec[:3]
        px0, px1 = (spec[3], spec[4]) if len(spec) > 3 else (x0, x1)
        G[anim] = [cut_frame(a, b, glow=glow, fx_only=i in fx.get(anim, ()))
                   for i, b in enumerate(panel_frames(a, y0, y1, px0, px1, count))]
    return G


def board_effect(path, y0, y1, x0, x1, count):
    """Effect zonder figuur (vuur): zwarte achtergrond blijft; het spel tekent dit additief (ADD)."""
    a = np.array(Image.open(path).convert('RGB'))
    out = []
    for (bx0, by0, bx1, by1) in panel_frames(a, y0, y1, x0, x1, count):
        rgb = a[by0:by1, bx0:bx1].astype(np.uint8)
        lum = rgb.max(2).astype(np.float32)
        m = lum > 30
        al = np.where(m, 255, 0).astype(np.uint8)
        # zwakke achtergrondruis naar puur zwart, zodat ADD geen grijze waas geeft
        rgb = (np.clip(rgb.astype(np.float32) - 22, 0, 255) * 255 / 233).astype(np.uint8)
        out.append((rgb, np.ones_like(m), np.full_like(al, 255)))
    return out
