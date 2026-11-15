# Werkafspraken voor AI-assistenten (ChatGPT, Claude, …)

Lees dit voordat je iets aan Historical Royale wijzigt.

## Indeling

| Pad | Wat | Regel |
| --- | --- | --- |
| `src/sim/config.js` | Balans: kaarten, gebouwen, afstanden, energie, AI-tempo | Vrij aan te passen; draai daarna `npm test` |
| `src/sim/battle.js` | Alle spelregels: lopen, doelwit kiezen, aanvallen, schade, AI, winnaar | Geen Phaser/DOM. Wijzig alleen samen met een test in `tests/` |
| `src/main.js` | Weergave en invoer (Phaser) | Leest `state`, tekent, en reageert op events. Bevat **geen** spelregels |
| `src/version.js`, `vite.config.js` | Versie/build op het scherm en updatecontrole | Versie alleen in `package.json` ophogen |
| `art/source/` | Ruwe AI-art (spritesheets, arena, schadestadia) | Origineel; niet bewerken, alleen toevoegen |
| `tools/art/` | Pijplijn die `art/source/` omzet naar game-assets | Draai `python3 tools/art/build.py` na elke art-wijziging |
| `public/assets/art/`, `src/art/*.json` | Gegenereerde textures en frame/animatie-manifesten | **Niet met de hand bewerken**: worden overschreven |
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

Scènes (v0.12): `Boot` laadt alle art (voortgang op het laadscherm in `index.html`) en maakt de animaties → `Menu` (losse elementen, alleen Spelen werkt) → `Battle`. `?play` slaat het menu over. Elk gevecht begint met 5 s aftelling (`COUNTDOWN`); de simulatie staat dan stil en kaarten spelen kan nog niet (`?debug=1&nowait` slaat over). Op touchscreens rechtop toont `index.html` 'Draai je toestel': het spel is altijd liggend.

Zo werkt de weergave nu:

- Elke eenheid krijgt een sprite (`this.views`). `unit.state === 'move'` → animatie `walk`, anders `idle`.
- Een `hit`-event speelt bij de aanvaller `attack` en bij het doelwit kort `hit` + rode flits. Een `death`-event speelt `death` en laat het lijk vervagen.
- Pijlen, kanonskogels en vonken zijn puur visueel (`this.projectiles`, `this.sparks`); de schade is al in de simulatie toegepast.
- Torens en kastelen tonen 5 schadestadia (frame 0–4) op basis van `hp / max`.
- Animatienamen per eenheid staan in `src/art/units.json` (`idle`, `walk`, `attack`, `hit`, `death`). Alle art kijkt naar rechts; `setFlipX` draait rood om.
- De kaartenbalk gebruikt `public/assets/art/cards.png`; het energiejuweel en de naam worden er in `drawHud` overheen getekend met de waarden uit `CARDS`.
- **Schermindeling (v0.10)**: één functie `layout()` in `src/main.js` regelt alles, bij start, resize en draaien. Het speelveld (0..310) is altijd volledig zichtbaar; de kaartenbalk (`cardbar.webp`) begint op `BAR_OVERLAP` en schaalt mee (liggend/desktop maximaal ±30 % van de hoogte, `BAR_MAX_LANDSCAPE`); in portret komt er een kopstrook boven het veld. Hardcode geen schermposities: zet nieuwe UI in `layout()` en gebruik `this.view` / `this.bar`.
- Het canvas is schermgrootte × devicePixelRatio (`stageSize()` onderaan `main.js`); alle coördinaten blijven wereldcoördinaten (960 breed). Gebruik `pointer.worldX/worldY`.
- Kaartkeuze: `this.selected` is een vak (0–3) of `null`. Na een geslaagde inzet wordt het `null` en schuift de nieuwe kaart het vak in. Toetsen 1–4 kiezen ook een kaart.
- De advertentie staat in `index.html` **onder** het spel, nooit eroverheen (AdSense-regels: geen advertenties waar per ongeluk op getikt wordt tijdens spelen).

Nieuwe art toevoegen: zie `art/README.md`. Kort: zet het bronbestand in `art/source/`, voeg de uitsnede toe in `tools/art/units.py` of `world.py`, draai `python3 tools/art/build.py`, en controleer in de browser.

De arena-art bepaalt de plek van banen, torens en kastelen (`LANES` en `STRUCTURE_POSITIONS` in `src/sim/config.js`). Houd het veld **spiegelsymmetrisch** (rood = 960 − blauw); een asymmetrie van 11 px gaf rood al 82 % winkans.

## Nieuw gedrag of nieuwe eenheid

1. Schrijf eerst een test in `tests/` die het gewenste gedrag beschrijft (zie `tests/combat.test.js` voor voorbeelden met `arena()`, `place()` en `run()`).
2. Pas `src/sim/` aan tot `npm test` groen is.
3. Pas daarna pas de weergave aan.

Een nieuwe kaart is één regel in `CARDS` (met `radius` en rand-tot-rand `range`). Houd `range` van elke kaart kleiner dan of gelijk aan die van gebouwen, anders faalt de balanstest.

## Controleren en debuggen

- `npm test` — alle gevechtstests, inclusief 25 volledige wedstrijden.
- Open de game met `?debug=1` voor een live overzicht per eenheid (positie, HP, state, doelwit, gap, cooldown). In de console staat dan `__HR__.state`.
- De kop in het spel toont `v<versie> (<commit>)`. Vergelijk de commit met GitHub om te zien welke build je speelt. Test nooit een fix vóórdat die commit in de kop staat: een deploy duurt ±1 minuut.


## Account/login (added after v0.12.1)

- `src/auth.js` + `src/auth.css`: Login overlay and profile display, English player-facing text. Imported by `src/main.js`; scene lifecycle emits `lr:menu` / `lr:battle`.
- `public/api/*.php`: PHP 8.1+ same-origin login backend, Google authorization code + PKCE + state + nonce, local JWT signature validation, secure HttpOnly sessions and MariaDB account initialization. These are copied into the Cloud86 Vite dist directory.
- `database/schema.sql`: MariaDB schema for players, linked Google identities, progress, wallets and future economy, achievements and matches.
- `private/legionroyale.example.php`: Placeholder configuration ONLY. Real `legionroyale.php` must live outside the public document root on Cloud86 and must NEVER be added to GitHub.
- `docs/auth-deployment.md`: OAuth and Plesk setup instructions.
- `npm test && npm run build` and PHP `php -l` must pass before merging.
- Authentication currently does **not** imply realtime multiplayer, and account-based gameplay progression is not yet wired to the simulation. Do not add client-authoritative rewards or match results.
- Guest play must remain usable if Google credentials are not yet set. Never put passwords, OAuth secrets, DB connection info, or privileged database operations into browser JavaScript.
