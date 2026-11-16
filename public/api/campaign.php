<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
require __DIR__ . '/_campaign.php';
// GET:  campagnevoortgang van de ingelogde speler.
// POST: { import: { missieId: sterren } } — voortgang die als gast op dit toestel is gespeeld meenemen
//       naar het account. Sterren gaan alleen omhoog en een import levert nooit munten op.
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        startSession();
        $id = requirePlayer();
        jsonResponse(['progress' => (object)campaignProgress(db(), $id)]);
    }
    $data = readJsonRequest();
    $id = requirePlayer();
    $import = $data['import'] ?? null;
    if (!is_array($import)) jsonResponse(['error' => 'Invalid request'], 400);
    if (!takeRateLimit('campaign-import', (string)$id, 20, 3600)) jsonResponse(['error' => 'Too many requests. Try again later.'], 429);
    $pdo = db();
    $q = $pdo->prepare('INSERT INTO campaign_progress(player_id, mission_id, stars) VALUES(?,?,?)
        ON DUPLICATE KEY UPDATE stars = GREATEST(stars, VALUES(stars))');
    foreach ($import as $mission => $stars) {
        if (!isMission($mission) || !is_int($stars) || $stars < 1) continue;
        $q->execute([$id, $mission, min(3, $stars)]);
    }
    jsonResponse(['progress' => (object)campaignProgress($pdo, $id)]);
} catch (Throwable $e) { failSafe($e); }
