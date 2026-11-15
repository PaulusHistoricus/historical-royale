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
    $path = dirname(__DIR__, 3) . '/private/legionroyale.php';
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
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();
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
function sessionPlayer(): ?array {
    $id = $_SESSION['player_id'] ?? null;
    if (!is_int($id) || $id < 1) return null;
    $statement = db()->prepare(
      'SELECT p.id, p.public_id, p.display_name, p.avatar_url, pr.level, pr.xp, pr.wins, pr.losses, w.coins
       FROM players p JOIN player_progress pr ON pr.player_id=p.id JOIN wallets w ON w.player_id=p.id
       WHERE p.id = ? LIMIT 1'
    );
    $statement->execute([$id]);
    return $statement->fetch() ?: null;
}
function publicPlayer(array $p): array {
    return [
        'id' => $p['public_id'], 'name' => $p['display_name'], 'avatar' => $p['avatar_url'],
        'level' => (int)$p['level'], 'xp' => (int)$p['xp'],
        'wins' => (int)$p['wins'], 'losses' => (int)$p['losses'], 'coins' => (int)$p['coins'],
    ];
}
