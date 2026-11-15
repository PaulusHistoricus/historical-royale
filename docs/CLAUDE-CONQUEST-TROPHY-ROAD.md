# CLAUDE HANDOFF — Legion Royale: Choose Your Mode / The Conquest / Trophy Road

**Status: design brief only. NOT an implementation. Do not merge or deploy without review.**
**Conversation with Paul: Dutch. ALL in-game copy: English.**

## The three visual references (original concept art)

These 3 exact PNGs were created for this work. The companion ZIP is named
`legion-royale-conquest-trophy-road-concepts.zip`. Upload/extract them into:

| File | Purpose | SHA-256 |
|---|---|---|
| `docs/concept-art/choose-your-mode.png` | Main selection screen with The Conquest + Trophy Road + locked Seasonal Ranked | `91473873b56aa87c1ca07162d8911f712f3a5e74de9d4a580d04383fae09194f` |
| `docs/concept-art/the-conquest.png` | Landscape Roman campaign world map with winding level route, hidden bonus branches and boss | `2069d6d6bf8d62371083bf58db43e98e80af7115d970243a3254b24520e3039b` |
| `docs/concept-art/trophy-road.png` | Landscape multiplayer trophy-road progression, milestones, rewards, arena unlocks and current player marker | `29139d620c2fed17c253d52328c92c0ccefdd3fe4a4fa6790ac7d9c38b58b715` |

**The PNGs are reference mockups, NOT final UI backgrounds.** Do not embed buttons,
labels, trophy amounts or live-player details from the screenshots as static art.
The repo's source art, login/menus and current gameplay remain authoritative.

## Assignment for Claude — FIRST write the implementation plan AND art requests for ChatGPT

1. Inspect the **actual current main branch** of `PaulusHistoricus/historical-royale`.
2. Review `AGENTS.md`, existing main menu, Phaser scene structure, authentication,
   card/deck interface, asset placement, responsive landscape logic and current tests.
3. Use the three concept PNGs as visual references.
4. Inspect `PaulusHistoricus/relicslide` (read only, if available) to learn its
   expandable era/world/level structure; **do not modify Relic Slide**.
5. Propose the smallest safe vertical-slice PR: **Choose Your Mode + one working
   Rise of Rome campaign map screen** with selectable mission and working
   transition to existing single-player battle. `Trophy Road` is a separate
   follow-up PR (UI can show disabled/unavailable state initially).
6. Before implementing, **WRITE A CONCRETE GRAPHICS WISHLIST FOR CHATGPT/PAUL**.
   Don't substitute generic generated placeholders if original art is missing.
   For each required asset give:
   - Exact file path and suggested filename;
   - Asset purpose/screen and rendering layer;
   - Required pixel dimensions/aspect ratio (landscape) and whether transparent;
   - A **ready-to-copy English prompt for image generation** that matches the
     existing Legion Royale painterly Roman gold/red/stone style;
   - State variants (idle, selected, locked, completed, disabled etc.) if needed;
   - Cropping/slicing/9-slice margins and layering guidance where applicable;
   - Priority (required for first playable PR / optional polish later);
   - Whether existing project assets can be reused instead.
7. Write your art requests in **`docs/art-requests/conquest-trophy-road.md`**
   on your own branch (or provide complete copyable text if you cannot write).
   Group requests by *Mode Selection*, *The Conquest*, *Trophy Road*, *Shared UI*.
   Make requests small and actionable: one single PNG or a precisely defined
   spritesheet per prompt. Avoid text baked into assets where it is dynamic.
8. Ask Paul/ChatGPT for missing graphics by asset file name, instead of blocking
   indefinitely or generating unrelated designs. Work on data/UI scaffolding
   independently where safe.

## UI A — Choose Your Mode

- Keep current `LEGION ROYALE` menu styling (gold, red velvet, laurels, Roman stone).
- Two primary illustrated mode cards:
  **THE CONQUEST** (*Single-Player Campaign*), **TROPHY ROAD**
  (*Multiplayer Progression*).
