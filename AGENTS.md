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

Scènes (v0.12): `Boot` laadt alle art (voortgang op het laadscherm in `index.html`) en maakt de animaties → `Menu` (losse elementen, alleen Spelen werkt) → `Battle`. `?play` slaat het menu over. Elk gevecht begint met 5 s aftelling (`COUNTDOWN`); de simulatie staat dan stil en kaarten spelen kan nog niet (`?debug=1&nowait` slaat over). Pauzeknop linksboven (of Esc): hervatten, geluid aan/uit (`localStorage 'lr-sound'`, geldt voor alle Phaser-geluid), opnieuw, opgeven. Art-URL's krijgen `?v=<build>` (functie `art()`) zodat er nooit oude plaatjes uit de cache komen; gespiegelde sprites spiegelen ook hun ankerpunt. Op touchscreens rechtop toont `index.html` 'Draai je toestel': het spel is altijd liggend.

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

Geluid (v0.15): bronnen in `audio/source/`, bewerkt met `tools/audio/build.sh` (ffmpeg) naar `public/assets/audio/`. In `src/main.js` staan de groepen in `SFX` (bestanden, volume, minimale tussentijd zodat 10 zwaarden tegelijk geen lawaai worden) en `sfx(scene, groep)`; muziek via `playMusic()`. Geluid aan/uit = `game.sound.mute`. Nieuw geluid: bestand in `audio/source/`, regel in `build.sh`, groep in `SFX`.

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
- Authentication does **not** imply realtime multiplayer (that is phase 4, see below).

## Profile, progression, decks and friends (v0.16.0)

