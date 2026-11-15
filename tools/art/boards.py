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


def clean_alpha(rgb, al, bg_blobs=True):
    """u2net-alpha -> strak masker: figuur volledig dekkend, waas en grondschaduw weg."""
    f = rgb.astype(float)
    bg = np.median(np.concatenate([f[:4].reshape(-1, 3), f[:, :4].reshape(-1, 3), f[:, -4:].reshape(-1, 3)]), 0)
    dist = np.abs(f - bg).max(2)                       # verschil met de bordachtergrond
    core = (al > 60) | ((al > 10) & (dist > 20))       # zeker figuur
    core = ndi.binary_closing(core, iterations=1)
    # alleen kleine gaatjes dichten; grote openingen (tussen benen, binnen een boog) blijven open
    holes = ndi.binary_fill_holes(core) & ~core
    hl, hn = ndi.label(holes)
    if hn:
        hs = ndi.sum(holes, hl, range(1, hn + 1))
        core |= np.isin(hl, [i + 1 for i, v in enumerate(hs) if v < 60])
    # grote achtergrondkleurige vlakken die aan de buitenkant van het figuur grenzen (tussen benen e.d.)
    bgl = core & (dist < 15) if bg_blobs else np.zeros_like(core)
    bl, bn = ndi.label(bgl)
    if bn:
        outside = ndi.binary_dilation(~core, iterations=1)
        bs = ndi.sum(bgl, bl, range(1, bn + 1))
        touch = ndi.maximum(outside, bl, range(1, bn + 1))
        core &= ~np.isin(bl, [i + 1 for i in range(bn) if bs[i] > 80 and touch[i]])
    # grondschaduw: onderste strook, alleen pixels die op de achtergrond lijken weg
    h = core.shape[0]; foot = np.zeros_like(core); foot[int(h * 0.9):] = True
    core &= ~(foot & (dist < 28))
    core = ndi.binary_opening(core, iterations=1)
    lab, n = ndi.label(core)
    if n:
        sizes = ndi.sum(core, lab, range(1, n + 1))
        core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(40, sizes.max() * 0.01)])
    # zachte rand van 1-2 px
    soft = ndi.gaussian_filter(core.astype(float), 0.8)
    return np.where(core, np.maximum(soft, 0.75), soft * (soft > 0.35)) * 255


def _thin_line(sl):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    return (h <= 7 and w > 30) or (w <= 7 and h > 30)   # paneelrand, geen figuur

def cut_frame(a, box, pad=10, glow=True, fx_only=False, bg_blobs=True):
    """Geeft (rgb, mask, alpha) voor één frame."""
    x0, y0, x1, y1 = box
    X0, Y0 = max(0, x0 - pad), max(0, y0)
    X1, Y1 = min(a.shape[1], x1 + pad), min(a.shape[0], y1)
    rgb = a[Y0:Y1, X0:X1].astype(np.uint8)
    if fx_only:
        al = np.zeros(rgb.shape[:2], np.float32)
    else:   # AI-masker, daarna strak gemaakt: figuur dekkend, schaduwwaas en grondschaduw weg
        al = clean_alpha(rgb, _rembg(Image.fromarray(rgb)).astype(np.float32), bg_blobs).astype(np.float32)
    if glow:
        # emissieve effecten: helderheid boven de achtergrond = dekking (zwart-sleutel)
        f = rgb.astype(np.float32)
        lum = f.max(2); sat = f.max(2) - f.min(2)
        g = np.clip((lum - 70) / 140, 0, 1) * np.clip(sat / 90, 0, 1) * 255   # alleen heldere, gekleurde gloed
        al = np.maximum(al, g)
    al[al < 24] = 0
    # goudlijnen van paneelranden in de bovenste/onderste 5 rijen en buitenste kolommen weghalen
    edge_gold = (rgb[..., 0] > 120) & (rgb[..., 1] > 80) & (rgb[..., 2] < 90) & (al < 200)
    for sl in (np.s_[:6, :], np.s_[-6:, :], np.s_[:, :6], np.s_[:, -6:]):
        al[sl][edge_gold[sl]] = 0
    # rijen aan boven/onderkant die bijna helemaal vol zijn (paneelrand die aan het figuur vastzit)
    full = (al > 40).mean(1)
    for rows in (range(0, min(10, len(full))), range(max(0, len(full) - 10), len(full))):
        for r in rows:
            if full[r] > 0.45: al[max(0, r - 1):r + 2] = 0
    m = al > 0
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        objs = ndi.find_objects(lab)
        # weg: kleine snippers en dunne paneelranden (lange, platte lijnen)
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40 and
                          not _thin_line(objs[i])])
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

def board_unit(path, panels, x0, x1, glow=True, fx=None, bg_blobs=True):
    """panels: {anim: (y0, y1, aantal) of (y0, y1, aantal, x0, x1)} -> groepen voor build().
    fx: {anim: {frame-indexen}} voor frames met alleen rook/vonken (geen figuur)."""
    a = np.array(Image.open(path).convert('RGB'))
    G = {}
    fx = fx or {}
    for anim, spec in panels.items():
        y0, y1, count = spec[:3]
        px0, px1 = (spec[3], spec[4]) if len(spec) > 3 else (x0, x1)
        G[anim] = [cut_frame(a, b, glow=glow, fx_only=i in fx.get(anim, ()), bg_blobs=bg_blobs)
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
