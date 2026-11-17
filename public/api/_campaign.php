<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
// The Conquest op de server: welke missies bestaan, in welke volgorde ze vrijkomen en de sterren per speler.
// Houd dit gelijk aan src/campaign/rome.js en knights.js (getest in tests/campaign.test.js). Id's nooit hernummeren.

const CAMPAIGN_MAIN = ['rome_001', 'rome_002', 'rome_003', 'rome_004', 'rome_005', 'rome_006', 'rome_007', 'rome_008', 'rome_009', 'rome_010', 'rome_011', 'rome_012', 'rome_013', 'rome_014', 'rome_015', 'rome_016', 'rome_017', 'rome_018', 'rome_019', 'rome_020', 'rome_021', 'rome_022', 'rome_023', 'rome_024', 'rome_025',
    'knights_001', 'knights_002', 'knights_003', 'knights_004', 'knights_005', 'knights_006', 'knights_007', 'knights_008', 'knights_009', 'knights_010', 'knights_011', 'knights_012', 'knights_013', 'knights_014', 'knights_015', 'knights_016', 'knights_017', 'knights_018', 'knights_019', 'knights_020', 'knights_021', 'knights_022', 'knights_023', 'knights_024', 'knights_025'];
// bonusmissie => missie die eerst gehaald moet zijn
const CAMPAIGN_BONUS = ['rome_bonus_01' => 'rome_005', 'rome_bonus_02' => 'rome_015',
    'knights_bonus_01' => 'knights_005', 'knights_bonus_02' => 'knights_015'];
const MISSION_STAR_COINS = 10;   // per ster die je voor het eerst haalt (max. 3 per missie); geen farmen

function isMission(mixed $id): bool {
    return is_string($id) && (in_array($id, CAMPAIGN_MAIN, true) || array_key_exists($id, CAMPAIGN_BONUS));
}
/** Missie die eerst gehaald moet zijn, of null als de missie meteen open is. */
function campaignRequirement(string $id): ?string {
    if (array_key_exists($id, CAMPAIGN_BONUS)) return CAMPAIGN_BONUS[$id];
    $i = array_search($id, CAMPAIGN_MAIN, true);
    if ($i === false) throw new InvalidArgumentException('Unknown mission');
    return $i === 0 ? null : CAMPAIGN_MAIN[$i - 1];
}
/** [missieId => sterren 1..3] */
function campaignProgress(PDO $pdo, int $playerId): array {
    $q = $pdo->prepare('SELECT mission_id, stars FROM campaign_progress WHERE player_id=?');
    $q->execute([$playerId]);
    $out = [];
    foreach ($q->fetchAll() as $r) if (isMission($r['mission_id'])) $out[$r['mission_id']] = (int)$r['stars'];
    return $out;
}
function campaignUnlocked(array $progress, string $id): bool {
    $need = campaignRequirement($id);
    return $need === null || ($progress[$need] ?? 0) > 0;
}
/** Sterren vastleggen (alleen omhoog). Geeft [voor, na]. */
function recordStars(PDO $pdo, int $playerId, string $id, int $stars): array {
    $stars = max(1, min(3, $stars));
    $q = $pdo->prepare('SELECT stars FROM campaign_progress WHERE player_id=? AND mission_id=? FOR UPDATE');
    $q->execute([$playerId, $id]);
    $before = (int)($q->fetchColumn() ?: 0);
    $pdo->prepare('INSERT INTO campaign_progress(player_id, mission_id, stars) VALUES(?,?,?)
        ON DUPLICATE KEY UPDATE stars = GREATEST(stars, VALUES(stars))')->execute([$playerId, $id, $stars]);
    return [$before, max($before, $stars)];
}
