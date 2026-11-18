"""Extra arena's voor de campagne: art/source/arena-*.png -> public/assets/art/arena-*.jpg.

    python3 tools/art/arenas.py        (of via build.py)

De simulatie ligt vast: banen op wereld-y 123 en 221, veld 960 x 310 (zie src/sim/config.js).
De bronnen zijn 1672 x 941, net als de oorspronkelijke arena, maar hun banen liggen verder uit
elkaar. Daarom een verticale vervorming per arena:
  - boven de bovenste baan en onder de onderste: gewone schaal (lucht en gebouwen blijven recht);
  - de banen zelf (lane_half px boven en onder het midden): gewone schaal;
  - alleen de strook tussen de banen wordt samengedrukt.
Een monotone kromme (PCHIP) maakt de overgangen vloeiend. Er staan geen torens of kastelen in deze
bronnen, dus er hoeft niets weggepoetst te worden. Uitvoer heeft dezelfde maat als arena.jpg.
"""
import json, os
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import map_coordinates

LANE_Y = (123, 221)          # wereld
FIELD_H = 310                # wereld
OUT_W, OUT_H = 1920, 620     # textuur (2x wereld)

# naam -> (bron, midden bovenste baan, midden onderste baan, halve baanbreedte), in bronpixels.
# Gemeten op de bron; controle: python3 tools/art/arenas.py --check tekent de banen erover.
ARENAS = {
    'arena-rome': ('arena-rome.png', 393, 653, 40),      # stad: Colosseum, tempels, stenen paden
    'arena-sunset': ('arena-sunset.png', 445, 680, 52),  # platteland: aquaduct, ruïnes, zandbanen
    'arena-meadow': ('arena-meadow.png', 437, 645, 45),  # Age of Knights: toernooiweide, lelievaandels
    'arena-winter': ('arena-winter.png', 450, 640, 45),  # Age of Knights: besneeuwd veld, burcht op de achtergrond
    'arena-ruins': ('arena-ruins.png', 428, 622, 45),    # Age of Knights: ruïnes in de sneeuw, vuurschalen
}


def _mapping(src_w, lane1, lane2, half):
    k = 960 / src_w                                  # wereld per bronpixel, zoals de oude arena
    d = half * k
    wy = [0, LANE_Y[0] - d, LANE_Y[0] + d, LANE_Y[1] - d, LANE_Y[1] + d, FIELD_H]
    sy = [lane1 - LANE_Y[0] / k, lane1 - half, lane1 + half, lane2 - half, lane2 + half, lane2 + (FIELD_H - LANE_Y[1]) / k]
    return PchipInterpolator(wy, sy), sy


def build_arena(path, lane1, lane2, half):
    a = np.array(Image.open(path).convert('RGB')).astype(float)
    h, w = a.shape[:2]
    f, sy = _mapping(w, lane1, lane2, half)
    assert sy[0] >= 0 and sy[-1] <= h - 1, f'{path}: veld valt buiten de bron ({sy[0]:.0f}..{sy[-1]:.0f} van {h})'
    rows = f((np.arange(OUT_H) + 0.5) * FIELD_H / OUT_H)
    cols = (np.arange(OUT_W) + 0.5) * w / OUT_W - 0.5
    yy, xx = np.meshgrid(rows, cols, indexing='ij')
    out = np.dstack([map_coordinates(a[..., c], [yy, xx], order=3, mode='nearest') for c in range(3)])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def build_arenas(SRC, OUT, MANIFEST=None):
    info = {}
    for name, (src, l1, l2, half) in ARENAS.items():
        im = build_arena(SRC + src, l1, l2, half)
        im.save(f'{OUT}/{name}.jpg', quality=88)
        info[name] = {'width': im.width, 'height': im.height}
    if MANIFEST:
        json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info


if __name__ == '__main__':
    import sys
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    info = build_arenas(root + '/art/source/', root + '/public/assets/art', root + '/src/art/arenas.json')
    print(info)
    if '--check' in sys.argv:
        from PIL import ImageDraw
        for name in ARENAS:
            im = Image.open(f'{root}/public/assets/art/{name}.jpg').resize((960, 310)); d = ImageDraw.Draw(im)
            for y in LANE_Y: d.line([(0, y), (960, y)], fill=(0, 255, 255), width=1)
            im.save(f'/tmp/{name}-check.png')
