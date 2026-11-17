"""Moduskeuze, The Conquest (campagnekaart) en Trophy Road.

    python3 tools/art/conquest.py        (of via build.py)

Bronnen (art/source/, PNG's van ChatGPT, de meeste met echte transparantie):
  modus-conquest.png, modus-trophy-road.png, modus-ranked-locked.png   moduskaarten (naamplaat leeg)
  conquest-rome-1..3.png, knights-map-1..3.png                         kaartsegmenten per wereld (MAPS), weg loopt links->rechts door
  world-knights.png, knights-landscape.png                             wereldkaart (keuzescherm) en achtergrond van het wereldscherm
  conquest-nodes.png                                                   6 missie-badges op een rij
  conquest-stars.png                                                   ster leeg, vol, gloed
  conquest-mission-panel.png, conquest-scroll.png                      perkamentpaneel en -rol (leeg)
  trophy-road-bg.png, arena-badges.png, trophy-icon.png, chest-icons.png   Trophy Road

Uitvoer: public/assets/art/*.webp en src/art/conquest.json (maten en tekstvlakken in procenten).
Alle tekst zet het spel er zelf op (src/conquest.js / conquest.css).
"""
import json, os
import numpy as np
from PIL import Image

# De drie kaartsegmenten worden met een korte overvloeiing aan elkaar gezet en daarna in
# gelijke tegels gesneden. Missieposities in src/campaign/rome.js staan in bronpixels van
# het segment (seg, x, y); src/conquest.js rekent ze om met MAP_OVERLAP uit het manifest.
MAP_OVERLAP = 90
MAP_TILES = 3
# wereld -> (bronnen met {} voor 1..3, uitvoernaam van de tegels). Alle segmenten worden op de maat
# van conquest-rome-1 gebracht (1870 x 841), zodat missieposities per wereld hetzelfde werken.
MAPS = {
    'rome': ('conquest-rome-{}.png', 'conquest-map'),
    'knights': ('knights-map-{}.png', 'knights-map'),
}
# Wereldkaarten voor het keuzescherm. Rome gebruikt de moduskaart 'mode-conquest'.
# Bij world-knights is de naamplaat perkament (niet donkerrood): vlak met de hand gemeten, in bronpixels.
WORLD_CARDS = {
    'world-knights': ('world-knights.png', (360, 925, 1085, 1030)),
}

NODES = ['locked', 'open', 'current', 'done', 'boss', 'bonus']
NODE_CUTS = [365, 712, 1082, 1415, 1816]   # tussen de badges; de gloed van 'current' loopt over de buren heen
ARENAS = 5
ARENA_CUTS = [440, 868, 1300, 1733]
STARS = ['empty', 'full', 'glow']
CHESTS = ['wood', 'silver', 'gold']


def _rgba(path):
    a = np.array(Image.open(path).convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])           # waas rond de rand weg
    return a


def _trim(a):
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def _resize(a, width=None, height=None):
    """Premultiplied verkleinen: geen lichte randen rond doorzichtige delen."""
    h0, w0 = a.shape[:2]
    if width is None: width = round(w0 * height / h0)
    if height is None: height = round(h0 * width / w0)
    pm = a.astype(float); pm[..., :3] *= pm[..., 3:] / 255
    r = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((width, height), Image.LANCZOS)).astype(float)
    al = r[..., 3:]; r[..., :3] = np.where(al > 0, r[..., :3] * 255 / np.maximum(al, 1), 0)
    return r.clip(0, 255).astype(np.uint8)


def _save(a, path, quality=88):
    Image.fromarray(a, 'RGBA').save(path, quality=quality, method=6)
    return {'width': a.shape[1], 'height': a.shape[0]}


def _split(a, cuts):
    edges = [0, *cuts, a.shape[1]]
    return [a[:, edges[i]:edges[i + 1]] for i in range(len(edges) - 1)]


def _icon(a, size):
    """Bijsnijden, passend maken in een vierkant en centreren (alle iconen even groot in CSS)."""
    a = _trim(a)
    h, w = a.shape[:2]
    k = size / max(w, h)
    r = _resize(a, max(1, round(w * k)), max(1, round(h * k)))
    out = np.zeros((size, size, 4), np.uint8)
    y, x = (size - r.shape[0]) // 2, (size - r.shape[1]) // 2
    out[y:y + r.shape[0], x:x + r.shape[1]] = r
    return out


def _solid(a, grow=2):
    """Alleen het grootste dekkende voorwerp houden (gloed van een buur-icoon weg)."""
    from scipy import ndimage as ndi
    lab, n = ndi.label(a[..., 3] > 235)
    if n < 2: return a
    sizes = ndi.sum(a[..., 3] > 235, lab, range(1, n + 1))
    keep = ndi.binary_dilation(lab == 1 + int(np.argmax(sizes)), iterations=grow)
    a = a.copy(); a[..., 3] = np.where(keep, a[..., 3], 0)
    return a


def _pct(box, w, h):
    x0, y0, x1, y1 = box
    return {'left': round(100 * x0 / w, 2), 'top': round(100 * y0 / h, 2),
            'width': round(100 * (x1 - x0) / w, 2), 'height': round(100 * (y1 - y0) / h, 2)}


