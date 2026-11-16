-- Migration 003: campaign progress (The Conquest) on the server, on top of 001 and 002 (safe to run twice).
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
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''003 requires InnoDB players.id BIGINT UNSIGNED primary key. Import database/schema.sql first if missing.''');

SET SESSION foreign_key_checks = 1;

-- === 003: The Conquest campaign progress ===
-- One row per player and mission that was won at least once; stars only ever go up.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mission_id VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL;

CREATE TABLE IF NOT EXISTS campaign_progress (
  player_id BIGINT UNSIGNED NOT NULL,
  mission_id VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stars TINYINT UNSIGNED NOT NULL,
  first_cleared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, mission_id),
  CONSTRAINT fk_campaign_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT chk_campaign_stars CHECK (stars BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
