<?php
declare(strict_types=1);
require_once __DIR__ . '/_game.php';
const ONLINE_SECONDS = 150;

function pairOf(int $a, int $b): array { return $a < $b ? [$a, $b] : [$b, $a]; }

function playerByPublicId(PDO $pdo, mixed $publicId): ?int {
    if (!is_string($publicId) || strlen($publicId) !== 36) return null;
    $q = $pdo->prepare('SELECT id FROM players WHERE public_id=?');
    $q->execute([$publicId]);
    $v = $q->fetchColumn();
    return $v === false ? null : (int)$v;
}

function friendsOverview(PDO $pdo, int $id): array {
    $q = $pdo->prepare('SELECT f.status, f.requested_by, p.id AS pid, p.public_id, p.display_name, p.avatar_key, p.avatar_url, pr.xp,
          (p.last_seen_at IS NOT NULL AND p.last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ' . ONLINE_SECONDS . ' SECOND)) AS online
        FROM friendships f
        JOIN players p ON p.id = IF(f.player_low = ?, f.player_high, f.player_low)
        JOIN player_progress pr ON pr.player_id = p.id
        WHERE f.player_low = ? OR f.player_high = ?
        ORDER BY online DESC, p.display_name');
    $q->execute([$id, $id, $id]);
    $out = ['friends' => [], 'incoming' => [], 'outgoing' => []];
    foreach ($q->fetchAll() as $r) {
        $item = ['id' => $r['public_id'], 'name' => $r['display_name'], 'avatarKey' => $r['avatar_key'],
            'avatar' => $r['avatar_url'], 'level' => levelInfo((int)$r['xp'])['level'], 'online' => (bool)$r['online']];
        if ($r['status'] === 'accepted') $out['friends'][] = $item;
        elseif ((int)$r['requested_by'] === $id) $out['outgoing'][] = $item;
        else $out['incoming'][] = $item;
    }
    $out['friendCode'] = friendCode($pdo, $id);
    return $out;
}
