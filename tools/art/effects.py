"""Effecten en het vliegtuig."""
import json
import numpy as np
from PIL import Image
from extract import bands, frames_in_row
from boards import board_effect

def _sheet(frames, h_target, OUT, name, mode='RGBA'):
    sc = h_target / max(f[0].shape[0] for f in frames)
    cw = int(max(f[0].shape[1] for f in frames) * sc) + 4; ch = int(h_target) + 4
    sheet = Image.new(mode, (cw * len(frames), ch), (0, 0, 0, 0) if mode == 'RGBA' else (0, 0, 0))
    for i, (rgb, m, al) in enumerate(frames):
        im = Image.fromarray(np.dstack([rgb, al]) if mode == 'RGBA' else rgb, mode)
        w2, h2 = max(1, round(im.width * sc)), max(1, round(im.height * sc))
        im = im.resize((w2, h2), Image.LANCZOS)
        if mode == 'RGBA': sheet.alpha_composite(im, (i * cw + (cw - w2) // 2, ch - 2 - h2))
        else: sheet.paste(im, (i * cw + (cw - w2) // 2, ch - 2 - h2))
    sheet.save(f'{OUT}/{name}', quality=90) if name.endswith('.jpg') else sheet.save(f'{OUT}/{name}', optimize=True)
    return {'frameWidth': cw, 'frameHeight': ch, 'frames': len(frames)}

def build_effects(SRC, OUT, MANIFEST):
    info = {}
    # Vuurinslag: zwarte achtergrond, in het spel additief getekend
    fire = board_effect(SRC + 'vuurwerper-bord.png', 460, 578, 440, 1440, 6)
    info['fire'] = _sheet(fire, 110, OUT, 'fx-fire.jpg', mode='RGB')
    # P-51: rij 1 blauw, rij 2 rood; 4 frames (stil, draaiend, vurend, draaiend)
    A = np.array(Image.open(SRC + 'p51.png').convert('RGBA'))
    al = A[..., 3]; fg = al > 40
    rows = [r for r in bands(fg.sum(1), 2, 6) if r[1] - r[0] > 60]
    assert len(rows) == 2, rows
    for side, row in zip(['blue', 'red'], rows):
        boxes = frames_in_row(fg, row[0], row[1], 0, mingap=10, minwidth=120)
        frames = [(A[y0:y1, x0:x1, :3], fg[y0:y1, x0:x1], al[y0:y1, x0:x1]) for x0, y0, x1, y1 in boxes]
        info['p51'] = _sheet(frames, 100, OUT, f'p51-{side}.png')
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info
