"""Kaartenbalk (art/source/kaartenbalk.png) -> public/assets/art/cardbar.webp + src/art/cardbar.json.

De posities zijn in bronpixels opgemeten; ze worden mee geschaald naar de textuur.
"""
import json
from PIL import Image

OUT_WIDTH = 1920   # 2x wereldresolutie bij een balk van volle breedte (960)
SOURCE = {
    'mainTop': 71,       # bovenrand van de stenen balk (embleem steekt erboven uit)
    'bottom': 690,       # onderkant van de zichtbare art
    'slots': [(461, 191, 806, 542), (832, 191, 1177, 542), (1203, 191, 1547, 542), (1574, 191, 1919, 542)],
    'slotInset': 16,     # dikte van de gouden lijst
    'medal': (305, 325, 88),          # energiemedaillon: midden x, y en straal
    'plaque': (192, 466, 424, 548),   # binnenkant van het plaatje onder het medaillon
}

def build_bar(SRC, OUT, MANIFEST):
    im = Image.open(SRC + 'kaartenbalk.png').convert('RGBA')
    k = OUT_WIDTH / im.width
    out = im.resize((OUT_WIDTH, round(im.height * k)), Image.LANCZOS)
    out.save(f'{OUT}/cardbar.webp', quality=90, method=6)   # WebP: ~10x kleiner dan PNG
    s = SOURCE; i = s['slotInset']
    info = {
        'width': out.width, 'height': out.height,
        'mainTop': round(s['mainTop'] * k, 1), 'bottom': round(s['bottom'] * k, 1),
        'slots': [{'x': round((x0 + i) * k, 1), 'y': round((y0 + i) * k, 1),
                   'w': round((x1 - x0 - 2 * i) * k, 1), 'h': round((y1 - y0 - 2 * i) * k, 1)}
                  for x0, y0, x1, y1 in s['slots']],
        'medal': {'x': round(s['medal'][0] * k, 1), 'y': round(s['medal'][1] * k, 1), 'r': round(s['medal'][2] * k, 1)},
        'plaque': dict(zip('xywh', [round(v * k, 1) for v in
                       (s['plaque'][0], s['plaque'][1], s['plaque'][2] - s['plaque'][0], s['plaque'][3] - s['plaque'][1])])),
    }
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info
