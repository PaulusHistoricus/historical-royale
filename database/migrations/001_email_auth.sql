-- Migration 001: add email login and password setup/reset to an existing base schema.
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
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''001 requires InnoDB players.id BIGINT UNSIGNED primary key. Import database/schema.sql first if missing.''');

SET SESSION foreign_key_checks = 1;

CREATE TABLE IF NOT EXISTS email_identities (
  player_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  password_hash VARCHAR(255) NULL,
  email_verified_at DATETIME NOT NULL,
  password_changed_at DATETIME NULL,
  UNIQUE KEY uq_verified_email (email),
  CONSTRAINT fk_email_identity_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_login_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at DATETIME NULL,
  INDEX idx_email_expiry (email, expires_at),
  INDEX idx_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_window_start (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
