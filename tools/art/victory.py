"""Onderdelen van het overwinnings-/verliesscherm (losse PNG's met doorzichtige achtergrond,
gemaakt door ChatGPT): art/source/overwinning-*.png -> public/assets/art/result-*.webp.

Alleen bijsnijden tot de inhoud en verkleinen; de tekst zet het spel er zelf op
(src/screens.js / screens.css). De posities van vlakken binnen de plaatjes (portretgat,
naamplaat, knoptekst) staan als percentages in src/screens.css.
"""
import numpy as np
from PIL import Image

PARTS = {   # bron -> (uitvoer, breedte)
    'overwinning-paneel.png': ('result-panel', 1200),
    'overwinning-banner.png': ('result-banner', 1000),
    'overwinning-lint.png': ('result-ribbon', 700),
    'overwinning-munten.png': ('result-coins', 800),
    'overwinning-kaart.png': ('result-card', 300),
    'overwinning-knop-breed.png': ('result-button', 600),
    'overwinning-knop-smal.png': ('result-button-small', 400),
}


def _part(path, width):
    a = np.array(Image.open(path).convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])          # waas rond de rand weg
    whitish = (a[..., 3] < 170) & (a[..., :3].min(2) > 190)       # lichte gloed/schaduwrest van de oude witte achtergrond
    a[..., 3] = np.where(whitish, 0, a[..., 3])
    ys, xs = np.where(a[..., 3] > 0)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pm = a.astype(float); pm[..., :3] *= pm[..., 3:] / 255        # premultiplied verkleinen: geen lichte randen
    h = round(a.shape[0] * width / a.shape[1])
    r = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((width, h), Image.LANCZOS)).astype(float)
    al = r[..., 3:]; r[..., :3] = np.where(al > 0, r[..., :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(r.clip(0, 255).astype(np.uint8), 'RGBA')


def build_victory(SRC, OUT):
    info = {}
    for src, (name, width) in PARTS.items():
        im = _part(SRC + src, width)
        im.save(f'{OUT}/{name}.webp', quality=88, method=6)
        info[name] = im.size
    return info


if __name__ == '__main__':
    import os
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    print(build_victory(root + '/art/source/', root + '/public/assets/art'))
