# Werkafspraken voor AI-assistenten (ChatGPT, Claude, …)

Lees dit voordat je iets aan Historical Royale wijzigt.

## Indeling

| Pad | Wat | Regel |
| --- | --- | --- |
| `src/sim/config.js` | Balans: kaarten, gebouwen, afstanden, energie, AI-tempo | Vrij aan te passen; draai daarna `npm test` |
| `src/sim/battle.js` | Alle spelregels: lopen, doelwit kiezen, aanvallen, schade, AI, winnaar | Geen Phaser/DOM. Wijzig alleen samen met een test in `tests/` |
| `src/main.js` | Weergave en invoer (Phaser) | Leest `state`, tekent, en reageert op events. Bevat **geen** spelregels |
| `src/version.js`, `vite.config.js` | Versie/build op het scherm en updatecontrole | Versie alleen in `package.json` ophogen |
| `tests/` | Geautomatiseerde tests (`npm test`, Node test runner, geen extra packages) | Moet groen zijn; de deploy stopt anders |

## Gevechtsmodel in het kort

- Gevechten zijn 1D langs de baan (x). `y` is alleen decoratie.
- Bereik is **rand-tot-rand**: `gap(a, b) = |a.x − b.x| − a.radius − b.radius`. Aanvallen kan als `gap <= range`.
- Er is **geen** aparte botsings- of contactafstand. Een eenheid loopt tot precies op bereik en valt dan aan. Voeg nooit een tweede stopconditie toe (dat was de oorzaak van issue #1).
- Per tick: beslissen → bewegen → schade → opruimen. Schade wordt gelijktijdig toegepast.
- `unit.state` is `'move'` of `'attack'`. Invariant (bewaakt in `tests/helpers.js`): een eenheid in `'move'` verplaatst zich echt; een eenheid in `'attack'` slaat minstens één keer per `rate` seconden.
- Doelwit: (1) huidig doelwit zolang het binnen bereik is, (2) dichtstbijzijnde vijand binnen `DETECTION_RANGE` of áchter de eenheid, (3) toren van de baan, anders het kasteel.

## Graphics en animaties toevoegen

`step(state, dt)` geeft events terug. Haak daarop aan in `handleEvents` in `src/main.js`:

- `{type:'hit', kind:'melee'|'archer'|'cannon'|'tower'|'castle', attackerId, targetId, from, to, damage, side}`
- `{type:'death', id, side, x, y}`
- `{type:'destroyed', id, kind, side}`
- `{type:'end', winner}`

Voor sprites: gebruik `unit.state` (`move` = loopanimatie, `attack` = aanvalsanimatie), `unit.facing` (1 of −1) en het `hit`-event als moment van de klap. Bewaar visuele timers in `this.anim`, niet op de eenheid in `state`.

## Nieuw gedrag of nieuwe eenheid

1. Schrijf eerst een test in `tests/` die het gewenste gedrag beschrijft (zie `tests/combat.test.js` voor voorbeelden met `arena()`, `place()` en `run()`).
2. Pas `src/sim/` aan tot `npm test` groen is.
3. Pas daarna pas de weergave aan.

Een nieuwe kaart is één regel in `CARDS` (met `radius` en rand-tot-rand `range`). Houd `range` van elke kaart kleiner dan of gelijk aan die van gebouwen, anders faalt de balanstest.

## Controleren en debuggen

- `npm test` — alle gevechtstests, inclusief 25 volledige wedstrijden.
- Open de game met `?debug=1` voor een live overzicht per eenheid (positie, HP, state, doelwit, gap, cooldown). In de console staat dan `__HR__.state`.
- De kop in het spel toont `v<versie> (<commit>)`. Vergelijk de commit met GitHub om te zien welke build je speelt. Test nooit een fix vóórdat die commit in de kop staat: een deploy duurt ±1 minuut.