- Schema: `database/migrations/002_profile_cards_friends.sql` (same block also in `schema.sql`; `tests/database-schema.sh` checks they are identical). Adds avatar/friend code/last_seen to `players`, extra stats to `player_progress`, `player_cards`, `email_change_tokens`, `friendships`.
- Game rules live in TWO places that must match: `public/api/_game.php` (authoritative) and `src/progression.js` (display + sim). `tests/progression.test.js` checks they agree. `DECK_SIZE = 8` (4 in hand, 4 waiting), 12 card types, card levels 1–6 (+10% hp/damage per level via `leveledCard` in `src/sim/battle.js`), player level 1–50, 17 achievements, 20 avatars (`public/assets/avatars/a01..a20.webp`, built by `tools/art/avatars.py`).
- Endpoints: `profile.php`, `profile-update.php`, `email-change-request.php`/`-confirm.php`, `match-start.php`/`match-finish.php`, `card-upgrade.php`, `deck-save.php`, `friends.php`, `friend-request.php`, `friend-respond.php`. Integration tests: `tests/api/api.test.mjs` (needs MariaDB + PHP; runs in the Account database workflow).
- UI: `src/screens.js`/`screens.css` are DOM overlays. Events: `lr:open` (detail `profile|achievements|deck|friends`), `lr:session`, `lr:player`, `lr:friends`, `lr:result`, `lr:again`, `lr:to-menu`. `src/account.js` is the API client (`window.lrAccount`).
- **Trust model (deliberate, known limitation):** AI matches run in the browser, so their results are client-reported. Mitigations on the server: a single-use match token from `match-start.php`, minimum 30 s / maximum 1 h duration, rate limit, capped tower/unit counts, server-side XP/coins/drops. Rewards are small. Do not raise rewards or add tradeable value on top of this. Ranked PvP (phase 4) must NOT use this path: it must be server-verifiable (deterministic lockstep replay of the seed + inputs through `src/sim`).
- Result screen (v0.16.5): separate transparent parts `art/source/overwinning-{paneel,banner,lint,munten,kaart,knop-breed,knop-smal}.png` -> `result-*.webp` via `tools/art/victory.py` (trim + resize only; the game writes all text). Background `overwinning-achtergrond.png` -> `result-bg.webp`. Layout in `src/screens.css` uses `cqw` units of the panel width; card portraits use `cardPortrait()` (percent-based crop of `cards.png`). Fullscreen targets the whole page (`fullscreenTarget: document.documentElement`), otherwise DOM screens are invisible in fullscreen.
- Burning buildings (v0.16.1): `FIRES` in `src/main.js` lists fire/torch/smoke points per damage stage (frame pixels); `drawFires()` adds flicker, flames, embers and smoke; `collapseBurst()` + sound `tower-collapse` when a tower/castle falls. The healer card is shown as **Priestess** (internal type stays `healer`).
- Unit expansion 2 (v0.17.0): Spartan Guardian (`spartan`, tank 560 hp since v0.17.2, Shield Wall: −40 % ranged damage for bio allies behind him within 65, no stacking), Plague Doctor (`plague`, poison 8/s 4 s + no healing, spreads once to the nearest bio ally within 35, no chains), Banner Maiden (`banner`, Rally aura 95: +15 % speed, +10 % attack speed, no stacking, not herself), Flamethrower GI (`flamegi`, hits every enemy in front within range, burn, structures 30 %), Steppe Lancer (`lancer`, charge after 65: +20 and knockback 30, never through a building), Persian Assassin (`assassin`, prioritises `SUPPORT_TYPES` within 160, one Backstab +75 %). Auras/shield are recomputed every tick from living units (`unit.rallied`, `unit.shielded`). New events: `infect`, `knockback`; `death` carries `killerId/killerType` (assassin laugh), `hit` carries `backstab`. Sprites: `tools/art/sheetsplit.py` + `build(..., alt=...)` for separate team sheets. Tests: `tests/expansion2.test.js`.
- Deploy zones move (v0.17.0): `deployZone(state, side, lane)` — if the enemy tower in that lane is down, your zone extends `DEPLOY_ADVANCE` toward the enemy; if your own tower is down, your zone shrinks by the same. Renderer redraws when the tower count changes; the AI spawns inside its current zone.
- Card bar shows the card level ("Lv n"); riders share horse-death + gallop loop; Flamethrower GI has a looping flame sound.
- Lanes (v0.17.1): units from different lanes only fight/heal each other in a castle area — both behind the same side's tower line, and that side has lost the tower in one of their lanes (`canFight`). On the midfield lanes stay separate, even after towers fall.
- Phase 4 (not built): friend challenge + ranking via polling lockstep (like Relic Slide's class mode).
- Guest play must remain usable if Google credentials are not yet set. Never put passwords, OAuth secrets, DB connection info, or privileged database operations into browser JavaScript.

## Mode selection, The Conquest and Trophy Road preview (v0.18.0)

- Menu: the ▶ button opens **Choose Your Mode** (`lr:open` detail `modes`); the ⚔ button starts a quick battle as before.
- `src/conquest.js` + `src/conquest.css`: DOM screens (like `screens.js`) for mode selection, the campaign map with mission panel, and a Trophy Road **preview**. It dispatches `lr:start` with `{ mission }` (`null` = quick battle); `src/main.js` keeps that mission in `activeMission`, starts the battle and returns to the map afterwards (`reopenConquest`).
- `src/campaign/rome.js`: data only — world 1 "Rise of Rome", 25 missions + 2 bonus missions with **stable ids** (`rome_001` … `rome_025`, `rome_bonus_01/02`). Never renumber: saved progress uses the ids. A new world is a new file registered in `WORLDS` in `src/campaign/campaign.js`.
- `src/campaign/campaign.js`: pure rules (no DOM): unlock order, star conditions (`win`, `towers2`, `tower1`, `time:N`, `castle:N`), `missionRules()` -> `createBattle({ rules })`. Tested in `tests/campaign.test.js`.
- Simulation: `battleRules()` in `src/sim/battle.js` (`state.rules`): `timeLimit`, `goal` (`castle` | `towers` | `survive`), `energyStart`, `energyRate`, `aiDeck`, `aiTempo`. Without rules a battle is exactly the classic battle (a test checks this).
- Progress is stored on the device (`localStorage 'lr-conquest-v1'`, `{ missionId: stars }`). There is **no server-side campaign progress yet** and missions give no extra rewards: a signed-in player gets the normal battle reward through `match-start/finish`. Server storage (`campaign_progress`, migration 003) is the next step; do not add mission rewards before that exists.
- Trophy Road is a static preview: there is no PvP, no trophies and no matchmaking. Arena names/thresholds in `src/conquest.js` are examples. Keep the "not available yet" wording until real PvP exists.
- Art: `tools/art/conquest.py` (also run by `build.py`) turns `art/source/{modus-*,conquest-*,trophy-road-bg,arena-badges,trophy-icon,chest-icons}.png` into `public/assets/art/*.webp` and `src/art/conquest.json`. The three map segments are cross-faded into one strip (`MAP_OVERLAP`); mission positions in `rome.js` are source pixels of their segment. `daily-chest.png` is stored for the daily reward (not used yet).
- Difficulty was tuned with a random-playing level-1 player (win rate falls from ~100 % at mission 1 to ~10 % at the final boss); it still needs real playtesting. Change `level`/`tempo` per mission in `rome.js`.
