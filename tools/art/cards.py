import json
import numpy as np
from PIL import Image
from extract import load, fg_mask, bands, frames_in_row

CARD_H = 196   # textuurpixels (2x): kaart 98 px hoog in de wereld
# Volgorde in kaarten.png = volgorde van CARDS in src/sim/config.js
ORDER = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket']

def build_cards(SRC, OUT, MANIFEST):
    a = load(SRC + 'kaarten.png'); fg = fg_mask(a, 'dark', tol=30)
    boxes = []
    for r in [r for r in bands(fg.sum(1), 5, 4) if r[1] - r[0] > 100]:
        boxes += frames_in_row(fg, r[0], r[1], 0, mingap=4, minwidth=200)
    assert len(boxes) == len(ORDER), boxes
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
    cw = max(c[0].width for c in cells) + 2
    sheet = Image.new('RGBA', (cw * len(cells), CARD_H))
    info = {'frameWidth': cw, 'frameHeight': CARD_H, 'cards': {}}
    for i, (im, meta) in enumerate(cells):
        ox = i * cw + (cw - im.width) // 2
        sheet.alpha_composite(im, (ox, 0))
        meta['gemX'] += (cw - im.width) // 2
        info['cards'][ORDER[i]] = {'frame': i, **{k: round(v, 1) for k, v in meta.items()}}
    sheet.save(f'{OUT}/cards.png', optimize=True)
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info
