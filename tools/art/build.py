"""Zet de ruwe AI-art in art/source/ om naar game-assets.

    python3 tools/art/build.py

Vereist: pip install pillow numpy scipy
Schrijft: public/assets/art/*.png|jpg (textures) en src/art/*.json (frames/animaties).
De uitsnijposities staan in units.py en world.py; zie art/README.md.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from units import build_units
from world import build_world
from cards import build_cards
from bar import build_bar
from effects import build_effects
from screens import build_screens
from reference import build_reference
from avatars import build_avatars
from victory import build_victory
from achievements import build_achievements
from pixelfx import build_pixelfx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'source') + '/'
OUT = os.path.join(ROOT, 'public', 'assets', 'art')
os.makedirs(OUT, exist_ok=True)
build_units(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'units.json'))
build_world(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'world.json'))
build_cards(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'cards.json'))
build_bar(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'cardbar.json'))
build_effects(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'effects.json'))
build_screens(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'screens.json'))
build_avatars(SRC, os.path.join(ROOT, 'public', 'assets'))
build_victory(SRC, OUT)
build_achievements(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'achievements.json'))
build_pixelfx(SRC, OUT, os.path.join(ROOT, 'src', 'art', 'pixelfx.json'))
build_reference(OUT, os.path.join(ROOT, 'src', 'art', 'units.json'), os.path.join(ROOT, 'art', 'reference'))
for f in sorted(os.listdir(OUT)):
    print(f'{f:24s} {os.path.getsize(os.path.join(OUT, f)) // 1024:5d} kB')
