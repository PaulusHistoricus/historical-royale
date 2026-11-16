# Legion Royale: Google + email login and MariaDB deployment

> Status: Code implemented, **NOT LIVE** until credentials, schema and deployment are configured.
> This creates Google-linked and email/password accounts in the SAME players table. It does **not** create a multiplayer server.

## Requirements

- Cloud86/Plesk with PHP 8.1+ and modules `pdo_mysql`, `curl`, `openssl`, PHP sessions
- MariaDB 11.4 (or compatible), InnoDB
- HTTPS for `https://legionroyale.paulushistoricus.nl`
- Google Cloud OAuth **Web application** client with a consent screen

## 1. Database

Plesk: Database name `LegionRoyale` (your actual Plesk name may be prefixed), related to
`legionroyale.paulushistoricus.nl`; create only one dedicated user (`legionroyale_app`) with
**local connections only** and access only to the game database.

In **Mijn Cloud86**, open your hosting plan in Plesk. Go to **Databases → LegionRoyale →
phpMyAdmin**. Confirm the database name in the phpMyAdmin header. If the database
already contains data, export a SQL backup before importing.

| Database state | File to select under **Import** |
| --- | --- |
| Empty database | `database/schema.sql` |
| Interrupted import with missing base tables, including a failed attempt to import 001 before the base schema | `database/schema.sql` |
| Complete base schema from an older release, with email auth missing or only partially installed | `database/migrations/001_email_auth.sql`, then `002_profile_cards_friends.sql`, then `003_campaign_progress.sql` |
| Database from v0.15.x (email login works) | `database/migrations/002_profile_cards_friends.sql`, then `003_campaign_progress.sql` |
| Database from v0.16–v0.20 (profiles, cards and friends work) | `database/migrations/003_campaign_progress.sql` |

Leave **Enable foreign key checks** selected and run the import. The full schema
creates `players` first, then creates the tables that reference it, including the
three email-auth tables. A successful full import needs only that one file.
If an import of repository SQL stops partway through, retry the corresponding
file. Both files use `CREATE TABLE IF NOT EXISTS`, so compatible existing tables,
player profiles, credentials and balances are preserved.

If you see `#1005 / Errcode: 150`, check for `players` in **Structure**. If it is
missing, use the full schema. If it exists, run `SHOW CREATE TABLE players;` in
the **SQL** tab and check for InnoDB and an indexed primary key `id BIGINT UNSIGNED`.
An existing table with a different definition needs a migration tailored to that
definition. These imports only create missing tables.

After a full import (or 002), confirm 16 InnoDB tables and 15 foreign keys in the game
database:

```sql
SELECT DATABASE(), VERSION();
SELECT COUNT(*) AS innodb_tables
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB';
SELECT COUNT(*) AS foreign_keys
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE();
```

The schema provides players, Google and email identities, password setup/reset
tokens, rate limits, progression, wallets, achievements, inventory, decks and
match history. New-account creation needs the PHP configuration below. Email
login also needs working Cloud86 SMTP.

## 2. Google OAuth application

Visit https://console.cloud.google.com/apis/credentials and configure the Google Auth
Platform consent screen. Add a **Web application** OAuth client:

- Authorized JavaScript origin (if requested): `https://legionroyale.paulushistoricus.nl`
- Authorized redirect URI (exact): `https://legionroyale.paulushistoricus.nl/api/google-callback.php`
- Requested scopes: `openid email profile` (no Gmail/Drive permissions)
- While the app is in **Testing**, add your own Google account as a test user.
  Publishing externally may require additional consent screen information/review.

Copy the **client ID** and **client secret**, but **never** paste them into GitHub or chat.

## 3. Install on Cloud86

The Cloud86 GitHub Actions artifact contains the browser build and `public/api/*.php`.

Directory layout, when uploading **contents of** package `public/` into `httpdocs/`:

```
<Legion Royale subdomain home>/
├── httpdocs/
│   ├── index.html
│   ├── api/
│   │   ├── _bootstrap.php
│   │   ├── google-start.php
│   │   ├── google-callback.php
│   │   ├── me.php
│   │   ├── logout.php
│   │   └── delete-account.php
│   └── assets/
└── private/
    └── legionroyale.php        <-- REAL credentials; not in GitHub or in httpdocs!
```

Copy `private/legionroyale.example.php` to a new, separate
`<subdomain home>/private/legionroyale.php`. Fill `db_name` (exact Plesk database name),
`db_user`, `db_password`, `google_client_id`, and `google_client_secret`. Add the SMTP + rate-limit keys described below.
Leave `site_origin` exactly as `https://legionroyale.paulushistoricus.nl`.
Never publish this real config; set strict file permissions if Plesk offers them.

If Plesk uses the separate `public/` directory as its document root, place the private
folder next to that document root. `_bootstrap.php` resolves the private config from
**two directories above the api folder**.

IMPORTANT: PHP must be **executed by the server**, not served as text or downloaded;
check by visiting `/api/me.php` over HTTPS (should return JSON).

## 4. Smoke test

1. Before sign-in: `https://legionroyale.paulushistoricus.nl/api/me.php` returns JSON
   `{"authenticated":false,...}`.
