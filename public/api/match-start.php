<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
// Start een gevecht tegen de computer. Alleen een gestart gevecht kan later beloning opleveren.
try {
    readJsonRequest();
    $id = requirePlayer();
    if (!takeRateLimit('match-start', (string)$id, 60, 3600)) jsonResponse(['error' => 'Too many battles started. Take a short break.'], 429);
    $pdo = db();
    $pdo->prepare('DELETE FROM matches WHERE player_id=? AND finished_at IS NULL')->execute([$id]);
    $h = bin2hex(random_bytes(16));
    $matchId = substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-8' . substr($h, 17, 3) . '-' . substr($h, 20, 12);
    $pdo->prepare('INSERT INTO matches(server_match_id, mode, player_id, started_at) VALUES(?, "ai", ?, UTC_TIMESTAMP())')->execute([$matchId, $id]);
    $pdo->prepare('INSERT INTO match_participants(match_id, player_id, team) VALUES(LAST_INSERT_ID(), ?, "blue")')->execute([$id]);
    jsonResponse(['matchId' => $matchId, 'cards' => playerCards($pdo, $id), 'deck' => playerDeck($pdo, $id)]);
} catch (Throwable $e) { failSafe($e); }
