<?php
declare(strict_types=1);
require __DIR__ . '/_friends.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    $id = requirePlayer();
    sessionPlayer();   // houdt 'online' bij (heartbeat)
    jsonResponse(friendsOverview(db(), $id));
} catch (Throwable $e) { failSafe($e); }
