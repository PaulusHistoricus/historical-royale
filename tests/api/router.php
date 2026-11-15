<?php
// Testrouter voor `php -S`: doet alsof het verzoek via HTTPS komt (zoals op Cloud86).
$_SERVER['HTTPS'] = 'on';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/api/([a-z0-9\-]+\.php)$#', $path, $m) && is_file(__DIR__ . '/../../public/api/' . $m[1])) {
    chdir(__DIR__ . '/../../public/api');
    require __DIR__ . '/../../public/api/' . $m[1];
    return true;
}
return false;   // statische bestanden (dist/) door de ingebouwde server
