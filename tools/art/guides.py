"""De gidsen van de rondleiding (src/guide.js): art/source/gids-*.png -> public/assets/art/guide-*.webp.

    python3 tools/art/guides.py        (of via build.py)

De bronnen zijn PNG's met een bijna-dekkend figuur (alfa ~250) en daaromheen een waas met rode en
gele randpixels (alfa 1..200). Alleen het dekkende figuur blijft over, met een zachte rand van 1 px.
`gids-banner-assassin.png` bevat twee figuren naast elkaar.
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HEIGHT = 760
# uitvoer -> (bron, welk figuur van links geteld, aantal figuren in de bron)
GUIDES = {
    'banner': ('gids-banner-assassin.png', 0, 2),
    'assassin': ('gids-banner-assassin.png', 1, 2),
    'samurai': ('gids-samurai.png', 0, 1),
    'centurion': ('gids-centurion.png', 0, 1),
    'priestess': ('gids-priestess.png', 0, 1),
    'pilot': ('gids-pilot.png', 0, 1),
}


def _figure(path, index, count):
    a = np.array(Image.open(path).convert('RGBA'))
    solid = a[..., 3] >= 200
    # De `count` grootste aaneengesloten vormen zijn de figuren (van links naar rechts); bij elk
    # figuur horen ook de losse stukjes binnen zijn omtrek (een vlaggenpunt, een haarlok).
    lab, n = ndi.label(solid)
    sizes = ndi.sum(solid, lab, range(1, n + 1))
    main = sorted(np.argsort(sizes)[-count:] + 1, key=lambda i: ndi.center_of_mass(lab == i)[1])
    body = lab == main[index]
    ys, xs = np.where(body)
    box = np.zeros_like(body); box[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
    others = np.isin(lab, [i for i in main if i != main[index]])
    loose = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 40]) & box & ~others & ~ndi.binary_dilation(others, iterations=6)
    solid = ndi.binary_erosion(body | loose, iterations=1)
    alpha = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    a[..., 3] = np.minimum(np.array(alpha), 255)
    ys, xs = np.where(a[..., 3] > 8)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pm = a.astype(float); pm[..., :3] *= pm[..., 3:] / 255        # premultiplied verkleinen: geen lichte randen
    width = round(a.shape[1] * HEIGHT / a.shape[0])
    r = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((width, HEIGHT), Image.LANCZOS)).astype(float)
    al = r[..., 3:]; r[..., :3] = np.where(al > 0, r[..., :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(r.clip(0, 255).astype(np.uint8), 'RGBA')


def build_guides(SRC, OUT):
    info = {}
    for name, (src, index, count) in GUIDES.items():
        im = _figure(SRC + src, index, count)
        im.save(f'{OUT}/guide-{name}.webp', quality=88, method=6)
        info[name] = im.size
    return info


if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    print(build_guides(root + '/art/source/', root + '/public/assets/art'))
