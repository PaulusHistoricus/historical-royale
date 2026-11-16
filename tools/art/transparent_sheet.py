"""Spritesheet met echte transparantie, één rij per animatie, maar met een rode/gele waas aan de randen
(ChatGPT-export). Gloed (hartjes, mondingsvuur, roze stof) moet blijven; de waas niet.

    frames = transparent_unit(path, {'idle': (y0, y1, aantal), ...}, x0, x1, fx={'death': {4, 5}})
Geeft dezelfde groepen als boards.board_unit: {anim: [(rgb, mask, alpha), ...]}.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from boards import panel_frames


def _clean(rgba, fx_only=False):
    a = rgba.astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    al = np.where(al < 28, 0, al)
    solid = al >= 200
    al = np.where(solid, 255, al)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    semi = (al > 0) & ~solid
    near = ndi.distance_transform_edt(~solid) <= 14 if solid.any() else np.zeros_like(solid)
    # waas: verzadigd rood of geel, half doorzichtig, vlak naast het figuur. Roze gloed (veel blauw) blijft.
    fringe = semi & near & (((r > 110) & (g < 95) & (b < 95)) | ((r > 150) & (g > 120) & (b < 70) & (al < 150)))
    al = np.where(fringe, 0, al)
    if fx_only:                       # alleen stof/gloed: geen figuur
        al = np.where(solid, al, al)
    # randpixels van het figuur: kleur van het dichtstbijzijnde dekkende pixel (geen rode zweem)
    if solid.any():
        _, (iy, ix) = ndi.distance_transform_edt(~solid, return_indices=True)
        edge = (al > 0) & ~solid & (ndi.distance_transform_edt(~solid) <= 2)
        rgb[edge] = rgb[iy[edge], ix[edge]]
    m = al > 0
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 25])
    al = al * m
    ys, xs = np.where(m)
    if not len(ys):
        return rgb[:2, :2].astype(np.uint8), m[:2, :2], al[:2, :2].astype(np.uint8)
    sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return rgb[sl].clip(0, 255).astype(np.uint8), m[sl], al[sl].clip(0, 255).astype(np.uint8)


def transparent_unit(path, rows, x0, x1, fx=None):
    A = np.array(Image.open(path).convert('RGBA'))
    # panel_frames zoekt kolommen met 'inhoud' in een RGB-beeld: geef het de alfa als grijswaarde
    lumimg = np.repeat(np.where(A[..., 3:4] >= 60, 255, 0).astype(np.uint8), 3, axis=2)
    G, fx = {}, fx or {}
    for anim, (y0, y1, count) in rows.items():
        G[anim] = []
        for i, (bx0, by0, bx1, by1) in enumerate(panel_frames(lumimg, y0, y1, x0, x1, count, thresh=100, mingap=6)):
            pad = 8
            crop = A[by0:by1, max(0, bx0 - pad):min(A.shape[1], bx1 + pad)]
            G[anim].append(_clean(crop, fx_only=i in fx.get(anim, ())))
    return G
