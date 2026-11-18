<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    requireOrigin();
    requireCsrf();
    $playerId = $_SESSION['player_id'] ?? null;
    if (!is_int($playerId) || $playerId < 1) jsonResponse(['error' => 'Not signed in'], 401);
    $pdo = db();
    try { $pdo->prepare('DELETE FROM matches WHERE player_id = ?')->execute([$playerId]); } catch (Throwable $e) {}
    $pdo->prepare('DELETE FROM players WHERE id = ?')->execute([$playerId]);
    // Linked auth, profile, progress, inventory, wallet and match-participant rows cascade.
    // IMPORTANT: external backups and audit logs require a separate retention policy.
    $_SESSION = [];
    session_regenerate_id(true);
    jsonResponse(['ok' => true]);
} catch (Throwable $e) { failSafe($e); }
