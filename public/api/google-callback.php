<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';
function back(string $reason): never {
    header('Location: /?login_error=' . rawurlencode($reason), true, 303);
    exit;
}
try {
    startSession();
    $stored = $_SESSION['oauth'] ?? null;
    unset($_SESSION['oauth']);
    if (!is_array($stored) || time() - ($stored['created'] ?? 0) > 600) back('session_expired');
    if (isset($_GET['error'])) back('google_cancelled');
    $state = $_GET['state'] ?? '';
    $code = $_GET['code'] ?? '';
    if (!is_string($state) || !hash_equals($stored['state'], $state) ||
        !is_string($code) || strlen($code) < 10 || strlen($code) > 4096) back('invalid_state');

    $c = config();
    $redirect = $c['site_origin'] . '/api/google-callback.php';
    $tokens = googleRequest('https://oauth2.googleapis.com/token', [
        'code' => $code, 'client_id' => $c['google_client_id'],
        'client_secret' => $c['google_client_secret'],
        'redirect_uri' => $redirect, 'grant_type' => 'authorization_code',
        'code_verifier' => $stored['verifier'],
    ]);
    $idToken = $tokens['id_token'] ?? null;
    if (!is_string($idToken) || strlen($idToken) > 10000) back('invalid_token');
    // Google validates the signature/issuer of the ID token on its own trusted HTTPS endpoint.
    $claims = googleRequest('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken));
    $issuer = $claims['iss'] ?? '';
    if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true) ||
        !hash_equals($c['google_client_id'], (string)($claims['aud'] ?? '')) ||
        (int)($claims['exp'] ?? 0) < time() ||
        (string)($claims['nonce'] ?? '') !== $stored['nonce'] ||
        !isset($claims['sub']) || !is_string($claims['sub']) ||
        strlen($claims['sub']) > 255) back('invalid_identity');
    if (!in_array($claims['email_verified'] ?? false, [true, 'true', '1', 1], true)) back('email_unverified');

    $sub = $claims['sub'];
    $email = filter_var($claims['email'] ?? '', FILTER_VALIDATE_EMAIL) ?: null;
    $name = trim((string)($claims['name'] ?? 'Player'));
    $name = mb_substr($name !== '' ? $name : 'Player', 0, 40);
    $avatar = (string)($claims['picture'] ?? '');
    if (!str_starts_with($avatar, 'https://') || strlen($avatar) > 512) $avatar = null;
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT player_id FROM google_identities WHERE google_sub = ? FOR UPDATE');
        $q->execute([$sub]);
        $playerId = $q->fetchColumn();
        if ($playerId === false) {
            $publicId = sprintf('%s-%s-%s-%s-%s', bin2hex(random_bytes(4)), bin2hex(random_bytes(2)),
                '4' . substr(bin2hex(random_bytes(2)), 1), '8' . substr(bin2hex(random_bytes(2)), 1),
                bin2hex(random_bytes(6)));
            $q = $pdo->prepare('INSERT INTO players(public_id, display_name, avatar_url, last_login_at) VALUES (?, ?, ?, NOW())');
            $q->execute([$publicId, $name, $avatar]);
            $playerId = (int)$pdo->lastInsertId();
            $q = $pdo->prepare('INSERT INTO google_identities(google_sub, player_id, email) VALUES(?, ?, ?)');
            $q->execute([$sub, $playerId, $email]);
            $pdo->prepare('INSERT INTO player_progress(player_id) VALUES (?)')->execute([$playerId]);
            $pdo->prepare('INSERT INTO wallets(player_id) VALUES (?)')->execute([$playerId]);
        } else {
            $playerId = (int)$playerId;
            $pdo->prepare('UPDATE players SET last_login_at=NOW() WHERE id=?')->execute([$playerId]);
            $pdo->prepare('UPDATE google_identities SET email=? WHERE google_sub=?')->execute([$email, $sub]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        // Simultaneous first logins may race on the unique Google subject. Retry next login.
        throw $e;
    }
    session_regenerate_id(true);
    $_SESSION = ['player_id' => $playerId, 'csrf' => bin2hex(random_bytes(24))];
    header('Location: /?login=success', true, 303);
    exit;
} catch (Throwable $e) {
    error_log('[legionroyale-login] ' . $e->getMessage());
    back('service_unavailable');
}
