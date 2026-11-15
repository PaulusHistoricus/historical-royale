<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
// Bevestigt een nieuw e-mailadres. Het token bewijst dat de speler die mailbox bezit.
try {
    $data = readJsonRequest();
    $raw = $data['token'] ?? null;
    $bad = ['error' => 'This link is invalid or expired. Request a new one from your profile.'];
    if (!is_string($raw) || !preg_match('/^[a-f0-9]{64}$/D', $raw)) jsonResponse($bad, 400);
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if (!takeRateLimit('change-token-ip', $ip, 20, 900)) jsonResponse(['error' => 'Please try again later.'], 429);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT player_id, new_email FROM email_change_tokens WHERE token_hash=? AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
        $q->execute([hash('sha256', $raw)]);
        $row = $q->fetch();
        if (!$row) { $pdo->rollBack(); jsonResponse($bad, 400); }
        $q = $pdo->prepare('SELECT player_id FROM email_identities WHERE email=? FOR UPDATE');
        $q->execute([$row['new_email']]);
        $owner = $q->fetchColumn();
        if ($owner !== false && (int)$owner !== (int)$row['player_id']) { $pdo->rollBack(); jsonResponse(['error' => 'This address is already in use.'], 409); }
        $pdo->prepare('INSERT INTO email_identities(player_id, email, email_verified_at) VALUES(?,?,UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE email=VALUES(email), email_verified_at=UTC_TIMESTAMP()')
            ->execute([(int)$row['player_id'], $row['new_email']]);
        $pdo->prepare('DELETE FROM email_change_tokens WHERE player_id=?')->execute([(int)$row['player_id']]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    jsonResponse(['ok' => true, 'email' => $row['new_email']]);
} catch (Throwable $e) { failSafe($e); }