2. Main menu: choose *Continue with Google*.
3. Google redirects to `/api/google-callback.php`; the game then returns to the menu.
4. `/api/me.php` now shows a server-managed player ID, level 1, XP 0 and coins 0.
5. Refresh the page; session remains active.
6. Sign out; `/api/me.php` becomes anonymous.
7. Test account deletion only with a test account, after verifying backup retention.

If sign-in fails, check PHP/Plesk error logs. The game does **not** log raw Google tokens
or passwords. Google ID token signatures are checked locally via OpenSSL against Google's
rotating public certificates, with issuer, audience, expiry, nonce and verified email checked.
Sessions use secure HttpOnly SameSite=Lax cookies; state + PKCE protect the OAuth redirect.

## 5. Architectural boundary

**Real-time multiplayer is not implemented by this PR.** The current Phaser simulation is
still client-side against AI. Before PvP, implement a server-authoritative WebSocket service
and issue a short-lived server-validated match ticket from the game backend.
Never trust client-submitted XP, currency, shop purchases or match results, and never
connect browsers directly to MariaDB. Cloud86 PHP/MariaDB hosting does not automatically
provide a long-running multiplayer process. Confirm hosting capabilities first.

Account deletion cascades application rows but does not automatically remove hosting backups.
Define a backup retention policy and privacy notice before a public launch.

## 6. Email/password login (no player table duplication)

The game now offers **Continue with email** alongside Google and guest play:

1. An unknown or existing email is entered. The browser sends a same-origin CSRF-protected POST
   to `/api/email-request-link.php`. The response is always generic; no account enumeration.
2. The Cloud86 SMTP account sends a **one-time link**, valid for 15 minutes.
   The random 256-bit token is stored only as `SHA-256(token)` in `email_login_tokens`.
   The link uses a URL **fragment** (`/#email_token=...`), so the secret is not sent in HTTP
   requests or web server logs. JavaScript removes the fragment from history immediately.
3. The player enters a new password **twice**, can reveal each field using the eye button,
   and submits the token plus the two fields to `/api/email-set-password.php`.
   Server validates matching values, 12–72 UTF-8 **bytes**, hashes via `password_hash`,
   consumes all outstanding reset links for that email, and signs the player in.
4. Subsequent visits use `/api/email-login.php` with email and password.
   **Forgot password?** sends another identical 15-minute link.

### Same account for Google and email

`email_identities` has a unique, verified email and a FK to `players.id`.
A Google sign-in with a Google-verified email looks up that email identity and
links the Google subject to its `player_id` instead of creating a second player.
A link clicked for an earlier Google-only user likewise attaches an email credential
to that same player. Consequently, XP, coins, decks and achievements belong to ONE player.

Existing Google users are supported: the callback migrates their verified Google
email to `email_identities` on next sign-in; password reset also checks the older
`google_identities` rows. **Complete the database import before deploying PHP.**

### Cloud86 SMTP config

Only store these secrets in **`private/legionroyale.php`** alongside the existing config
values; do not commit them. Add the following entries to the returned PHP array:

```php
'smtp_host' => 'YOUR_CLOUD86_SMTP_HOST',
'smtp_port' => 587,
'smtp_username' => 'YOUR_SMTP_MAILBOX_LOGIN',
'smtp_password' => 'YOUR_SMTP_MAILBOX_PASSWORD',
'smtp_from_email' => 'YOUR_VERIFIED_SENDER_ADDRESS',
'rate_limit_secret' => 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS',
```

The configured mailbox must exist and permit authenticated **STARTTLS on TCP/587**.
Use the SMTP hostname listed by Cloud86/Plesk, not an assumed value. The FROM address
must be allowed by that SMTP account. No PHP `mail()` fallback is used.

Generate the rate-limit secret securely and keep it unchanged across deployments.
Requests are limited by both IP and email without storing those in plain text
in the `auth_rate_limits` table. Rate limits are server-side and persistent.

### Post-deployment checks

- Confirm `GET /api/me.php` returns JSON and a usable anonymous CSRF token.
- Request a link for a fresh email; verify the generic confirmation text and delivered mail.
- Use the link to set a password; check that mismatch shows an error and two eye toggles work.
- Try the used link again; it must fail. Try a link after 15 minutes; it must fail.
- Log out, log back in by email/password, and verify the same player ID and wallet.
- Test *Forgot password?* and verify the previous password stops working.
- Test Google linking using the **same Google-verified address** and ensure no duplicate
  players are created. Test the reverse order (Google first, password second).
- Verify throttling (3 email link requests/15 min/email; 12/15 min/IP;
  8 password attempts/15 min/email; 35/15 min/IP).
- Check Cloud86 PHP logs for SMTP/TLS errors, but do not log tokens or secrets.
- Clean up expired tokens and old rate-limit rows periodically (DB maintenance).

### Compatibility / frontend styling ownership

This change only touches `src/auth.js`, `public/api/`, `database/` and `docs/`.
Existing IDs `auth-ui`, `lr-auth-dialog`, `lr-auth-google`, `lr-auth-guest`,
`lr-auth-error`, `lr-profile` etc. are unchanged. The new forms use
`lr-email-*` IDs. Claude can add CSS selectors in `src/auth.css` independently.

The CI workflow already runs PHP lint (`find public/api private ... php -l`);
run `npm test` and `npm run build` as well.
