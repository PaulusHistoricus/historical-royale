<?php
// COPY to <subdomain-root>/private/legionroyale.php (outside httpdocs/public).
// Never commit real secrets. Google Cloud > OAuth client > Web application.
// Authorized redirect URI: https://legionroyale.paulushistoricus.nl/api/google-callback.php
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'YOUR_ACTUAL_PLESK_DATABASE_NAME',
    'db_user' => 'legionroyale_app',
    'db_password' => 'REPLACE_WITH_GENERATED_DB_PASSWORD',
    'google_client_id' => 'YOUR_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com',
    'google_client_secret' => 'REPLACE_WITH_GOOGLE_CLIENT_SECRET',
    'site_origin' => 'https://legionroyale.paulushistoricus.nl',
];
