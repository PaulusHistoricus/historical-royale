<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_smtp.php';
try {
    $data = readJsonRequest();
    $email = cleanEmail($data['email'] ?? null);
    // The response must not reveal whether the address is registered or throttle-hit.
    $generic = ['ok' => true, 'message' => 'If the address is valid, check your inbox for a sign-in link.'];
    if ($email === null) jsonResponse($generic);
    if (!limitEmailRequest($email)) jsonResponse($generic);
    $raw = bin2hex(random_bytes(32));
    $hash = hash('sha256', $raw);
    $pdo = db();
    // Revoke prior links for this address; the recipient always gets the newest link.
    $pdo->prepare('DELETE FROM email_login_tokens WHERE email=?')->execute([$email]);
    $pdo->prepare('INSERT INTO email_login_tokens(token_hash,email,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))')
        ->execute([$hash,$email]);
    // Put token in URL fragment: it is not sent to the web server, Referer or HTTP logs.
    $url = rtrim(config()['site_origin'], '/') . '/#email_token=' . $raw;
    try {
        smtpSendLoginLink($email, $url);
    } catch (Throwable $mailError) {
        $pdo->prepare('DELETE FROM email_login_tokens WHERE token_hash=?')->execute([$hash]);
        throw $mailError;
    }
    jsonResponse($generic);
} catch (Throwable $e) { failSafe($e); }
