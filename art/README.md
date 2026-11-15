# Art-pijplijn

De art in `art/source/` is gegenereerd met AI en komt als losse sheets op een witte of donkere achtergrond.
`tools/art/build.py` maakt daar game-assets van:

```bash
pip install pillow numpy scipy
python3 tools/art/build.py
```

## Wat het script doet

1. **Achtergrond weghalen**: alles wat via de rand verbonden is met de achtergrondkleur wordt transparant (`extract.py: fg_mask`).
2. **Frames vinden**: rijen en kolommen worden gesplitst op lege stroken. Waar effecten frames verbinden (zwaardzwaai, pijl) staan vaste knippunten in `units.py` (`split_at`).
3. **Uitlijnen**: elk frame wordt op de voeten uitgelijnd (onderkant, midden van de onderste 22 %), zodat animaties niet verspringen.
4. **Teamkleuren**: rood → blauw (of omgekeerd) via een tintverschuiving van alleen verzadigde rode/blauwe pixels. De boogschutter heeft geen teamkleur; het team zie je aan de cirkel onder de voeten en de levensbalk.
5. **Arena**: de geschilderde torens en kastelen worden weggekloond, zodat de beschadigbare versies erop passen.
6. **Uitvoer**: textures op 2× wereldresolutie in `public/assets/art/`, frame- en animatiegegevens in `src/art/units.json` en `src/art/world.json`.

## Bronbestanden

| Bestand | Gebruikt voor |
| --- | --- |
| `legionair.png` | Legionair: rust 4, lopen 6, aanvallen 7, geraakt 2, sterven 6 |
| `boogschutter.png` | Boogschutter: rust 3, lopen 6, schieten 6, geraakt 2, sterven 6 |
| `arena-kanon-a.png` | Kanon: lopen 4, vuren 4 (onderste rij) |
| `arena-kanon-b.png` | Kanon: kapot (laatste frame onderste rij) |
| `arena-kanon-c.png` | Niet gebruikt (alternatieve arena/kanon) |
| `ruiter.png` | Romeinse ruiter: rust 4, lopen 6, aanvallen 6, geraakt 4, sterven 6 |
| `berserker.png` | Viking berserker: rust 5, lopen 8, aanvallen 6, geraakt 4, sterven 6 |
| `ruiterboogschutter.png` | Mongoolse ruiterboogschutter: rust 4, lopen 6, schieten 6, geraakt 4, sterven 6 |
| `musketier.png` | Musketier: rust 4, lopen 8, schieten 8, geraakt 4, sterven 7 |
| `kaarten.png` | De zeven kaarten onderin, in de volgorde van `CARDS` |
| `kaartenbalk.png` | De kaartenbalk; vakken, medaillon en plaatje zijn opgemeten in `tools/art/bar.py` |
| `torens-kastelen.png` | Schadestadia toren en kasteel (bovenste helft) en de arena (onderste helft) |

## Bronnen met echte transparantie

De vier nieuwe eenheden zijn PNG's met een alfakanaal. Die gaan via `rgba_unit()` in `units.py`: één rij per animatie
(rust, lopen, aanvallen, geraakt, sterven). Waar frames elkaar raken staan knippunten als `{(rij, frame): [x, ...]}`;
kleine uitsteeksels (een lans, een pijl) blijven bij het frame waar ze bij horen. Dit formaat heeft de voorkeur voor nieuwe art.

## Kaarten

`cards.py` snijdt de kaarten uit `kaarten.png` en zoekt het paarse energiejuweel op. Het spel tekent daar een eigen
juweel overheen met de **echte** kosten uit `config.js`, zodat kaart en spel nooit uit elkaar lopen.
Een nieuwe kaart: voeg hem toe aan `kaarten.png` (zelfde stijl, juweel linksboven) en aan `ORDER` in `cards.py`.

## Animatieborden (v0.12)

`vuurwerper-bord.png`, `samoerai-bord.png`, `spion-bord.png` en `genezeres-bord.png` zijn borden op een donkere
achtergrond. `boards.py` vindt per paneel de frames en haalt het figuur los met **rembg** (`pip install "rembg[cpu]"`,
model u2net); vuur, magie en gloed worden er met een zwart-sleutel bij gehouden. Paneelcoördinaten staan in `units.py`.
Het vuur van de vuurpot (`fx-fire.jpg`) en de P-51 (`p51.png`) staan in `effects.py`; menu en logo in `screens.py`.

## Referentiebladen

`art/reference/` bevat per eenheid één overzichtsblad met alle animaties (naam, aantal frames, genummerd).
Gebruik dat als voorbeeld wanneer je een nieuwe beweging laat maken: zelfde figuur, zelfde formaat, kijkend naar rechts,
één rij per animatie. Deze bladen worden bij elke `build.py` opnieuw gemaakt.

## Tips voor nieuwe art

- Vraag om **één personage per vak, op een effen witte achtergrond, met ruimte tussen de frames**, kijkend naar rechts.
- Zelfde formaat en stijl als de bestaande sheets; vaste rijen: rust, lopen, aanvallen, geraakt, sterven.
- Na het bouwen: open de game met `?debug=1` en kijk of voeten op de baan staan en niets verspringt.
