<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    $player = sessionPlayer();
    jsonResponse(['authenticated' => $player !== null,
      'player' => $player ? publicPlayer($player) : null,
      'csrfToken' => csrfToken()]);
} catch (Throwable $e) { failSafe($e); }
