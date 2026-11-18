<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
// Sluit een gevecht af: XP, munten, kaartfragmenten en prestaties. Elk gevecht telt maar één keer.
const MIN_MATCH_SECONDS = 30;
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $matchId = $data['matchId'] ?? null;
    $result = $data['result'] ?? null;
    if (!is_string($matchId) || strlen($matchId) !== 36 || !in_array($result, ['win', 'loss'], true)) jsonResponse(['error' => 'Invalid result'], 400);
    $towers = max(0, min(2, (int)($data['towersDestroyed'] ?? 0)));
    $units = max(0, min(300, (int)($data['unitsDeployed'] ?? 0)));
    $win = $result === 'win';
    // Extra statistieken voor prestaties (begrensd; zelfde vertrouwensmodel als hierboven).
    $kills = max(0, min(200, (int)($data['kills'] ?? 0)));
    $killsByType = [];
    foreach ((array)($data['killsByType'] ?? []) as $t => $n) {
        if (in_array($t, CARD_TYPES, true)) $killsByType[$t] = max(0, min($kills, (int)$n));
    }
    $deployed = array_values(array_unique(array_filter((array)($data['deployedTypes'] ?? []),
        fn($t) => is_string($t) && in_array($t, CARD_TYPES, true))));
    $castle = $win && !empty($data['castleDestroyed']);
    $towersLost = max(0, min(2, (int)($data['towersLost'] ?? 2)));
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT id, TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()) AS age FROM matches
            WHERE server_match_id=? AND player_id=? AND finished_at IS NULL FOR UPDATE');
        $q->execute([$matchId, $id]);
        $m = $q->fetch();
        if (!$m) { $pdo->rollBack(); jsonResponse(['error' => 'This battle was already counted.'], 409); }
        if ((int)$m['age'] < MIN_MATCH_SECONDS || (int)$m['age'] > 3600) {
            $pdo->prepare('UPDATE matches SET finished_at=UTC_TIMESTAMP() WHERE id=?')->execute([$m['id']]);
            $pdo->commit();
            jsonResponse(['error' => 'Battle too short or too long to count.'], 400);
        }
        $pdo->prepare('UPDATE matches SET finished_at=UTC_TIMESTAMP(), winner_player_id=? WHERE id=?')->execute([$win ? $id : null, $m['id']]);

        $before = levelInfo((int)stats($pdo, $id)['xp']);
        $xp = matchXp($win, $towers);
        $pdo->prepare('UPDATE player_progress SET xp = xp + ?, matches_played = matches_played + 1,
            wins = wins + ?, losses = losses + ?, towers_destroyed = towers_destroyed + ?, units_deployed = units_deployed + ?,
            current_streak = IF(?, current_streak + 1, 0), best_streak = GREATEST(best_streak, IF(?, current_streak, 0))
            WHERE player_id=?')->execute([$xp, $win ? 1 : 0, $win ? 0 : 1, $towers, $units, $win ? 1 : 0, $win ? 1 : 0, $id]);
        $after = levelInfo((int)stats($pdo, $id)['xp']);
        $pdo->prepare('UPDATE player_progress SET level=? WHERE player_id=?')->execute([$after['level'], $id]);

        $coins = $win ? 40 + 10 * $towers : 10;
        if ($after['level'] > $before['level']) $coins += 100 * ($after['level'] - $before['level']);   // level-up bonus
        addCoins($pdo, $id, $coins, 'match', $matchId);
        $drops = $win ? rollDrops(3, 2, 5) : rollDrops(1, 1, 2);
        addFragments($pdo, $id, $drops);
        addCounter($pdo, $id, 'kills', $kills);
        foreach (['plague', 'assassin', 'flamegi', 'lancer'] as $t) addCounter($pdo, $id, 'kill_' . $t, $killsByType[$t] ?? 0);
        if ($castle) addCounter($pdo, $id, 'castles', 1);
        if ($win && $towersLost === 0) addCounter($pdo, $id, 'flawless', 1);
        if (count($deployed) >= DECK_SIZE) addCounter($pdo, $id, 'full_deck', 1);
        if ($win) foreach (['spartan', 'banner'] as $t) if (in_array($t, $deployed, true)) addCounter($pdo, $id, 'win_' . $t, 1);
        $new = updateAchievements($pdo, $id);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    jsonResponse(['ok' => true, 'xpGained' => $xp, 'coinsGained' => $coins, 'fragments' => $drops,
        'levelBefore' => $before['level'], 'level' => $after['level'], 'xpInLevel' => $after['xpInLevel'], 'xpForNext' => $after['xpForNext'],
        'achievements' => $new, 'player' => publicPlayer(sessionPlayer())]);
} catch (Throwable $e) { failSafe($e); }
