<?php
declare(strict_types=1);
require __DIR__ . '/_game.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    $id = requirePlayer();
    updateAchievements(db(), $id);   // o.a. vrienden en nieuwe prestaties meteen bijwerken
    jsonResponse(fullProfile(db(), $id) + ['csrfToken' => csrfToken()]);
} catch (Throwable $e) { failSafe($e); }
