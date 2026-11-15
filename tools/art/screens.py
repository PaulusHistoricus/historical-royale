"""Menu (losse elementen) en logo (laadscherm).

menu.png is het oorspronkelijke voorbeeld; het spel bouwt het menu op uit de
losse elementen zodat het op elk scherm netjes past.
"""
import json
import numpy as np
from PIL import Image
from extract import fg_mask, matte

ELEMENTS = {   # bronbestand -> (textuurnaam, breedte in textuurpixels)
    'menu-titelbord.png': ('menu-title', 1000),
    'menu-knop-spelen.png': ('menu-play', 760),
    'menu-knop-gevecht.png': ('menu-battle', 760),
    'menu-knop-team.png': ('menu-team', 760),
    'menu-knop-instellingen.png': ('menu-settings', 760),
    'menu-trofee.png': ('menu-trophy', 200),
    'menu-bel.png': ('menu-bell', 200),
    'menu-decks.png': ('menu-decks', 200),
}
# Uitsneden uit menu-elementen-2.png (bronpixels): personages voor de zijkanten en het cadeau.
SHEET2 = {
    'menu-gift': ((1280, 575, 1396, 692), 200),
    'menu-healer': ((15, 5, 380, 425), 560),
    'menu-legionary': ((358, 25, 735, 422), 560),
    'menu-samurai': ((698, 22, 1062, 438), 560),
    'menu-pilot': ((1042, 15, 1525, 425), 700),
}

def _cutout(path, width, box=None):
    src = Image.open(path)
    if box: src = src.crop(box)
    A = np.array(src.convert('RGBA'))
    if src.mode == 'RGBA' and (A[..., 3] < 20).mean() > 0.05:      # al doorzichtig
        al = np.where(A[..., 3] < 24, 0, A[..., 3]).astype(np.uint8); m = al > 0
        rgb = A[..., :3]
    else:                                                              # witte achtergrond
        m = fg_mask(A[..., :3].astype(np.int16)); rgb, al = matte(A[..., :3], m)
    from scipy import ndimage as ndi
    lab, n = ndi.label(m)
    if n > 1:   # snippers van buurfiguren weghalen
        sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.03]
        m = np.isin(lab, keep); al = (al * m).astype(np.uint8)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    im = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], al[y0:y1, x0:x1]]), 'RGBA')
    # premultiplied verkleinen tegen witte randen
    pm = np.array(im).astype(float); pm[..., :3] *= pm[..., 3:] / 255
    h = round(im.height * width / im.width)
    r = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((width, h), Image.LANCZOS)).astype(float)
    A = r[..., 3:]; r[..., :3] = np.where(A > 0, r[..., :3] * 255 / np.maximum(A, 1), 0)
    return Image.fromarray(r.clip(0, 255).astype(np.uint8), 'RGBA')

def build_screens(SRC, OUT, MANIFEST):
    bg = Image.open(SRC + 'menu-achtergrond.png').convert('RGB')
    bg.resize((1920, round(bg.height * 1920 / bg.width)), Image.LANCZOS).save(f'{OUT}/menu-bg.webp', quality=86, method=6)
    logo = Image.open(SRC + 'logo.png').convert('RGB')
    logo.resize((1200, round(logo.height * 1200 / logo.width)), Image.LANCZOS).save(f'{OUT}/logo.webp', quality=88, method=6)
    # App-iconen (installeren): vierkante uitsnede van het logo, ronde hoeken doet het toestel zelf.
    icon = logo_full = Image.open(SRC + 'logo.png').convert('RGB').crop((366, 0, 1307, 941))
    import os
    pub = os.path.dirname(OUT.rstrip('/'))       # public/assets
    for size in (192, 512):
        icon.resize((size, size), Image.LANCZOS).save(f'{pub}/icon-{size}.png', optimize=True)
    icon.resize((180, 180), Image.LANCZOS).save(f'{pub}/apple-touch-icon.png', optimize=True)
    # maskable: veilige zone (80%) met de rand opgevuld
    m = Image.new('RGB', (512, 512), (40, 24, 12)); m.paste(icon.resize((420, 420), Image.LANCZOS), (46, 46))
    m.save(f'{pub}/icon-maskable-512.png', optimize=True)
    info = {}
    for src, (name, width) in ELEMENTS.items():
        im = _cutout(SRC + src, width)
        im.save(f'{OUT}/{name}.webp', quality=90, method=6, lossless=False)
        info[name] = {'width': im.width, 'height': im.height}
    for name, (box, width) in SHEET2.items():
        im = _cutout(SRC + 'menu-elementen-2.png', width, box)
        im.save(f'{OUT}/{name}.webp', quality=90, method=6)
        info[name] = {'width': im.width, 'height': im.height}
    json.dump(info, open(MANIFEST, 'w'), indent=1)
    return info
