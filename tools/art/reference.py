"""Overzichtsbladen per eenheid (art/reference/): alle animaties onder elkaar,
met naam en aantal frames. Bedoeld als voorbeeld bij het maken van nieuwe
bewegingen (bijv. voor ChatGPT). Wordt bij elke build opnieuw gemaakt."""
import json, os
from PIL import Image, ImageDraw, ImageFont

LABELS = {'melee': 'Legionair', 'archer': 'Boogschutter', 'cannon': 'Kanon', 'cavalry': 'Romeinse ruiter',
          'berserker': 'Viking berserker', 'horse_archer': 'Mongoolse ruiterboogschutter', 'musket': 'Musketier',
          'healer': 'Egyptische genezeres', 'samurai': 'Schaduwsamoerai', 'spy': 'Spion', 'firethrower': 'Vuurwerper'}

def _font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def build_reference(OUT_ART, MANIFEST, REF):
    os.makedirs(REF, exist_ok=True)
    units = json.load(open(MANIFEST))
    title, small = _font(30), _font(18)
    for i, (key, d) in enumerate(units.items()):
        tex = Image.open(f"{OUT_ART}/{d['textures'][0]}.png")
        fw, fh = d['frameWidth'], d['frameHeight']
        n = sum(len(v) for v in d['anims'].values()); cols = min(10, n)
        label_w = 190; maxf = max(len(v) for v in d['anims'].values())
        W = label_w + maxf * fw + 20; H = 70 + len(d['anims']) * (fh + 14)
        sheet = Image.new('RGBA', (W, H), (24, 20, 30, 255)); dr = ImageDraw.Draw(sheet)
        dr.text((16, 16), f"{LABELS.get(key, key)}  ({key})", fill=(240, 205, 120), font=title)
        y = 66
        for anim, frames in d['anims'].items():
            dr.rectangle([8, y - 4, W - 8, y + fh + 4], outline=(110, 90, 50), width=2)
            dr.text((18, y + fh // 2 - 20), anim.upper(), fill=(240, 220, 170), font=title if len(anim) < 7 else small)
            dr.text((18, y + fh // 2 + 14), f"{len(frames)} frames", fill=(170, 160, 150), font=small)
            for j, f in enumerate(frames):
                c = tex.crop(((f % cols) * fw, (f // cols) * fh, (f % cols + 1) * fw, (f // cols + 1) * fh))
                sheet.alpha_composite(c, (label_w + j * fw, y))
                dr.text((label_w + j * fw + 4, y + fh - 20), str(j + 1), fill=(150, 140, 120), font=small)
            y += fh + 14
        sheet.convert('RGB').save(f"{REF}/{i + 1:02d}-{key}.png", optimize=True)
