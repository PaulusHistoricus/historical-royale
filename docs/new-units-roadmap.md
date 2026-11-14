# Vier nieuwe eenheden — gameplayfase

Nieuwe kaarten zijn vrij combineerbaar met de oorspronkelijke drie. Er zijn geen aparte historische legers.

| Kaart | Kosten | Gedrag |
| --- | ---: | --- |
| Romeinse ruiter | 4 | Snelle melee; eerste slag na minimaal 65 wereldpixels lopen krijgt +39 charge-schade |
| Viking berserker | 4 | Snelle melee; onder of op 50% HP krijgt iedere slag ×1,6 schade |
| Mongoolse ruiterboogschutter | 5 | Snelle ranged eenheid met 125 bereik en korte schietpauze |
| Musketier | 4 | 150 bereik, veel schade per schot, maar 2,8 sec herladen |

**Fase 1 (deze PR):** gevechtsregels, AI-keuzes, inzetbaar via tijdelijke compacte selectors, simpele silhouettes.
**Fase 2 (v0.9, klaar):** geschilderde sprites/animaties voor de vier eenheden in `src/art/units.json`.
**Fase 3 (v0.9, klaar):** geschilderde kaarten in de onderste balk (`src/art/cards.json`).

Spelmechanische waarden zijn eerste balansvoorstellen. Bestaande drie kaarten en damage-/targeting-regels blijven ongemoeid.
