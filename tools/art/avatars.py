"""20 ronde avatars uit art/source/avatars.png (5 x 4 op wit) -> public/assets/avatars/a01..a20.webp."""
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from extract import fg_mask

SIZE = 256

def build_avatars(SRC, PUBLIC):
    A = np.array(Image.open(SRC + 'avatars.png').convert('RGBA'))
    m = ndi.binary_fill_holes(A[..., 3] > 128)
    # Regelmatig raster van 5 x 4 cirkels die elkaar raken: middelpunten uit de omhullende.
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    cw, ch = (x1 - x0) / 5, (y1 - y0) / 4
    r = int(min(cw, ch) / 2)
    boxes = []
    for k in range(4):
        for j in range(5):
            cx, cy = x0 + cw * (j + 0.5), y0 + ch * (k + 0.5)
            boxes.append((int(cy) - r, int(cy) + r, int(cx) - r, int(cx) + r))
    ordered = boxes
    out = os.path.join(PUBLIC, 'avatars'); os.makedirs(out, exist_ok=True)
    src = Image.open(SRC + 'avatars.png').convert('RGBA')
    circle = Image.new('L', (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(circle).ellipse((2, 2, SIZE * 4 - 3, SIZE * 4 - 3), fill=255)
    circle = circle.resize((SIZE, SIZE), Image.LANCZOS)
    for i, (y0, y1, x0, x1) in enumerate(boxes):
        d = max(y1 - y0, x1 - x0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        im = src.crop((round(cx - d / 2), round(cy - d / 2), round(cx + d / 2), round(cy + d / 2))).resize((SIZE, SIZE), Image.LANCZOS)
        im.putalpha(Image.fromarray(np.minimum(np.array(im)[..., 3], np.array(circle))))
        im.save(os.path.join(out, f'a{i + 1:02d}.webp'), quality=88, method=6)
    return len(ordered)
