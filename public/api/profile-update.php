<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
// Naam en/of avatar wijzigen.
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $pdo = db();
    if (array_key_exists('avatarKey', $data)) {
        if (!in_array($data['avatarKey'], AVATAR_KEYS, true)) jsonResponse(['error' => 'Unknown avatar'], 400);
        $pdo->prepare('UPDATE players SET avatar_key=? WHERE id=?')->execute([$data['avatarKey'], $id]);
    }
    if (array_key_exists('name', $data)) {
        $name = is_string($data['name']) ? trim(preg_replace('/\s+/u', ' ', $data['name']) ?? '') : '';
        $len = function_exists('mb_strlen') ? mb_strlen($name) : strlen($name);
        if ($len < 3 || $len > 20 || !preg_match('/^[\p{L}\p{N} _.\-]+$/u', $name)) {
            jsonResponse(['error' => 'Use 3–20 letters, numbers, spaces, dots, dashes or underscores.'], 400);
        }
        $q = $pdo->prepare('SELECT name_changed_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) FROM players WHERE id=?');
        $q->execute([$id]);
        if ((int)$q->fetchColumn() === 1) jsonResponse(['error' => 'You can change your name again in a few minutes.'], 429);
        $pdo->prepare('UPDATE players SET display_name=?, name_changed_at=UTC_TIMESTAMP() WHERE id=?')->execute([$name, $id]);
    }
    jsonResponse(['ok' => true, 'player' => publicPlayer(sessionPlayer())]);
} catch (Throwable $e) { failSafe($e); }
