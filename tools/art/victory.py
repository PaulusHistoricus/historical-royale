"""Onderdelen voor het overwinnings-/verliesscherm, uitgesneden uit het voorbeeld
art/source/overwinning-voorbeeld.png (één plaatje van ChatGPT).

Tekst die per gevecht verschilt (titel, munten, knoppen, kaartnamen) wordt
weggepoetst (inpainting); het spel zet er zelf tekst overheen (src/screens.css).
"""
import cv2
import numpy as np
from PIL import Image

PARTS = {   # naam -> (uitsnede, gebieden om leeg te maken, modus)
    'result-banner-victory': ((290, 170, 1160, 345), [], None),
    'result-banner-blank': ((290, 170, 1160, 345), [(420, 195, 1050, 322)], 'letters'),
    'result-ribbon': ((470, 345, 975, 405), [], None),
    'result-coins': ((440, 715, 1090, 845), [(700, 728, 960, 832)], 'rect'),
    'result-button': ((400, 850, 1050, 985), [(500, 880, 960, 955)], 'rect'),
}
CARD = (200, 410, 460, 700)           # kaartlijst met naamplaat en sterren
CARD_HOLE = (9, 9, 251, 203)          # portret (binnen de uitsnede) -> doorzichtig
CARD_CLEAN = [(62, 210, 200, 237), (88, 243, 176, 272)]   # naam en sterren


def _clean(c, rects, mode, origin):
    ox, oy = origin
    m = np.zeros(c.shape[:2], np.uint8)
    for x0, y0, x1, y1 in rects:
        x0, y0, x1, y1 = x0 - ox, y0 - oy, x1 - ox, y1 - oy
        if mode == 'letters':   # goud en donkere schaduw van de letters
            hsv = cv2.cvtColor(c[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)
            gold = (hsv[..., 0] >= 12) & (hsv[..., 0] <= 35) & (hsv[..., 2] > 110)
            m[y0:y1, x0:x1] = ((gold | (hsv[..., 2] < 55)) * 255).astype(np.uint8)
        else:
            m[y0:y1, x0:x1] = 255
    if mode == 'letters':
        m = cv2.dilate(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), np.ones((7, 7), np.uint8))
        out = cv2.inpaint(c, m, 7, cv2.INPAINT_TELEA)
        blur = cv2.GaussianBlur(out, (0, 0), 9)    # restschim van de oude letters wegwassen
        soft = cv2.GaussianBlur(m, (0, 0), 6)[..., None] / 255.0
        return (out * (1 - soft) + blur * soft).astype(np.uint8)
    out = cv2.inpaint(c, m, 15, cv2.INPAINT_NS)
    noise = np.random.default_rng(1).normal(0, 4, out.shape[:2])[..., None]
    return np.where(m[..., None] > 0, np.clip(out + noise, 0, 255), out).astype(np.uint8)


def _save(bgr, path, alpha=None):
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb if alpha is None else np.dstack([rgb, alpha]))
    im.save(path, quality=88, method=6)


def build_victory(SRC, OUT):
    src = cv2.imread(SRC + 'overwinning-voorbeeld.png')
    info = {}
    for name, (box, rects, mode) in PARTS.items():
        x0, y0, x1, y1 = box
        c = src[y0:y1, x0:x1].copy()
        if rects: c = _clean(c, rects, mode, (x0, y0))
        _save(c, f'{OUT}/{name}.webp')
        info[name] = {'width': x1 - x0, 'height': y1 - y0}
    x0, y0, x1, y1 = CARD
    c = _clean(src[y0:y1, x0:x1].copy(), [(a + x0, b + y0, cc + x0, d + y0) for a, b, cc, d in CARD_CLEAN], 'rect', (x0, y0))
    alpha = np.full(c.shape[:2], 255, np.uint8)
    hx0, hy0, hx1, hy1 = CARD_HOLE
    alpha[hy0:hy1, hx0:hx1] = 0
    alpha[hy1:hy1 + 7, 48:212] = 0        # strookje portret boven de naamplaat, tussen de lauweren
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
    big = cv2.resize(c, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_LANCZOS4)
    _save(big, f'{OUT}/result-card.webp', cv2.resize(alpha, (big.shape[1], big.shape[0]), interpolation=cv2.INTER_LINEAR))
    info['result-card'] = {'width': big.shape[1], 'height': big.shape[0], 'hole': CARD_HOLE, 'scale': 1.5}
    return info


if __name__ == '__main__':
    import os
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    print(build_victory(root + '/art/source/', root + '/public/assets/art'))
