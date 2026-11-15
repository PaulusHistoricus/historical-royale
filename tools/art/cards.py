import json
import numpy as np
from PIL import Image
from extract import load, fg_mask, bands, frames_in_row

CARD_H = 196   # textuurpixels (2x): kaart 98 px hoog in de wereld
# Volgorde in kaarten.png = volgorde van CARDS in src/sim/config.js
ORDER = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket']
ORDER_ALL = []
EXTRA = [
    ('kaart-genezeres.png', 'healer', None),
    ('kaart-vlammenwerper-samoerai.png', 'samurai', (627, 0, 1254, 1254)),
    ('kaart-spion.png', 'spy', None),
    ('kaart-vuurwerper.png', 'firethrower', None),
    ('kaart-p51.png', 'p51', None),
]

def build_cards(SRC, OUT, MANIFEST):
    a = load(SRC + 'kaarten.png'); fg = fg_mask(a, 'dark', tol=30)
    boxes = []
    for r in [r for r in bands(fg.sum(1), 5, 4) if r[1] - r[0] > 100]:
        boxes += frames_in_row(fg, r[0], r[1], 0, mingap=4, minwidth=200)
    assert len(boxes) == len(ORDER), boxes
    ORDER_ALL[:] = list(ORDER)
    cells = []
    for (x0, y0, x1, y1) in boxes:
        sub = a[y0:y1, x0:x1]; m = fg[y0:y1, x0:x1]
        # ingebakken energiejuweel opzoeken (paars), zodat het spel er het echte juweel overheen tekent
        r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
        gem = (b > 140) & (r > 100) & (g < 110) & (b > g + 60)
        gem[int(sub.shape[0] * .35):] = False; gem[:, int(sub.shape[1] * .45):] = False
        ys, xs = np.where(gem)
        sc = CARD_H / (y1 - y0)
        im = Image.fromarray(np.dstack([sub.astype(np.uint8), (m * 255).astype(np.uint8)]), 'RGBA')
        im = im.resize((round((x1 - x0) * sc), CARD_H), Image.LANCZOS)
        cells.append((im, {'gemX': float(xs.mean() * sc), 'gemY': float(ys.mean() * sc),
                           'gemR': float(max(np.ptp(xs), np.ptp(ys)) / 2 * sc), 'width': im.width}))
    # Losse kaarten (eigen bestanden, gouden lijst, zwarte of doorzichtige hoeken).
    # (bestand, type, uitsnede in bronpixels of None)
    for fname, ctype, crop in EXTRA:
        A = np.array(Image.open(SRC + fname).convert('RGBA')).astype(np.int16)
        if crop: A = A[crop[1]:crop[3], crop[0]:crop[2]]
        rgb = A[..., :3]
        m = fg_mask(rgb, 'dark', tol=12) & (A[..., 3] > 40)
        ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sub = rgb[y0:y1, x0:x1]; mm = m[y0:y1, x0:x1]
        sc = CARD_H / (y1 - y0)
        im = Image.fromarray(np.dstack([sub.astype(np.uint8), (mm * 255).astype(np.uint8)]), 'RGBA')
        im = im.resize((round((x1 - x0) * sc), CARD_H), Image.LANCZOS)
        # geen ingebakken juweel: het spel tekent het linksboven in de lijst
        cells.append((im, {'gemX': im.width * 0.16, 'gemY': CARD_H * 0.14, 'gemR': CARD_H * 0.105, 'width': im.width}))
        ORDER_ALL.append(ctype)
    cw = max(c[0].width for c in cells) + 2
    sheet = Image.new('RGBA', (cw * len(cells), CARD_H))
    info = {'frameWidth': cw, 'frameHeight': CARD_H, 'cards': {}}
    for i, (im, meta) in enumerate(cells):
        ox = i * cw + (cw - im.width) // 2
        sheet.alpha_composite(im, (ox, 0))
        meta['gemX'] += (cw - im.width) // 2
        info['cards'][ORDER_ALL[i]] = {'frame': i, **{k: round(v, 1) for k, v in meta.items()}}
    sheet.save(f'{OUT}/cards.png', optimize=True)
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info
