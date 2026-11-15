<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

function cleanEmail(mixed $input): ?string {
    if (!is_string($input)) return null;
    $email = strtolower(trim($input));
    return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
}
function readJsonRequest(): array {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    requireOrigin();
    requireCsrf();
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) jsonResponse(['error' => 'Request too large'], 413);
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) jsonResponse(['error' => 'Invalid request'], 400);
    return $data;
}
/** Atomic, privacy-preserving fixed-window attempt limiter; never store plain email/IP. */
function takeRateLimit(string $type, string $identity, int $max, int $seconds): bool {
    $secret = (string)(config()['rate_limit_secret'] ?? '');
    if (strlen($secret) < 32) throw new RuntimeException('Missing rate-limit secret');
    $key = hash_hmac('sha256', $type . ':' . $identity, $secret);
    $pdo = db();
    // Order is significant: hits reads the previous window_start value.
    $q = $pdo->prepare(
        'INSERT INTO auth_rate_limits(rate_key, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           hits = IF(window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ' . (int)$seconds . ' SECOND), 1, hits + 1),
           window_start = IF(window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ' . (int)$seconds . ' SECOND),
                            UTC_TIMESTAMP(), window_start)'
    );
    $q->execute([$key]);
    $q = $pdo->prepare('SELECT hits FROM auth_rate_limits WHERE rate_key=?');
    $q->execute([$key]);
    return (int)$q->fetchColumn() <= $max;
}
function limitEmailRequest(string $email): bool {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipOk = takeRateLimit('send-ip', $ip, 12, 900);
    $emailOk = takeRateLimit('send-email', $email, 3, 900);
    return $ipOk && $emailOk;
}
function limitPasswordLogin(string $email): bool {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipOk = takeRateLimit('login-ip', $ip, 35, 900);
    $emailOk = takeRateLimit('login-email', $email, 8, 900);
    return $ipOk && $emailOk;
}
function createPlayer(PDO $pdo, string $name): int {
    $id = bin2hex(random_bytes(16));
    $uuid = substr($id, 0, 8) . '-' . substr($id, 8, 4) . '-4' . substr($id, 13, 3) . '-8' .
        substr($id, 17, 3) . '-' . substr($id, 20, 12);
    $pdo->prepare('INSERT INTO players(public_id,display_name,last_login_at) VALUES(?,?,UTC_TIMESTAMP())')
        ->execute([$uuid, mbCut($name, 40)]);
    $playerId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO player_progress(player_id) VALUES(?)')->execute([$playerId]);
    $pdo->prepare('INSERT INTO wallets(player_id) VALUES(?)')->execute([$playerId]);
    return $playerId;
}
function mbCut(string $value, int $length): string {
    return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
}
function loginPlayer(int $playerId): void {
    session_regenerate_id(true);
    $_SESSION = ['player_id' => $playerId, 'csrf' => bin2hex(random_bytes(24))];
}
function passwordAcceptable(mixed $pwd): bool {
    return is_string($pwd) && strlen($pwd) >= 12 && strlen($pwd) <= 72 &&
        !str_contains($pwd, "\0");
}
