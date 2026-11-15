#!/usr/bin/env bash
set -euo pipefail

# Arguments select the MariaDB client, including any connection options.
db() {
  "$@" --batch --skip-column-names
}

schema=database/schema.sql
migration=database/migrations/001_email_auth.sql
auth_ddl() {
  sed -n '/^CREATE TABLE IF NOT EXISTS email_identities (/,$p' "$1"
}

diff -u <(auth_ddl "$schema") <(auth_ddl "$migration")

assert_value() {
  local expected=$1 actual=$2
  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected %s, got %s\n' "$expected" "$actual" >&2
    return 1
  fi
}

assert_missing_parent() {
  local error
  if error=$(db "$@" < "$migration" 2>&1); then
    printf 'The migration accepted a missing or incompatible players table\n' >&2
    return 1
  fi
  [[ "$error" == *'001 requires InnoDB players.id BIGINT UNSIGNED primary key'* ]]
  assert_value 0 "$(db "$@" -e "SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('email_identities','email_login_tokens','auth_rate_limits')")"
}

assert_complete_schema() {
  assert_value 16 "$(db "$@" -e "SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='InnoDB'")"
  assert_value 15 "$(db "$@" -e "SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE()")"
  assert_value 1 "$(db "$@" -e "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='email_identities'
      AND COLUMN_NAME='player_id' AND REFERENCED_TABLE_SCHEMA=DATABASE()
      AND REFERENCED_TABLE_NAME='players' AND REFERENCED_COLUMN_NAME='id'")"
}

# These schemas must be new and disposable. The script does not drop any database or table.
db "$@" -e 'CREATE DATABASE lr_fresh; CREATE DATABASE lr_partial; CREATE DATABASE lr_signed'
assert_missing_parent "$@" lr_fresh
db "$@" lr_fresh < "$schema"
db "$@" lr_fresh < "$schema"
assert_complete_schema "$@" lr_fresh
if error=$(db "$@" lr_fresh -e "INSERT INTO email_identities
    (player_id,email,email_verified_at) VALUES (42,'orphan@example.invalid',NOW())" 2>&1); then
  printf 'A reference to a nonexistent player was accepted\n' >&2
  exit 1
fi
[[ "$error" == *'ERROR 1452'* ]]

# Simulate an interrupted email-first import, then an older base schema with an existing player.
sed -n '/^CREATE TABLE IF NOT EXISTS email_login_tokens (/,$p' "$migration" | db "$@" lr_partial
db "$@" lr_partial -e "INSERT INTO email_login_tokens (token_hash,email,expires_at)
    VALUES (REPEAT('a',64),'tester@example.invalid','2035-01-01')"
sed '/^-- Email login and /,$d' "$schema" | db "$@" lr_partial
db "$@" lr_partial -e "INSERT INTO players (id,public_id,display_name) VALUES
    (42,'12345678-1234-1234-1234-123456789abc','Existing player');
  INSERT INTO wallets (player_id,coins) VALUES (42,99)"
db "$@" lr_partial < "$migration"
db "$@" lr_partial -e "INSERT INTO email_identities (player_id,email,email_verified_at)
    VALUES (42,'tester@example.invalid',NOW())"
db "$@" lr_partial < "$migration"
db "$@" lr_partial < "$schema"
assert_complete_schema "$@" lr_partial
assert_value 1 "$(db "$@" lr_partial -e "SELECT COUNT(*) FROM players p
  JOIN wallets w ON w.player_id=p.id
  JOIN email_identities e ON e.player_id=p.id
  JOIN email_login_tokens t ON t.email=e.email
  WHERE p.id=42 AND p.display_name='Existing player' AND w.coins=99 AND t.token_hash=REPEAT('a',64)")"

db "$@" lr_signed -e 'CREATE TABLE players (id BIGINT NOT NULL PRIMARY KEY) ENGINE=InnoDB'
assert_missing_parent "$@" lr_signed

# Migration 002 on a database that only has the pre-002 schema, with existing data; twice.
migration2=database/migrations/002_profile_cards_friends.sql
diff -u <(sed -n '/^-- === 002/,/^-- Email login and /p' "$schema" | sed '$d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}') \
        <(sed -n '/^-- === 002/,$p' "$migration2" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
db "$@" -e 'CREATE DATABASE lr_upgrade'
sed '/^-- === 002/,/^-- Email login and /{/^-- Email login and /!d}' "$schema" | db "$@" lr_upgrade
db "$@" lr_upgrade -e "INSERT INTO players (id,public_id,display_name) VALUES (7,'12345678-1234-1234-1234-123456789abd','Old player');
  INSERT INTO player_progress (player_id,xp,wins) VALUES (7,250,3)"
db "$@" lr_upgrade < "$migration2"
db "$@" lr_upgrade < "$migration2"
assert_complete_schema "$@" lr_upgrade
assert_value 1 "$(db "$@" lr_upgrade -e "SELECT COUNT(*) FROM players p JOIN player_progress pr ON pr.player_id=p.id
  WHERE p.id=7 AND p.display_name='Old player' AND pr.xp=250 AND pr.wins=3 AND pr.matches_played=0 AND p.avatar_key IS NULL")"

db "$@" -e 'CREATE DATABASE lr_signed2'
db "$@" lr_signed2 -e 'CREATE TABLE players (id BIGINT NOT NULL PRIMARY KEY) ENGINE=InnoDB'
if db "$@" lr_signed2 < "$migration2" 2>/dev/null; then printf '002 accepted an incompatible players table\n' >&2; exit 1; fi

printf 'MariaDB install, migration, retry and foreign key checks passed.\n'