def _plate(a):
    """Lege donkerrode naamplaat onderin een moduskaart -> vlak in procenten."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    m = (rgb[..., 0] > 60) & (rgb[..., 0] < 150) & (rgb[..., 1] < 45) & (rgb[..., 2] < 45) & (a[..., 3] > 200)
    m[:int(h * 0.68)] = False
    rows = np.where(m.sum(1) > w * 0.35)[0]
    cols = np.where(m[rows.min():rows.max() + 1].sum(0) > (rows.max() - rows.min()) * 0.5)[0]
    return _pct((cols.min(), rows.min(), cols.max() + 1, rows.max() + 1), w, h)


def _parchment(a):
    """Het lege perkamentvlak binnen de goudlijst -> vlak in procenten."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    m = (rgb[..., 0] > 205) & (rgb[..., 1] > 170) & (rgb[..., 2] > 110) & (rgb[..., 2] < 205) & \
        (rgb[..., 0] - rgb[..., 2] > 35) & (a[..., 3] > 200)
    rows = np.where(m.sum(1) > w * 0.5)[0]
    cols = np.where(m.sum(0) > h * 0.4)[0]
    return _pct((cols.min(), rows.min(), cols.max() + 1, rows.max() + 1), w, h)


def build_conquest(SRC, OUT, MANIFEST):
    info = {}

    # --- Moduskaarten ---
    for src, name in [('modus-conquest.png', 'mode-conquest'), ('modus-trophy-road.png', 'mode-trophy'),
                      ('modus-ranked-locked.png', 'mode-ranked')]:
        a = _resize(_trim(_rgba(SRC + src)), width=760)
        info[name] = {**_save(a, f'{OUT}/{name}.webp'), 'plate': _plate(a)}

    # --- Campagnekaarten: per wereld drie segmenten -> één strook met overvloeiing -> tegels ---
    info['maps'] = {}
    size = Image.open(SRC + MAPS['rome'][0].format(1)).size
    for world, (pattern, out_name) in MAPS.items():
        segs = [np.array(Image.open(SRC + pattern.format(i)).convert('RGB').resize(size, Image.LANCZOS)).astype(float) for i in (1, 2, 3)]
        h, w = segs[0].shape[:2]
        step = w - MAP_OVERLAP
        strip = np.zeros((h, step * 2 + w, 3))
        ramp = np.linspace(0, 1, MAP_OVERLAP)[None, :, None]
        for i, s in enumerate(segs):
            x = i * step
            if i == 0: strip[:, :w] = s
            else:
                strip[:, x:x + MAP_OVERLAP] = strip[:, x:x + MAP_OVERLAP] * (1 - ramp) + s[:, :MAP_OVERLAP] * ramp
                strip[:, x + MAP_OVERLAP:x + w] = s[:, MAP_OVERLAP:]
        strip = strip.clip(0, 255).astype(np.uint8)
        total = strip.shape[1] - strip.shape[1] % MAP_TILES
        tile = total // MAP_TILES
        for i in range(MAP_TILES):
            Image.fromarray(strip[:, i * tile:(i + 1) * tile], 'RGB').save(f'{OUT}/{out_name}-{i + 1}.webp', quality=82, method=6)
        info['maps'][world] = {'tile': out_name, 'width': total, 'height': h, 'tiles': MAP_TILES, 'tileWidth': tile,
                               'segmentWidth': w, 'segmentStep': step}

    # --- Wereldkaarten en achtergrond van het wereldscherm ---
    for name, (src, box) in WORLD_CARDS.items():
        a = _rgba(SRC + src)
        plate = _pct(box, a.shape[1], a.shape[0])
        a = _resize(a, width=760)
        info[name] = {**_save(a, f'{OUT}/{name}.webp'), 'plate': plate}
    bg = Image.open(SRC + 'knights-landscape.png').convert('RGB')
    bg.resize((1280, round(1280 * bg.height / bg.width)), Image.LANCZOS).save(f'{OUT}/worlds-bg.webp', quality=80, method=6)

    # --- Missie-badges en sterren ---
    for name, part in zip(NODES, _split(_rgba(SRC + 'conquest-nodes.png'), NODE_CUTS)):
        _save(_icon(part if name == 'current' else _solid(part), 200), f'{OUT}/node-{name}.webp')
    for name, part in zip(STARS, _split(_rgba(SRC + 'conquest-stars.png'), [742, 1402])):
        _save(_icon(part, 128), f'{OUT}/star-{name}.webp')

    # --- Perkamentpaneel en -rol ---
    a = _resize(_trim(_rgba(SRC + 'conquest-mission-panel.png')), width=1200)
    info['mission-panel'] = {**_save(a, f'{OUT}/mission-panel.webp'), 'inner': _parchment(a)}
    a = _resize(_trim(_rgba(SRC + 'conquest-scroll.png')), width=1000)
    info['scroll'] = _save(a, f'{OUT}/scroll.webp')

    # --- Trophy Road ---
    road = Image.open(SRC + 'trophy-road-bg.png').convert('RGB')
    road.save(f'{OUT}/trophy-road.webp', quality=82, method=6)
    info['trophy-road'] = {'width': road.width, 'height': road.height}
    for i, part in enumerate(_split(_rgba(SRC + 'arena-badges.png'), ARENA_CUTS)):
        _save(_icon(part, 220), f'{OUT}/arena-{i + 1}.webp')
    _save(_icon(_rgba(SRC + 'trophy-icon.png'), 256), f'{OUT}/trophy.webp')
    for name, part in zip(CHESTS, _split(_rgba(SRC + 'chest-icons.png'), [710, 1419])):
        _save(_icon(part, 220), f'{OUT}/chest-{name}.webp')

    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info


if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    out = build_conquest(root + '/art/source/', root + '/public/assets/art', root + '/src/art/conquest.json')
    print(json.dumps(out, indent=1))
