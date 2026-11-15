-- Migration 001: email login and 15-minute password setup/reset tokens.
-- Import ONCE in phpMyAdmin after database/schema.sql if deployed already.
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
