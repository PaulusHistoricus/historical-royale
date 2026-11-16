# Art requests — The Conquest, Trophy Road, mode selection

Division of work: Claude writes these prompts, ChatGPT makes the images, Claude integrates them.
All images: painterly Legion Royale style (gold, red velvet, laurels, Roman stone, warm light),
**landscape**, **no text baked in** unless stated, **PNG with real transparency** where marked
"transparent" (no white or checkerboard background, no drop shadow around the object).

Put finished files in `art/source/` with the filename given. Dimensions are minimums; larger is fine
if the aspect ratio matches.

Style line to add to every prompt:
> Painterly mobile strategy game art in the style of Legion Royale: warm cinematic lighting, rich gold
> and deep red velvet, carved Roman stone, laurel ornaments, crisp edges, no text, no watermark.

---

## A. Mode selection (priority: required for first playable PR)

| # | File | Size | Transparent | Purpose |
|---|---|---|---|---|
| A1 | `modus-conquest.png` | 900×1200 | yes | Big mode card "The Conquest" (card frame + illustration, name plate empty) |
| A2 | `modus-trophy-road.png` | 900×1200 | yes | Big mode card "Trophy Road" |
| A3 | `modus-ranked-locked.png` | 900×400 | yes | Small locked "Seasonal Ranked" panel (chains + padlock, plate empty) |

**A1 prompt**
> A tall ornate game mode card: gold frame with laurels and red velvet drapes, a Roman eagle on top.
> Inside: a Roman legion marching along a winding road toward a hilltop fortress at sunset, map scroll
> and quill in the foreground. An empty dark-red name plate at the bottom for text. Transparent
> background outside the card. [style line]

**A2 prompt**
> A tall ornate game mode card in the same frame style: gold, laurels, red velvet, Roman eagle on top.
> Inside: a grand stone stairway of arenas climbing upward into golden light, a gleaming trophy at the
> top, crossed swords and banners. Empty dark-red name plate at the bottom. Transparent background. [style line]

**A3 prompt**
> A wide stone plaque panel with gold trim, wrapped in heavy iron chains with a large padlock in the
> centre, slightly desaturated, empty plate in the middle for text. Transparent background. [style line]

## B. The Conquest — world 1 "Rise of Rome" (required for first playable PR)

The map scrolls horizontally. Deliver it in **3 seamless segments** so 25 missions fit without crowding.

| # | File | Size | Transparent | Purpose |
|---|---|---|---|---|
| B1 | `conquest-rome-1.png` | 2400×1080 | no | Map segment 1: Latium farmland, small villages, river |
| B2 | `conquest-rome-2.png` | 2400×1080 | no | Segment 2: hills, Roman roads, forts, forest |
| B3 | `conquest-rome-3.png` | 2400×1080 | no | Segment 3: mountains and Rome itself with a dark boss fortress |
| B4 | `conquest-nodes.png` | 6 icons, 256×256 each, one row (1536×256) | yes | Mission node states: locked, open, current (glowing), completed, boss, bonus |
| B5 | `conquest-stars.png` | 3 icons 128×128 (384×128) | yes | Star empty, star filled, star glow |
| B6 | `conquest-mission-panel.png` | 1200×800 | yes | Mission detail panel (empty), like the victory panel but parchment inside |

**B1–B3 prompt** (repeat per segment, change the description)
> A top-down three-quarter view fantasy campaign map segment of ancient Italy, painted like a board game
> map: <SEGMENT DESCRIPTION>. A pale dirt road path winds across the whole image from the left edge to
> the right edge, entering at mid height on the left and leaving at mid height on the right, so segments
> join seamlessly. No icons, no labels, no characters, no UI. 2400×1080. [style line]

Segment descriptions: B1 "green farmland of Latium, small villages, a river with a stone bridge";
B2 "rolling hills, Roman military camps, an aqueduct, dark forest"; B3 "rocky mountains, then the city of
Rome with temples, and on the far right a dark fortress on a cliff for the final boss".

**B4 prompt**
> A row of six round mission marker icons for a campaign map, each a gold-rimmed stone medallion:
> 1 locked (grey stone, small padlock), 2 open (bronze laurel), 3 current (bright gold with soft glow),
> 4 completed (gold with a red wax seal), 5 boss (larger, red with a skull-and-helmet emblem),
> 6 bonus (purple gem medallion). No numbers. Equal spacing, transparent background. [style line]

**B5 prompt**
> Three game star icons in a row: an empty dark bronze star outline, a filled shiny gold star, and a gold
> star with a radiant glow. Transparent background. [style line]

**B6 prompt**
> An empty wide parchment panel framed in gold with laurels and small red velvet drapes at the top
> corners, Roman eagle on top centre. Inside plain parchment, no text. Transparent background. [style line]

## C. Trophy Road (later PR; only needed once real PvP exists)

| # | File | Size | Transparent | Purpose |
|---|---|---|---|---|
| C1 | `trophy-road-bg.png` | 1080×4000 (tall) | no | Vertical climbing road through 5 arenas |
| C2 | `arena-badges.png` | 5 badges 300×300 (1500×300) | yes | Recruit, Legion, Centurion, Gladiator, Imperial |
| C3 | `trophy-icon.png` | 256×256 | yes | Trophy currency icon |
| C4 | `chest-icons.png` | 3 chests 300×300 (900×300) | yes | Wooden, silver, gold reward chest (closed) |

**C1 prompt**
> A tall vertical painted path climbing upward through five stacked Roman arenas, from a muddy training
> camp at the bottom, past a legion fort, a centurion's stone arena, a gladiator colosseum, to a golden
> imperial palace arena in the clouds at the top. The road zigzags so markers can sit along it.
> No text, no UI. [style line]

**C2 prompt**
> Five round arena rank badges in a row, increasing in splendour: bronze helmet (Recruit), silver eagle
> standard (Legion), red-crested centurion helmet (Centurion), crossed gladius and shield (Gladiator),
> golden laurel crown (Imperial). Gold rims, transparent background, no text. [style line]

**C4 prompt**
> Three closed treasure chests in a row: plain wooden chest with iron bands, silver chest with blue gems,
> ornate gold chest with red velvet and a Roman eagle lock. Transparent background. [style line]

## D. Shared UI (optional polish)

| # | File | Size | Transparent | Purpose |
|---|---|---|---|---|
| D1 | `ui-back-button.png` | 256×256 | yes | Round gold "back" arrow button |
| D2 | `daily-chest.png` | 400×400 | yes | Daily reward chest for the gift button (open + closed: 800×400) |

**D2 prompt**
> Two versions side by side of a small Roman reward chest: closed, and open with golden light, coins and a
> glowing card fragment flying out. Transparent background. [style line]

---

## Reuse instead of new art

- Victory/defeat panel, buttons, ribbon: existing `overwinning-*` parts.
- Card portraits: `cards.png`. Coins: `result-coins`. Menu background, logo, icons: existing menu art.
- Battle itself: existing arena; mission rules only change data (enemy deck, energy, time, goal).
