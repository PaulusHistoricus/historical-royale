<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
try {
    $data = readJsonRequest();
    $raw = $data['token'] ?? null;
    $password = $data['password'] ?? null;
    $confirm = $data['confirmPassword'] ?? null;
    if (!is_string($raw) || !preg_match('/^[a-f0-9]{64}$/D', $raw)) jsonResponse(['error'=>'This link is invalid or expired. Request a new one.'], 400);
    if (!passwordAcceptable($password) || !is_string($confirm) || !hash_equals($password, $confirm)) {
        jsonResponse(['error'=>'Passwords must match and contain 12–72 characters.'], 400);
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if (!takeRateLimit('token-use-ip', $ip, 20, 900)) jsonResponse(['error'=>'Please try again later.'], 429);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT email FROM email_login_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
        $q->execute([hash('sha256', $raw)]);
        $email = $q->fetchColumn();
        if (!is_string($email)) {
            $pdo->rollBack();
            jsonResponse(['error'=>'This link is invalid or expired. Request a new one.'], 400);
        }
        $q = $pdo->prepare('SELECT player_id FROM email_identities WHERE email=? FOR UPDATE');
        $q->execute([$email]);
        $player = $q->fetchColumn();
        if ($player === false) {
            // Legacy verified Google accounts can be upgraded to email/password.
            $q = $pdo->prepare('SELECT player_id FROM google_identities WHERE email=? LIMIT 1 FOR UPDATE');
            $q->execute([$email]);
            $existing = $q->fetchColumn();
            $player = $existing === false ? createPlayer($pdo, explode('@', $email)[0] ?: 'Player') : (int)$existing;
            $pdo->prepare('INSERT INTO email_identities(player_id,email,password_hash,email_verified_at,password_changed_at)
                           VALUES(?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')
                ->execute([$player,$email,password_hash($password,PASSWORD_DEFAULT)]);
        } else {
            $pdo->prepare('UPDATE email_identities SET password_hash=?,password_changed_at=UTC_TIMESTAMP() WHERE player_id=?')
                ->execute([password_hash($password,PASSWORD_DEFAULT),$player]);
        }
        $pdo->prepare('DELETE FROM email_login_tokens WHERE email=?')->execute([$email]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    loginPlayer((int)$player);
    jsonResponse(['ok'=>true,'player'=>publicPlayer(sessionPlayer()),'csrfToken'=>csrfToken()]);
} catch (Throwable $e) { failSafe($e); }
