"""Portretten van de eindbazen (missiepaneel): art/source/bosses/boss-*.png -> public/assets/art/boss-*.webp.

    python3 tools/art/bosses.py        (of via build.py)

De bronnen zijn staande portretten (2:3) met echte transparantie. Waas onder alfa 24 gaat weg, de
rest blijft (gifwolken en gloed horen erbij). Spritesheets van de bazen (boss-*-sheet.png) staan
ernaast in art/source/bosses/; die worden pas gebruikt zodra de bazen in het gevecht meedoen.
"""
import os
import numpy as np
from PIL import Image

HEIGHT = 640
SRC_DIR = 'bosses/'


def _portrait(path):
    a = np.array(Image.open(path).convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])
    ys, xs = np.where(a[..., 3] > 0)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pm = a.astype(float); pm[..., :3] *= pm[..., 3:] / 255        # premultiplied verkleinen: geen lichte randen
    width = round(a.shape[1] * HEIGHT / a.shape[0])
    r = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((width, HEIGHT), Image.LANCZOS)).astype(float)
    al = r[..., 3:]; r[..., :3] = np.where(al > 0, r[..., :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(r.clip(0, 255).astype(np.uint8), 'RGBA')


def build_bosses(SRC, OUT):
    info = {}
    for f in sorted(os.listdir(SRC + SRC_DIR)):
        if not f.startswith('boss-') or f.endswith('-sheet.png') or not f.endswith('.png'): continue
        im = _portrait(SRC + SRC_DIR + f)
        im.save(f'{OUT}/{f[:-4]}.webp', quality=86, method=6)
        info[f[5:-4]] = im.size
    return info


if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    print(build_bosses(root + '/art/source/', root + '/public/assets/art'))
