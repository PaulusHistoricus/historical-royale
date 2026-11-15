-- Migration 002: profile, XP, card collection and friends on top of an existing schema (safe to run twice).
-- If the base schema is missing or incomplete, import ../schema.sql instead.
SET @lr_players_ready = (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.TABLES AS t
    JOIN information_schema.COLUMNS AS c
      ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
    JOIN information_schema.STATISTICS AS i
      ON i.TABLE_SCHEMA = t.TABLE_SCHEMA AND i.TABLE_NAME = t.TABLE_NAME
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'players' AND t.ENGINE = 'InnoDB'
      AND c.COLUMN_NAME = 'id' AND c.DATA_TYPE = 'bigint' AND c.COLUMN_TYPE LIKE '%unsigned%'
      AND i.INDEX_NAME = 'PRIMARY' AND i.SEQ_IN_INDEX = 1 AND i.COLUMN_NAME = 'id'
  )
);
EXECUTE IMMEDIATE IF(@lr_players_ready, 'DO 0',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''002 requires InnoDB players.id BIGINT UNSIGNED primary key. Import database/schema.sql first if missing.''');

SET SESSION foreign_key_checks = 1;

-- === 002: profile, progression, card collection and friends ===
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(16) NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS friend_code CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS name_changed_at DATETIME NULL;
ALTER TABLE players ADD UNIQUE INDEX IF NOT EXISTS uq_friend_code (friend_code);
ALTER TABLE player_progress
  ADD COLUMN IF NOT EXISTS matches_played INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS towers_destroyed INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_deployed INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player_id BIGINT UNSIGNED NULL;
ALTER TABLE matches ADD INDEX IF NOT EXISTS idx_match_player (player_id, finished_at);

CREATE TABLE IF NOT EXISTS player_cards (
  player_id BIGINT UNSIGNED NOT NULL,
  card_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  fragments INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, card_type),
  CONSTRAINT fk_card_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_change_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  new_email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_change_player (player_id),
  CONSTRAINT fk_email_change_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per pair: player_low < player_high. status: pending (requested_by waits) or accepted.
CREATE TABLE IF NOT EXISTS friendships (
  player_low BIGINT UNSIGNED NOT NULL,
  player_high BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  status VARCHAR(10) CHARACTER SET ascii NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME NULL,
  PRIMARY KEY (player_low, player_high),
  INDEX idx_friend_high (player_high),
  CONSTRAINT fk_friend_low FOREIGN KEY (player_low) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_high FOREIGN KEY (player_high) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT chk_friend_order CHECK (player_low < player_high)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
