<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
// Progressie, kaarten, beloningen en prestaties. De server beslist; de browser toont alleen.
// Houd CARD_TYPES en de formules gelijk aan src/progression.js (getest in tests/progression.test.js).

const CARD_TYPES = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket',
    'healer', 'samurai', 'spy', 'firethrower', 'p51'];
const DEFAULT_DECK = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket', 'healer'];
const DECK_SIZE = 8;
const MAX_LEVEL = 50;
const MAX_CARD_LEVEL = 6;
// Kosten om naar niveau N te gaan: [fragmenten, munten]
const UPGRADE_COST = [2 => [4, 50], 3 => [10, 150], 4 => [20, 400], 5 => [40, 1000], 6 => [80, 2500]];
const AVATAR_KEYS = ['a01','a02','a03','a04','a05','a06','a07','a08','a09','a10',
    'a11','a12','a13','a14','a15','a16','a17','a18','a19','a20'];

const ACHIEVEMENTS = [
    'first_win'   => ['First Victory', 'Win your first battle', 'wins', 1],
    'wins_10'     => ['Centurion', 'Win 10 battles', 'wins', 10],
    'wins_50'     => ['Legate', 'Win 50 battles', 'wins', 50],
    'wins_200'    => ['Imperator', 'Win 200 battles', 'wins', 200],
    'matches_10'  => ['Recruit', 'Fight 10 battles', 'matches_played', 10],
    'matches_100' => ['Veteran', 'Fight 100 battles', 'matches_played', 100],
    'towers_10'   => ['Tower Breaker', 'Destroy 10 enemy towers', 'towers_destroyed', 10],
    'towers_100'  => ['Siege Master', 'Destroy 100 enemy towers', 'towers_destroyed', 100],
    'units_250'   => ['Commander', 'Deploy 250 units', 'units_deployed', 250],
    'units_2000'  => ['Warlord', 'Deploy 2,000 units', 'units_deployed', 2000],
    'streak_3'    => ['On a Roll', 'Win 3 battles in a row', 'best_streak', 3],
    'streak_10'   => ['Unstoppable', 'Win 10 battles in a row', 'best_streak', 10],
    'level_5'     => ['Rising Star', 'Reach level 5', 'level', 5],
    'level_10'    => ['Tribune', 'Reach level 10', 'level', 10],
    'level_25'    => ['Consul', 'Reach level 25', 'level', 25],
    'card_3'      => ['Armourer', 'Upgrade a card to level 3', 'max_card_level', 3],
    'card_6'      => ['Master Smith', 'Upgrade a card to level 6', 'max_card_level', 6],
];

/** XP om van niveau $level naar $level+1 te gaan. */
function xpForNext(int $level): int { return 100 + 50 * ($level - 1); }

/** Niveau en voortgang uit totale XP. */
function levelInfo(int $xp): array {
    $level = 1; $rest = $xp;
    while ($level < MAX_LEVEL && $rest >= xpForNext($level)) { $rest -= xpForNext($level); $level++; }
    return ['level' => $level, 'xpInLevel' => $rest, 'xpForNext' => $level >= MAX_LEVEL ? 0 : xpForNext($level)];
}

function matchXp(bool $win, int $towers): int { return ($win ? 40 : 15) + ($win ? 10 : 5) * $towers; }

