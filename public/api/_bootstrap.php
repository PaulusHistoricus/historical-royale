<?php
declare(strict_types=1);
// Shared Cloud86/Plesk authentication bootstrap; PHP >= 8.1, PDO_mysql, curl.
// This file is public code; secrets are loaded ONLY from a sibling private folder.
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

function config(): array {
    static $data = null;
    if ($data !== null) return $data;
    $path = dirname(__DIR__, 2) . '/private/legionroyale.php';
    if (!is_file($path)) throw new RuntimeException('Private server configuration is missing');
    $data = require $path;
    if (!is_array($data)) throw new RuntimeException('Invalid private server configuration');
    return $data;
}
function startSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
        throw new RuntimeException('HTTPS is required');
    }
    session_name('lr_session');
    // Ingelogd blijven: cookie en sessie 30 dagen, verlengd bij gebruik. Sessiebestanden staan in
    // private/sessions (buiten de webroot), zodat de opruiming van de hosting ze niet na 24 min weggooit.
    session_set_cookie_params([
        'lifetime' => SESSION_DAYS * 86400, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax',
    ]);
    $dir = dirname(__DIR__, 2) . '/private/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
    ini_set('session.gc_maxlifetime', (string)(SESSION_DAYS * 86400));
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();
}
const SESSION_DAYS = 30;
/** Sessiecookie opnieuw zetten zodat de 30 dagen telkens opnieuw ingaan. */
function refreshSessionCookie(): void {
    if (session_status() !== PHP_SESSION_ACTIVE || headers_sent()) return;
    $last = $_SESSION['cookie_refreshed'] ?? 0;
    if (time() - $last < 86400) return;
    $_SESSION['cookie_refreshed'] = time();
    setcookie(session_name(), session_id(), ['expires' => time() + SESSION_DAYS * 86400, 'path' => '/',
        'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $c['db_host'], (int)($c['db_port'] ?? 3306), $c['db_name']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
function jsonResponse(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function failSafe(Throwable $e): never {
    error_log('[legionroyale-auth] ' . $e->getMessage());
    jsonResponse(['error' => 'Service temporarily unavailable'], 503);
}
function requireOrigin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $site = config()['site_origin'];
    // POST endpoints accept same-origin requests only.
    if ($origin !== $site) jsonResponse(['error' => 'Invalid request origin'], 403);
}
function csrfToken(): string {
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}
function requireCsrf(): void {
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($header === '' || !hash_equals(csrfToken(), $header)) jsonResponse(['error' => 'Invalid CSRF token'], 403);
}
function googleRequest(string $url, array $post = []): array {
    $curl = curl_init($url);
    if ($curl === false) throw new RuntimeException('Cannot initialize HTTPS request');
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ];
    if ($post) {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = http_build_query($post, '', '&', PHP_QUERY_RFC3986);
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    if (!is_string($body) || $status !== 200) throw new RuntimeException('Google OAuth request failed (HTTP ' . $status . ')');
    $data = json_decode($body, true);
    if (!is_array($data)) throw new RuntimeException('Invalid OAuth JSON');
    return $data;
}
/** Verify Google's RS256 ID token locally with Google's rotating X.509 public keys. */
function verifyGoogleIdToken(string $jwt, string $clientId, string $expectedNonce): array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3 || strlen($jwt) > 10000) throw new RuntimeException('Malformed Google ID token');
    $decode = static function(string $part): string|false {
        return base64_decode(strtr($part, '-_', '+/'), true);
    };
    $header = json_decode($decode($parts[0]) ?: '', true);
    $claims = json_decode($decode($parts[1]) ?: '', true);
    $signature = $decode($parts[2]);
    if (!is_array($header) || !is_array($claims) || !is_string($signature) ||
        ($header['alg'] ?? '') !== 'RS256' || empty($header['kid']) ||
        !is_string($header['kid'])) throw new RuntimeException('Invalid Google token header');
    $certs = function_exists('apcu_fetch') ? apcu_fetch('legionroyale_google_certs_v1') : false;
    if (!is_array($certs) || !isset($certs[$header['kid']])) {
        $certs = googleRequest('https://www.googleapis.com/oauth2/v1/certs');
        if (function_exists('apcu_store')) apcu_store('legionroyale_google_certs_v1', $certs, 900);
    }
    $pem = $certs[$header['kid']] ?? null;
    if (!is_string($pem) || openssl_verify($parts[0] . '.' . $parts[1], $signature, $pem, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('Google token signature verification failed');
    }
    if (!in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true) ||
        !hash_equals($clientId, (string)($claims['aud'] ?? '')) ||
        (int)($claims['exp'] ?? 0) <= time() ||
        (int)($claims['iat'] ?? 0) > time() + 60 ||
        !hash_equals($expectedNonce, (string)($claims['nonce'] ?? '')) ||
        !isset($claims['sub']) || !is_string($claims['sub']) ||
        strlen($claims['sub']) > 255 || $claims['sub'] === '') {
        throw new RuntimeException('Google token claim verification failed');
    }
    return $claims;
}
function sessionPlayer(): ?array {
    $id = $_SESSION['player_id'] ?? null;
    if (!is_int($id) || $id < 1) return null;
    $statement = db()->prepare(
      'SELECT p.*, pr.level, pr.xp, pr.wins, pr.losses, w.coins
       FROM players p JOIN player_progress pr ON pr.player_id=p.id JOIN wallets w ON w.player_id=p.id
       WHERE p.id = ? LIMIT 1'
    );
    $statement->execute([$id]);
    $row = $statement->fetch() ?: null;
    if ($row) refreshSessionCookie();
    if ($row) {   // online-status voor vrienden; hooguit eens per minuut schrijven
        try { db()->prepare('UPDATE players SET last_seen_at=UTC_TIMESTAMP() WHERE id=? AND (last_seen_at IS NULL OR last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND))')->execute([$id]); }
        catch (Throwable $e) { /* kolom ontbreekt nog (migratie 002 niet gedraaid): niet fataal */ }
    }
    return $row;
}
function publicPlayer(array $p): array {
    // Niveau altijd uit XP afgeleid (zelfde formule als _game.php levelInfo).
    $xp = (int)$p['xp']; $level = 1; $rest = $xp;
    while ($level < 50 && $rest >= 100 + 50 * ($level - 1)) { $rest -= 100 + 50 * ($level - 1); $level++; }
    return [
        'id' => $p['public_id'], 'name' => $p['display_name'], 'avatar' => $p['avatar_url'],
        'avatarKey' => $p['avatar_key'] ?? null,
        'level' => $level, 'xp' => $xp, 'xpInLevel' => $rest, 'xpForNext' => $level >= 50 ? 0 : 100 + 50 * ($level - 1),
        'wins' => (int)$p['wins'], 'losses' => (int)$p['losses'], 'coins' => (int)$p['coins'],
    ];
}