- A smaller locked **SEASONAL RANKED — COMING SOON** panel.
- Preserve functional navigation to player profile, achievements, inventory/decks,
  gift/news areas, Google/email auth and guest mode.
- Respect current scene transitions: no broken menu/back navigation.
- Dynamic text/UI overlays: no baked personalized info.

## UI B — The Conquest (expandable single-player)

- Landscape scrollable world/region map with winding mission route.
- World 1 **RISE OF ROME**, recommended **25 main missions + 2 bonus missions**.
  The concept art may depict fewer nodes for composition; **the data model must
  support all 25 + 2** and future worlds. Avoid squeezing 25 labels into one viewport;
  use horizontal scroll, paging or a coherent segmented map.
- Current/completed/locked missions; optional 0–3 star rating, boss mission #25,
  two branches for optional bonus missions.
- Mission details, enemy deck hints, goal/conditions, rewards and `START` button.
- Support gameplay configuration that reuses the existing battle scene and AI.
  Suggested missions: destroy castle; defend towers; survive duration; elite enemy;
  limited energy; win with special constraint.
- Data-driven configuration with **stable IDs** (`rome_001`, `rome_025`,
  `rome_bonus_01`). Worlds are individually addable without renumbering
  old missions or invalidating saved progress.
- Future examples: `SANDS OF EGYPT`, `THE VIKING AGE`,
  `WINGS OF WAR`, `THE SAMURAI EMPIRE`. No need to generate them now.
- Do NOT grant XP, currency, stars or unlocks directly from unverified browser
  results in production. Use preview/sample progress until server-side validation.
- Distinguish *player account level*, *campaign progress*, *trophies* and *ranked season*.

## UI C — Trophy Road (persistent PvP progression)

- Scrollable climbing road/arena ladder: **TROPHY ROAD**.
- Current trophy total, player-position marker, thresholds, claimed/unclaimed
  rewards, arena names/badges, chests/cards/coins and `BATTLE` action.
- Example arenas/thresholds are **illustrative, not authoritative balance**:
  Recruit 0, Legion 1,000, Centurion 2,000, Gladiator 4,000, Imperial 6,000.
- Future arena additions must not destroy historic achievements/progress.
- The current game is **not a complete authoritative realtime PvP backend**:
  do not claim matchmaking, genuine trophies, server-certified match results
  or PvP rewards exist. A static/data-driven **preview** is fine initially,
  but label unavailable interactions honestly.
- Keep seasonal competitive ranking separate from permanent Trophy Road.

## Shared design + technical requirements

- Phaser/Vite assets; match existing game graphic language and references.
- Landscape desktop/tablet/mobile responsive, safe areas, touch targets,
  horizontal scrolling/drag, high-DPI and restrained asset loading.
- Use separate **PNG layers** for clean maps, nodes, buttons, locked markers,
  arena plaques, cards, coins and UI panels; gold on red stone/velvet.
- Text, card portraits, player stats, currency amounts, mission IDs, trophy counts,
  rewards and click areas must be **data-driven** and rendered on top.
- Reuse graphics the user has approved rather than repainting current UI.
- Keep all user-facing UI copy in English.
- Use GitHub feature branches + PRs and run existing JS and PHP checks;
  protect working auth, MariaDB schema and live hosting configuration.
- No secret values, no direct production DB edits, no automatic deployment.

## Deliverables Claude must write back

1. Analysis of existing code and which reusable components exist.
2. A phased plan with concrete files/scene changes, UI state and navigation.
3. **A list of exact art requests for ChatGPT**, with independent English image
   prompts and implementation dimensions. This is a REQUIRED deliverable.
4. Proposed data contracts and a migration plan (if really necessary, not now).
5. First runnable PR only after the art gaps and scope are clear.
6. A concise QA checklist: landscape mobile, scroll, current mission, back,
   login state, guest preview and locked areas.

**Paul's preferred division of work: Claude writes exact art prompts;
ChatGPT makes graphics; Claude integrates them into code.**
