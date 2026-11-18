<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

/** Cloud86 SMTP submission via STARTTLS, no dependencies and no PHP mail() fallback. */
function smtpSendLoginLink(string $to, string $url): void {
    smtpSend($to, 'Your Legion Royale sign-in link',
        "Open this secure link to set or reset your Legion Royale password:\r\n\r\n"
        . $url . "\r\n\r\n"
        . "This link expires in 15 minutes and can be used only once.\r\n"
        . "If you did not request this, you can ignore this message.\r\n");
}

/** Algemene tekstmail via SMTP. Met 'smtp_test_outbox' in de config (alleen tests) gaat de mail naar een bestand. */
function smtpSend(string $to, string $subject, string $body): void {
    $c = config();
    if (!empty($c['smtp_test_outbox'])) {
        file_put_contents($c['smtp_test_outbox'], json_encode(['to' => $to, 'subject' => $subject, 'body' => $body]) . "\n", FILE_APPEND | LOCK_EX);
        return;
    }
    foreach (['smtp_host','smtp_username','smtp_password','smtp_from_email'] as $k) {
        if (empty($c[$k]) || !is_string($c[$k])) throw new RuntimeException('SMTP setting missing: ' . $k);
    }
    $host = $c['smtp_host'];
    $port = (int)($c['smtp_port'] ?? 587);
    if ($port !== 587) throw new RuntimeException('Only verified STARTTLS SMTP port 587 supported');
    $from = $c['smtp_from_email'];
    if (!filter_var($from, FILTER_VALIDATE_EMAIL) || !filter_var($to, FILTER_VALIDATE_EMAIL) ||
        preg_match('/[\r\n]/', $host . $from . $to)) throw new RuntimeException('Invalid SMTP address');
    $ssl = stream_context_create(['ssl' => [
        'verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host,
        'allow_self_signed' => false, 'SNI_enabled' => true,
    ]]);
    $err = ''; $num = 0;
    $conn = @stream_socket_client('tcp://' . $host . ':' . $port, $num, $err, 10, STREAM_CLIENT_CONNECT, $ssl);
    if (!$conn) throw new RuntimeException('SMTP connection unavailable');
    stream_set_timeout($conn, 12);
    $read = static function() use ($conn): int {
        $last = null;
        for ($i = 0; $i < 40; $i++) {
            $line = fgets($conn, 2048);
            if (!is_string($line) || !preg_match('/^(\d{3})([- ])/', $line, $m))
                throw new RuntimeException('Invalid SMTP reply');
            $last = (int)$m[1];
            if ($m[2] === ' ') return $last;
        }
        throw new RuntimeException('SMTP reply too long');
    };
    $cmd = static function(string $command, array $expected) use ($conn, $read): void {
        if (fwrite($conn, $command . "\r\n") === false || !in_array($read(), $expected, true))
            throw new RuntimeException('SMTP command failed');
    };
    try {
        if ($read() !== 220) throw new RuntimeException('SMTP greeting failed');
        $cmd('EHLO legionroyale.paulushistoricus.nl', [250]);
        $cmd('STARTTLS', [220]);
        if (@stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) !== true)
            throw new RuntimeException('SMTP TLS negotiation failed');
        $cmd('EHLO legionroyale.paulushistoricus.nl', [250]);
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($c['smtp_username']), [334]);
        $cmd(base64_encode($c['smtp_password']), [235]);
        $cmd('MAIL FROM:<' . $from . '>', [250]);
        $cmd('RCPT TO:<' . $to . '>', [250, 251]);
        $cmd('DATA', [354]);
        $message = "From: Legion Royale <" . $from . ">\r\n"
            . "To: <" . $to . ">\r\n"
            . "Subject: " . preg_replace('/[\r\n]+/', ' ', $subject) . "\r\n"
            . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n"
            . "Auto-Submitted: auto-generated\r\n\r\n"
            . $body;
        // SMTP dot-stuffing; strip accidental CRLF inconsistencies.
        $message = str_replace(["\r\n", "\r"], "\n", $message);
        $message = str_replace("\n", "\r\n", $message);
        $message = preg_replace('/(?<=\r\n)\./', '..', $message);
        if (fwrite($conn, $message . "\r\n.\r\n") === false || $read() !== 250)
            throw new RuntimeException('SMTP message rejected');
        $cmd('QUIT', [221]);
    } finally {
        fclose($conn);
    }
}
