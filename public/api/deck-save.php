<?php
declare(strict_types=1);
require __DIR__ . '/_email_auth.php';
require __DIR__ . '/_game.php';
try {
    $data = readJsonRequest();
    $id = requirePlayer();
    $deck = $data['deck'] ?? null;
    if (!validDeck($deck)) jsonResponse(['error' => 'A deck has exactly 8 different cards.'], 400);
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM player_decks WHERE player_id=?')->execute([$id]);
    $pdo->prepare('INSERT INTO player_decks(player_id, name, card_keys) VALUES(?, "Main", ?)')->execute([$id, json_encode($deck)]);
    $pdo->commit();
    jsonResponse(['ok' => true, 'deck' => $deck]);
} catch (Throwable $e) { failSafe($e); }
