"""Hulp voor de nieuwe sprite-bladen (unit expansion 2): meerdere animaties per rij,
frames die door effecten aan elkaar plakken. Zie units.py voor de indeling per eenheid."""
import numpy as np
from scipy import ndimage as ndi
from extract import bands, frames_in_row, split_components
from units import load_rgba


def autosplit_x(fg, box, k):
    """x-posities om een vak in k frames te knippen: de rustigste kolom bij elke 1/k."""
    x0, y0, x1, y1 = box
    prof = fg[y0:y1, x0:x1].sum(0).astype(float)
    w = x1 - x0; xs = []
    for i in range(1, k):
        c = int(w * i / k); r = int(w / k * 0.3)
        lo, hi = max(1, c - r), min(w - 1, c + r)
        xs.append(x0 + lo + int(np.argmin(prof[lo:hi])))
    return xs


def sheet_frames(path, rows=None, splits={}, minh=40, cutoff=30):
    """Alle frames per rij: lijst rijen -> lijst (rgb, mask, alpha). splits: {(rij, frame): k}."""
    rgb, fg, al = load_rgba(path, cutoff)
    if rows is None:
        rows = [r for r in bands(fg.sum(1), 2, 2) if r[1] - r[0] > minh]
    out = []
    for ri, (y0, y1) in enumerate(rows):
        frames = []
        for fi, b in enumerate(frames_in_row(fg, y0, y1, 0)):
            if (ri, fi) in splits:
                parts = split_components(fg, b, autosplit_x(fg, b, splits[(ri, fi)]))
            else:
                parts = [(b, fg[b[1]:b[3], b[0]:b[2]])]
            for (x0, yy0, x1, yy1), m in parts:
                frames.append((rgb[yy0:yy1, x0:x1].astype(np.uint8), m, (al[yy0:yy1, x0:x1] * m).astype(np.uint8)))
        out.append(frames)
    return out


def pick(F, spec):
    """spec: {anim: [(rij, frame), ...]} -> {anim: [frames]}"""
    return {a: [F[r][i] for r, i in lst] for a, lst in spec.items()}


def contact(F, path):
    """Overzichtsplaatje met rij/frame-nummers (alleen om de indeling te bepalen)."""
    from PIL import Image, ImageDraw
    cw = max(f[0].shape[1] for row in F for f in row) + 6; ch = max(f[0].shape[0] for row in F for f in row) + 18
    cols = max(len(r) for r in F)
    im = Image.new('RGB', (cw * cols, ch * len(F)), (60, 120, 60)); d = ImageDraw.Draw(im)
    for ri, row in enumerate(F):
        for fi, (rgb, m, al) in enumerate(row):
            fr = Image.fromarray(np.dstack([rgb, al]), 'RGBA')
            im.paste(fr, (fi * cw + 3, ri * ch + 16), fr)
            d.text((fi * cw + 4, ri * ch + 2), f'{ri},{fi}', fill=(255, 255, 0))
    im.save(path)
