<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_friends.php';
// accept: true = accepteren, false = weigeren. remove: true = vriendschap of verzoek verwijderen.
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $pdo = db();
    $other = playerByPublicId($pdo, $data['id'] ?? null);
    if ($other === null) jsonResponse(['error' => 'Unknown player'], 404);
    [$lo, $hi] = pairOf($id, $other);
    if (!empty($data['accept'])) {
        $pdo->prepare('UPDATE friendships SET status="accepted", accepted_at=UTC_TIMESTAMP()
            WHERE player_low=? AND player_high=? AND status="pending" AND requested_by=?')->execute([$lo, $hi, $other]);
    } else {
        $pdo->prepare('DELETE FROM friendships WHERE player_low=? AND player_high=?')->execute([$lo, $hi]);
    }
    jsonResponse(['ok' => true] + friendsOverview($pdo, $id));
} catch (Throwable $e) { failSafe($e); }
