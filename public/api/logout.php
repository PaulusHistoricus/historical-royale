<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
    startSession();
    requireOrigin();
    requireCsrf();
    $_SESSION = [];
    session_regenerate_id(true);
    jsonResponse(['ok' => true]);
} catch (Throwable $e) { failSafe($e); }
