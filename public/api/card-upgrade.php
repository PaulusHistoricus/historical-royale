<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $type = $data['card'] ?? null;
    if (!in_array($type, CARD_TYPES, true)) jsonResponse(['error' => 'Unknown card'], 400);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT IGNORE INTO player_cards(player_id, card_type) VALUES(?,?)')->execute([$id, $type]);
        $q = $pdo->prepare('SELECT level, fragments FROM player_cards WHERE player_id=? AND card_type=? FOR UPDATE');
        $q->execute([$id, $type]);
        $c = $q->fetch();
        $next = (int)$c['level'] + 1;
        if ($next > MAX_CARD_LEVEL) { $pdo->rollBack(); jsonResponse(['error' => 'This card is already at max level.'], 400); }
        [$frag, $cost] = UPGRADE_COST[$next];
        $q = $pdo->prepare('SELECT coins FROM wallets WHERE player_id=? FOR UPDATE');
        $q->execute([$id]);
        if ((int)$c['fragments'] < $frag || (int)$q->fetchColumn() < $cost) { $pdo->rollBack(); jsonResponse(['error' => 'Not enough fragments or coins.'], 400); }
        $pdo->prepare('UPDATE player_cards SET level=?, fragments=fragments-? WHERE player_id=? AND card_type=?')->execute([$next, $frag, $id, $type]);
        addCoins($pdo, $id, -$cost, 'upgrade', $type . ':' . $next);
        $new = updateAchievements($pdo, $id);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    jsonResponse(['ok' => true, 'cards' => playerCards($pdo, $id), 'achievements' => $new, 'player' => publicPlayer(sessionPlayer())]);
} catch (Throwable $e) { failSafe($e); }
