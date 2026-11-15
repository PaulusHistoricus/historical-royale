<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_friends.php';
// Vriendverzoek op vriendcode. Heeft de ander jou al gevraagd, dan worden jullie meteen vrienden.
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    if (!takeRateLimit('friend-req', (string)$id, 30, 3600)) jsonResponse(['error' => 'Too many requests. Try again later.'], 429);
    $code = strtoupper(trim((string)($data['code'] ?? '')));
    if (!preg_match('/^[A-Z2-9]{8}$/', $code)) jsonResponse(['error' => 'A friend code has 8 letters and numbers.'], 400);
    $pdo = db();
    $q = $pdo->prepare('SELECT id FROM players WHERE friend_code=?');
    $q->execute([$code]);
    $other = $q->fetchColumn();
    if ($other === false) jsonResponse(['error' => 'No player with this friend code.'], 404);
    $other = (int)$other;
    if ($other === $id) jsonResponse(['error' => 'That is your own code.'], 400);
    [$lo, $hi] = pairOf($id, $other);
    $pdo->beginTransaction();
    $q = $pdo->prepare('SELECT status, requested_by FROM friendships WHERE player_low=? AND player_high=? FOR UPDATE');
    $q->execute([$lo, $hi]);
    $row = $q->fetch();
    if (!$row) {
        $pdo->prepare('INSERT INTO friendships(player_low, player_high, requested_by) VALUES(?,?,?)')->execute([$lo, $hi, $id]);
    } elseif ($row['status'] === 'pending' && (int)$row['requested_by'] !== $id) {
        $pdo->prepare('UPDATE friendships SET status="accepted", accepted_at=UTC_TIMESTAMP() WHERE player_low=? AND player_high=?')->execute([$lo, $hi]);
    }
    $pdo->commit();
    jsonResponse(['ok' => true] + friendsOverview($pdo, $id));
} catch (Throwable $e) { if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack(); failSafe($e); }
