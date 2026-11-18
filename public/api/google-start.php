<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';
try {
    startSession();
    $c = config();
    $state = bin2hex(random_bytes(24));
    $verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
    $nonce = bin2hex(random_bytes(24));
    $_SESSION['oauth'] = ['state' => $state, 'nonce' => $nonce, 'verifier' => $verifier, 'created' => time()];
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    $params = [
        'client_id' => $c['google_client_id'],
        'redirect_uri' => $c['site_origin'] . '/api/google-callback.php',
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'prompt' => 'select_account',
    ];
    header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), true, 302);
    exit;
} catch (Throwable $e) { failSafe($e); }
