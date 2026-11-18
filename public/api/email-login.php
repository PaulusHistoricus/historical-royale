<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
try {
    $data = readJsonRequest();
    $email = cleanEmail($data['email'] ?? null);
    $password = $data['password'] ?? null;
    $generic = ['error' => 'Invalid email or password'];
    if ($email === null || !is_string($password) || strlen($password) > 1024)
        jsonResponse($generic, 401);
    if (!limitPasswordLogin($email)) {
        // Do not reveal if this particular address exists.
        jsonResponse($generic, 401);
    }
    $q = db()->prepare('SELECT player_id, password_hash FROM email_identities WHERE email=? LIMIT 1');
    $q->execute([$email]);
    $account = $q->fetch();
    // Even unknown addresses execute password_verify to reduce timing differences.
    $dummy = '$2y$12$F1yQO/8Mw4VCfhKeME/yTuAgZBeTtx94jMZe8pFjnCYwd5cMhtf5u';
    $hash = is_array($account) && is_string($account['password_hash']) ? $account['password_hash'] : $dummy;
    if (!password_verify($password, $hash) ||
        !is_array($account) || !$account['password_hash']) jsonResponse($generic, 401);
    db()->prepare('UPDATE players SET last_login_at=UTC_TIMESTAMP() WHERE id=?')->execute([$account['player_id']]);
    loginPlayer((int)$account['player_id']);
    jsonResponse(['ok' => true, 'player' => publicPlayer(sessionPlayer()), 'csrfToken' => csrfToken()]);
} catch (Throwable $e) { failSafe($e); }
