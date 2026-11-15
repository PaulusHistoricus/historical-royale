<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_smtp.php';
require __DIR__ . '/_game.php';
// Stuurt een bevestigingslink naar het NIEUWE adres. Pas na klikken wordt het adres gewijzigd.
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $generic = ['ok' => true, 'message' => 'If the address can be used, a confirmation link is on its way. Check your inbox.'];
    $email = cleanEmail($data['email'] ?? null);
    if ($email === null) jsonResponse(['error' => 'Enter a valid email address.'], 400);
    if (!takeRateLimit('change-player', (string)$id, 4, 3600) || !limitEmailRequest($email)) jsonResponse($generic);
    $pdo = db();
    $q = $pdo->prepare('SELECT player_id FROM email_identities WHERE email=?');
    $q->execute([$email]);
    $owner = $q->fetchColumn();
    if ($owner !== false) jsonResponse($generic);   // al in gebruik: niets verraden
    $raw = bin2hex(random_bytes(32));
    $hash = hash('sha256', $raw);
    $pdo->prepare('DELETE FROM email_change_tokens WHERE player_id=?')->execute([$id]);
    $pdo->prepare('INSERT INTO email_change_tokens(token_hash, player_id, new_email, expires_at)
        VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))')->execute([$hash, $id, $email]);
    $url = rtrim(config()['site_origin'], '/') . '/#email_change_token=' . $raw;
    try {
        smtpSend($email, 'Confirm your new Legion Royale email address',
            "Open this link to use this address for your Legion Royale account:\r\n\r\n" . $url . "\r\n\r\n"
            . "The link expires in 30 minutes. If you did not request this, ignore this message.\r\n");
    } catch (Throwable $mail) {
        $pdo->prepare('DELETE FROM email_change_tokens WHERE token_hash=?')->execute([$hash]);
        throw $mail;
    }
    jsonResponse($generic);
} catch (Throwable $e) { failSafe($e); }