function friendCode(PDO $pdo, int $playerId): string {
    $q = $pdo->prepare('SELECT friend_code FROM players WHERE id=?');
    $q->execute([$playerId]);
    $code = $q->fetchColumn();
    if (is_string($code) && $code !== '') return $code;
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // zonder 0/O/1/I
    for ($try = 0; $try < 10; $try++) {
        $code = '';
        for ($i = 0; $i < 8; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        try {
            $u = $pdo->prepare('UPDATE players SET friend_code=? WHERE id=? AND friend_code IS NULL');
            $u->execute([$code, $playerId]);
            if ($u->rowCount() === 1) return $code;
            return friendCode($pdo, $playerId);
        } catch (PDOException $e) { if ($e->getCode() !== '23000') throw $e; }
    }
    throw new RuntimeException('Could not assign friend code');
}

/** Kaarten van de speler; ontbrekende kaarten bestaan op niveau 1 met 0 fragmenten. */
function playerCards(PDO $pdo, int $playerId): array {
    $cards = [];
    foreach (CARD_TYPES as $t) $cards[$t] = ['level' => 1, 'fragments' => 0];
    $q = $pdo->prepare('SELECT card_type, level, fragments FROM player_cards WHERE player_id=?');
    $q->execute([$playerId]);
    foreach ($q->fetchAll() as $r) {
        if (isset($cards[$r['card_type']])) $cards[$r['card_type']] = ['level' => (int)$r['level'], 'fragments' => (int)$r['fragments']];
    }
    return $cards;
}

function playerDeck(PDO $pdo, int $playerId): array {
    $q = $pdo->prepare('SELECT card_keys FROM player_decks WHERE player_id=? ORDER BY id LIMIT 1');
    $q->execute([$playerId]);
    $deck = json_decode((string)$q->fetchColumn(), true);
    return validDeck($deck) ? $deck : DEFAULT_DECK;
}

function validDeck(mixed $deck): bool {
    return is_array($deck) && array_is_list($deck) && count($deck) === DECK_SIZE &&
        count(array_unique($deck)) === DECK_SIZE && !array_diff($deck, CARD_TYPES);
}

function stats(PDO $pdo, int $playerId): array {
    $q = $pdo->prepare('SELECT xp, level, wins, losses, matches_played, towers_destroyed, units_deployed,
        current_streak, best_streak FROM player_progress WHERE player_id=?');
    $q->execute([$playerId]);
    $s = array_map('intval', $q->fetch() ?: []);
    $q = $pdo->prepare('SELECT COALESCE(MAX(level),1) FROM player_cards WHERE player_id=?');
    $q->execute([$playerId]);
    $s['max_card_level'] = (int)$q->fetchColumn();
    return $s;
}

/** Werkt prestaties bij; geeft de nieuw behaalde terug. */
function updateAchievements(PDO $pdo, int $playerId): array {
    $s = stats($pdo, $playerId);
    $q = $pdo->prepare('SELECT achievement_key FROM player_achievements WHERE player_id=? AND unlocked_at IS NOT NULL');
    $q->execute([$playerId]);
    $have = array_flip($q->fetchAll(PDO::FETCH_COLUMN));
    $new = [];
    $up = $pdo->prepare('INSERT INTO player_achievements(player_id, achievement_key, progress, unlocked_at)
        VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE progress=VALUES(progress), unlocked_at=COALESCE(unlocked_at, VALUES(unlocked_at))');
    foreach (ACHIEVEMENTS as $key => [$title, $desc, $stat, $target]) {
        $value = min($target, (int)($s[$stat] ?? 0));
        $done = $value >= $target;
        $up->execute([$playerId, $key, $value, $done ? gmdate('Y-m-d H:i:s') : null]);
        if ($done && !isset($have[$key])) $new[] = ['key' => $key, 'title' => $title, 'description' => $desc];
    }
    return $new;
}

function achievementList(PDO $pdo, int $playerId): array {
    $q = $pdo->prepare('SELECT achievement_key, progress, unlocked_at FROM player_achievements WHERE player_id=?');
    $q->execute([$playerId]);
    $rows = [];
    foreach ($q->fetchAll() as $r) $rows[$r['achievement_key']] = $r;
    $out = [];
    foreach (ACHIEVEMENTS as $key => [$title, $desc, $stat, $target]) {
        $r = $rows[$key] ?? null;
        $out[] = ['key' => $key, 'title' => $title, 'description' => $desc, 'target' => $target,
            'progress' => (int)($r['progress'] ?? 0), 'unlocked' => !empty($r['unlocked_at'])];
    }
    return $out;
}

/** Willekeurige fragmenten-beloning. */
function rollDrops(int $count, int $min, int $max): array {
    $drops = [];
    for ($i = 0; $i < $count; $i++) {
        $type = CARD_TYPES[random_int(0, count(CARD_TYPES) - 1)];
        $drops[$type] = ($drops[$type] ?? 0) + random_int($min, $max);
    }
    return $drops;
}

function addFragments(PDO $pdo, int $playerId, array $drops): void {
    $q = $pdo->prepare('INSERT INTO player_cards(player_id, card_type, level, fragments) VALUES(?,?,1,?)
        ON DUPLICATE KEY UPDATE fragments = fragments + VALUES(fragments)');
    foreach ($drops as $type => $n) $q->execute([$playerId, $type, $n]);
}

function addCoins(PDO $pdo, int $playerId, int $amount, string $reason, string $ref): void {
    $pdo->prepare('INSERT INTO wallet_ledger(player_id, amount, reason, reference_id) VALUES(?,?,?,?)')
        ->execute([$playerId, $amount, $reason, $ref]);
    $pdo->prepare('UPDATE wallets SET coins = coins + ? WHERE player_id=?')->execute([$amount, $playerId]);
}

/** Volledig profiel voor de eigen speler. */
function fullProfile(PDO $pdo, int $playerId): array {
    $p = sessionPlayer();
    $q = $pdo->prepare('SELECT email FROM email_identities WHERE player_id=?');
    $q->execute([$playerId]);
    $email = $q->fetchColumn();
    if ($email === false) {
        $q = $pdo->prepare('SELECT email FROM google_identities WHERE player_id=?');
        $q->execute([$playerId]);
        $email = $q->fetchColumn();
    }
    $q = $pdo->prepare('SELECT COUNT(*) FROM google_identities WHERE player_id=?');
    $q->execute([$playerId]);
    return [
        'player' => publicPlayer($p),
        'stats' => stats($pdo, $playerId),
        'email' => is_string($email) ? $email : null,
        'google' => (int)$q->fetchColumn() > 0,
        'friendCode' => friendCode($pdo, $playerId),
        'achievements' => achievementList($pdo, $playerId),
        'cards' => playerCards($pdo, $playerId),
        'deck' => playerDeck($pdo, $playerId),
        'upgradeCost' => UPGRADE_COST,
        'maxCardLevel' => MAX_CARD_LEVEL,
    ];
}

function requirePlayer(): int {
    $id = $_SESSION['player_id'] ?? null;
    if (!is_int($id) || $id < 1) jsonResponse(['error' => 'Not signed in'], 401);
    return $id;
}
