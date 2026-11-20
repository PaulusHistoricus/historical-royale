"""Effecten uit pixelfx (MIT, https://github.com/patch-gg/pixelfx; licentie in art/source/pixelfx/LICENSE).
Geëxporteerd met `node tools/sheets.mjs <id>` in een pixelfx-checkout -> art/source/pixelfx/<naam>.png/.json.
Hier: om het `step`-de frame (minder frames, kleinere textuur) en verkleind met `scale` (nearest)."""
import json
from PIL import Image

# Kampvuur zonder houtblokken: onder BASE_CUT (fractie van de framehoogte) blijven alleen heldere vlampixels over.
BASE_CUT = {'campfire': 0.74}
EFFECTS = {   # naam -> (frame-stap, schaal, max. frames na het overslaan)
    'campfire': (2, 1.0, 999),
    'big-explosion': (2, 0.5, 60),   # na 4 s is het alleen nog rook
    'dirt-explosion': (2, 0.4, 40),  # inslag van kanon, tank en bazooka
    'acid-splash': (2, 0.5, 40),     # gifflesje van de Plague Doctor
    'heal-aoe': (2, 0.5, 40),        # veldhospitaal
    'hit-spark': (1, 0.5, 16),       # kogelinslag (sniper, musketier)
    'shield-block': (1, 0.5, 34),    # Spartaan blokt een projectiel
}


def build_pixelfx(SRC, OUT, MANIFEST):
    info = {}
    for name, (stepn, scale, maxn) in EFFECTS.items():
        meta = json.load(open(f'{SRC}pixelfx/{name}.json'))['meta']['pixelfx']
        im = Image.open(f'{SRC}pixelfx/{name}.png').convert('RGBA')
        fw, fh = meta['frameSize']; c = meta['columns']; idx = list(range(0, meta['frames'], stepn))[:maxn]
        w, h = round(fw * scale), round(fh * scale); cols = min(len(idx), max(1, 2000 // w))
        rows = -(-len(idx) // cols)
        sheet = Image.new('RGBA', (w * cols, h * rows))
        for k, i in enumerate(idx):
            fr = im.crop(((i % c) * fw, (i // c) * fh, (i % c + 1) * fw, (i // c + 1) * fh))
            if name in BASE_CUT:
                import numpy as np
                a = np.array(fr); y0 = int(fh * BASE_CUT[name])
                lum = a[y0:, :, :3].max(2).astype(int)
                ramp = np.clip(1 - (np.arange(fh - y0) / max(1, (fh - y0) * 0.35)), 0, 1)[:, None]   # zachte overgang
                mid = np.zeros((1, a.shape[1]), bool); mid[:, int(fw * 0.38):int(fw * 0.62)] = True   # houtuiteinden aan de zijkant weg
                keep = np.where((lum >= 235) & mid, 1.0, ramp)                                     # heldere vlammen blijven
                a[y0:, :, 3] = (a[y0:, :, 3] * keep).astype(np.uint8)
                fr = Image.fromarray(a)
            fr = fr.resize((w, h), Image.NEAREST)
            sheet.alpha_composite(fr, ((k % cols) * w, (k // cols) * h))
        sheet.save(f'{OUT}/pfx-{name}.png', optimize=True)
        info[name] = {'frameWidth': w, 'frameHeight': h, 'frames': len(idx), 'fps': meta['fps'] / stepn, 'loop': meta['loop'],
                      'originX': round(meta['pivot'][0] / fw, 4), 'originY': round(meta['pivot'][1] / fh, 4)}
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info


if __name__ == '__main__':
    import os
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    print(build_pixelfx(root + '/art/source/', root + '/public/assets/art', root + '/src/art/pixelfx.json'))
