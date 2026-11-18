"""Prestatie-iconen: art/source/prestaties-*.png (raster van iconen, doorzichtig) ->
public/assets/art/achievements.webp (één rij van 128x128) + src/art/achievements.json (sleutel -> index)."""
import json
import numpy as np
from PIL import Image
from extract import bands

SIZE = 128
# Volgorde in het bronvel, rij voor rij = volgorde van ACHIEVEMENTS in public/api/_game.php.
SHEETS = [('prestaties-1.png', ['first_win', 'wins_10', 'wins_50', 'wins_200', 'matches_10', 'matches_100',
    'towers_10', 'towers_100', 'units_250', 'units_2000', 'streak_3', 'streak_10',
    'level_5', 'level_10', 'level_25', 'card_3', 'card_6'])]


def _icons(path):
    a = np.array(Image.open(path).convert('RGBA'))
    fg = (a[..., 3] > 40) & (a[..., :3].min(2) < 235)
    out = []
    for y0, y1 in [r for r in bands(fg.sum(1), 5, 10) if r[1] - r[0] > 100]:
        for x0, x1 in [c for c in bands(fg[y0:y1].sum(0), 5, 8) if c[1] - c[0] > 100]:
            sub = a[y0:y1, x0:x1].copy()
            sub[..., 3] = np.where(sub[..., 3] < 24, 0, sub[..., 3])
            side = max(sub.shape[:2])
            sq = Image.new('RGBA', (side, side)); sq.paste(Image.fromarray(sub), ((side - sub.shape[1]) // 2, (side - sub.shape[0]) // 2))
            out.append(sq.resize((SIZE, SIZE), Image.LANCZOS))
    return out


def build_achievements(SRC, OUT, MANIFEST):
    icons, index = [], {}
    for fname, keys in SHEETS:
        found = _icons(SRC + fname)
        assert len(found) == len(keys), (fname, len(found))
        for k, im in zip(keys, found):
            index[k] = len(icons); icons.append(im)
    sheet = Image.new('RGBA', (SIZE * len(icons), SIZE))
    for i, im in enumerate(icons): sheet.alpha_composite(im, (i * SIZE, 0))
    sheet.save(f'{OUT}/achievements.webp', quality=88, method=6)
    json.dump({'size': SIZE, 'count': len(icons), 'icons': index}, open(MANIFEST, 'w'), indent=1)
    return index


if __name__ == '__main__':
    import os
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    print(build_achievements(root + '/art/source/', root + '/public/assets/art', root + '/src/art/achievements.json'))
