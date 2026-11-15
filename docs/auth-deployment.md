# Legion Royale: Cloud86 Google login and MariaDB setup

> Status: Code implemented, **NOT LIVE** until credentials, schema and deployment are configured.
> This creates real Google-linked accounts and stores profiles. It does **not** create a multiplayer server.

## Requirements

- Cloud86/Plesk with PHP 8.1+ and modules `pdo_mysql`, `curl`, `openssl`, PHP sessions
- MariaDB 11.4 (or compatible), InnoDB
- HTTPS for `https://legionroyale.paulushistoricus.nl`
- Google Cloud OAuth **Web application** client with a consent screen

## 1. Database

Plesk: Database name `LegionRoyale` (your actual Plesk name may be prefixed), related to
`legionroyale.paulushistoricus.nl`; create only one dedicated user (`legionroyale_app`) with
**local connections only** and access only to the game database.

Open the new database in phpMyAdmin; import `database/schema.sql` once. The schema provides
players, linked Google identities, progression, wallets, audit ledger, inventory, decks,
achievements, and match history. Gameplay, shop, achievements and matchmaking are **not
yet wired to these tables**. Only the new-account/profile creation is live after configuration.

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
`db_user`, `db_password`, `google_client_id`, and `google_client_secret`.
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
