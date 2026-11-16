-- Legion Royale full account schema for MariaDB 11.4+. Select the database before running.
SET SESSION foreign_key_checks = 1;

CREATE TABLE IF NOT EXISTS players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  display_name VARCHAR(40) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_identities (
  google_sub VARCHAR(255) NOT NULL PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL UNIQUE,
  email VARCHAR(254) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_google_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_progress (
  player_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  level INT UNSIGNED NOT NULL DEFAULT 1,
  xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_progress_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  player_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  coins BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_wallet_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_achievements (
  player_id BIGINT UNSIGNED NOT NULL,
  achievement_key VARCHAR(90) NOT NULL,
  progress BIGINT UNSIGNED NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (player_id, achievement_key),
  CONSTRAINT fk_achievement_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Economy changes MUST be made by a trusted server inside DB transactions.
-- The browser must never be granted direct UPDATE permissions to these tables.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  amount BIGINT NOT NULL,
  reason VARCHAR(60) NOT NULL,
  reference_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_wallet_reference (player_id, reason, reference_id),
  CONSTRAINT fk_ledger_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_inventory (
  player_id BIGINT UNSIGNED NOT NULL,
  item_key VARCHAR(90) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, item_key),
  CONSTRAINT fk_inventory_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_decks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  card_keys JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_deck_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  INDEX idx_player_decks (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  server_match_id CHAR(36) NOT NULL UNIQUE,
  mode VARCHAR(20) NOT NULL,
  winner_player_id BIGINT UNSIGNED NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_winner_player FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_participants (
  match_id BIGINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NOT NULL,
  team VARCHAR(12) NOT NULL,
  PRIMARY KEY (match_id, player_id),
  CONSTRAINT fk_participant_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Email login and 15-minute password setup/reset tokens.
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
