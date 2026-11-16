# Plan — The Conquest (campaign), Trophy Road, retention

Response to PR #33. Conversation Dutch, game text English.

## Where we stand (v0.17.0)

- One battle mode (vs AI), account level/XP, coins, card fragments, upgrades, decks, achievements, friends.
- Moving deploy zones already exist (`deployZone()`, v0.17.0): a fallen tower extends the attacker's
  zone by `DEPLOY_ADVANCE` (125) and shrinks the defender's zone by the same in that lane; zones never
  overlap (blue max 590 < red min 620). The PR's "half width" geometry is a variant; we can switch by
  changing one constant if preferred.
- No real PvP yet; Trophy Road needs it.

## Phase 1 — The Conquest, world "Rise of Rome" (first PR)

Data (`src/campaign/rome.js`), stable ids `rome_001 … rome_025`, `rome_bonus_01/02`:
```
{ id, n, title, segment, x, y, enemy: { deck: [...types], level, aiTempo }, rules: { energyStart,
  energyRate, timeLimit, goal: 'castle'|'towers'|'survive'|'protect' }, stars: [cond1, cond2, cond3],
  reward: { coins, fragments: {type: n} }, unlock: 'rome_004' }
```
- Difficulty: missions 1–5 teach one new card each; enemy level rises 1 → 6; 10/20 mini-boss; 25 boss.
- Mission types reuse the battle scene: destroy castle, take 2 towers, survive N s, enemy starts
  with 2 extra energy, enemy only cavalry, no healers allowed, etc. (all data, `createBattle({mission})`).
- Stars: 1 = win, 2 = win with ≥ 2 own towers standing, 3 = win within the time limit.
- New cards unlocked by campaign progress (gives a reason to continue): e.g. Spartan at mission 3,
  Plague Doctor 6, Banner Maiden 9, Lancer 12, Assassin 15, Flamethrower GI 18, P-51 boss reward.
- Server: table `campaign_progress(player_id, mission_id, stars, completed_at)` (migration 003);
  `mission-start.php` / `mission-finish.php` with the same single-use token and limits as
  `match-start/finish`. Rewards only once per mission (first clear) + per new star → no farming.
- Guests: progress in localStorage, no rewards.
- UI: mode selection → scrolling map (3 segments) → mission panel → existing battle → victory panel
  with stars → back to map with the next node unlocked.

## Phase 2 — daily return

- Daily reward chest (gift button, already in the menu): streak day 1–7, coins + fragments.
- 3 daily quests ("deploy 15 units", "win with a Spartan", "destroy 3 towers") from existing stats.
- Both server-side, using the date in Europe/Amsterdam.

## Phase 3 — Trophy Road + PvP

Only after friend challenge / PvP (lockstep, server replays the inputs). Until then the Trophy Road
button shows "Coming soon".

## QA checklist

Landscape phone, horizontal scroll/drag of the map, current mission centred, back button everywhere,
logged in vs guest, locked missions not startable, rewards once, deploy zones still correct.
