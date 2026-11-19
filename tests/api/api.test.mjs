// Integratietests voor de PHP-API tegen een echte MariaDB.
// Lokaal:  LR_DB="mariadb -uroot -S /tmp/mdb/sock" LR_DB_DSN="127.0.0.1:3307:lr:lrpass" node --test tests/api/
// In CI:   zie .github/workflows/account-database.yml
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8790, ORIGIN = `http://127.0.0.1:${PORT}`;
const DB_CLI = process.env.LR_DB;                      // shell-commando voor de mariadb-client
const [host, port, user, pass] = (process.env.LR_DB_DSN ?? '').split(':');
const DB = 'lr_api_test';
const OUTBOX = '/tmp/lr-outbox.jsonl';
const CONFIG = join(ROOT, 'private', 'legionroyale.php');
const skip = !DB_CLI || !process.env.LR_DB_DSN ? 'LR_DB en LR_DB_DSN niet gezet' : false;

const sql = q => execSync(`${DB_CLI} --batch --skip-column-names ${DB}`, { input: q }).toString().trim();
let server, configBackup = null;

test.before(async () => {
  if (skip) return;
  execSync(`${DB_CLI} -e "DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB}"`);
  execSync(`${DB_CLI} ${DB}`, { input: readFileSync(join(ROOT, 'database', 'schema.sql')) });
  if (existsSync(CONFIG)) configBackup = readFileSync(CONFIG);
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, `<?php return ['db_host'=>'${host}','db_port'=>${port},'db_name'=>'${DB}','db_user'=>'${user}','db_password'=>'${pass}',
    'google_client_id'=>'x','google_client_secret'=>'x','site_origin'=>'${ORIGIN}',
    'rate_limit_secret'=>'test-secret-test-secret-test-secret-1234','smtp_test_outbox'=>'${OUTBOX}'];`);
  rmSync(OUTBOX, { force: true });
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, join(ROOT, 'tests', 'api', 'router.php')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(ORIGIN + '/api/me.php'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
});
test.after(() => {
  server?.kill();
  if (skip) return;
  if (configBackup) writeFileSync(CONFIG, configBackup); else rmSync(CONFIG, { force: true });
});

/** Een browser met eigen sessiecookie. */
function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body) => {
    const res = await fetch(ORIGIN + '/api/' + path, { method, headers: { Cookie: cookie, Origin: ORIGIN,
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data };
  };
  return {
    get: p => call('GET', p), post: (p, b = {}) => call('POST', p, b),
    async login(email, password = 'correct horse battery') {
      await call('GET', 'me.php');
      const id = sql(`SELECT player_id FROM email_identities WHERE email='${email}'`);
      if (!id) {
        const hash = execSync(`php -r 'echo password_hash($argv[1], PASSWORD_DEFAULT);' '${password}'`).toString();
        sql(`INSERT INTO players(public_id, display_name) VALUES (UUID(), '${email.split('@')[0]}');
             SET @p = LAST_INSERT_ID();
             INSERT INTO player_progress(player_id) VALUES (@p); INSERT INTO wallets(player_id) VALUES (@p);
             INSERT INTO email_identities(player_id,email,password_hash,email_verified_at) VALUES (@p,'${email}','${hash}',NOW());`);
      }
      const r = await call('POST', 'email-login.php', { email, password });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data.player;
    },
  };
}
const matchAge = (seconds) => sql(`UPDATE matches SET started_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${seconds} SECOND) WHERE finished_at IS NULL`);

test('profiel: standaardwaarden, vriendcode, alle prestaties en kaarten', { skip }, async () => {
  const a = client(); await a.login('anna@example.test');
  const { status, data } = await a.get('profile.php');
  assert.equal(status, 200);
  assert.equal(data.player.level, 1);
  assert.match(data.friendCode, /^[A-Z2-9]{8}$/);
  assert.equal(data.achievements.length, 38);
  assert.equal(Object.keys(data.cards).length, 24);
  assert.equal(data.deck.length, 8);
  assert.equal(data.email, 'anna@example.test');
});

test('naam en avatar wijzigen met validatie', { skip }, async () => {
  const a = client(); await a.login('bram@example.test');
  assert.equal((await a.post('profile-update.php', { name: 'x' })).status, 400);
  assert.equal((await a.post('profile-update.php', { name: '<script>' })).status, 400);
  assert.equal((await a.post('profile-update.php', { avatarKey: 'a99' })).status, 400);
  const ok = await a.post('profile-update.php', { name: '  Bram   de   Grote ', avatarKey: 'a07' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.player.name, 'Bram de Grote');
  assert.equal(ok.data.player.avatarKey, 'a07');
  assert.equal((await a.post('profile-update.php', { name: 'Bram II' })).status, 429, 'niet direct opnieuw');
});

test('zonder inloggen geen profiel en geen beloningen', { skip }, async () => {
  const g = client(); await g.get('me.php');
  assert.equal((await g.get('profile.php')).status, 401);
  assert.equal((await g.post('match-start.php')).status, 401);
});

test('gevecht: XP, munten, fragmenten, prestaties, één keer tellen, te kort telt niet', { skip }, async () => {
  const a = client(); await a.login('cato@example.test');
  let m = (await a.post('match-start.php')).data;
  assert.equal((await a.post('match-finish.php', { matchId: m.matchId, result: 'win' })).status, 400, 'te kort');
  m = (await a.post('match-start.php')).data;
  matchAge(90);
  const r = await a.post('match-finish.php', { matchId: m.matchId, result: 'win', towersDestroyed: 2, unitsDeployed: 12 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.xpGained, 60);
  assert.equal(r.data.coinsGained, 60);
  assert.ok(Object.values(r.data.fragments).reduce((a, b) => a + b, 0) >= 6);
  assert.deepEqual(r.data.achievements.map(x => x.key), ['first_win']);
  assert.equal((await a.post('match-finish.php', { matchId: m.matchId, result: 'win' })).status, 409, 'niet dubbel');
  const p = (await a.get('profile.php')).data;
  assert.equal(p.stats.wins, 1); assert.equal(p.stats.towers_destroyed, 2); assert.equal(p.player.coins, 60);
});

test('nieuwe prestaties: kasteel, foutloos, kills per eenheid, volledig deck, tellers begrensd', { skip }, async () => {
  const a = client(); await a.login('livia@example.test');
  const deck = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket', 'spartan'];
  let m = (await a.post('match-start.php')).data; matchAge(90);
  const r = await a.post('match-finish.php', { matchId: m.matchId, result: 'win', towersDestroyed: 2, unitsDeployed: 20,
    castleDestroyed: true, towersLost: 0, kills: 9999, killsByType: { lancer: 7, assassin: 3, bogus: 50 }, deployedTypes: [...deck, 'nope'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const keys = r.data.achievements.map(x => x.key);
  for (const k of ['first_win', 'castle_1', 'flawless_1', 'full_deck']) assert.ok(keys.includes(k), k);
  let p = (await a.get('profile.php')).data;
  assert.equal(p.stats.kills, 200, 'kills per gevecht begrensd');
  assert.equal(p.stats.kill_lancer, 7); assert.equal(p.stats.kill_assassin, 3); assert.equal(p.stats.win_spartan, 1);
  assert.equal(p.achievements.length, 38, 'verborgen tellers verschijnen niet als prestatie');
  // verlies: geen kasteel/foutloos, wel kills
  m = (await a.post('match-start.php')).data; matchAge(90);
  await a.post('match-finish.php', { matchId: m.matchId, result: 'loss', castleDestroyed: true, towersLost: 0, kills: 5 });
  p = (await a.get('profile.php')).data;
  assert.equal(p.stats.castles, 1); assert.equal(p.stats.flawless, 1); assert.equal(p.stats.kills, 205);
  assert.equal(p.achievements.find(x => x.key === 'kills_500').progress, 205);
});

test('level-up en streaks', { skip }, async () => {
  const a = client(); await a.login('dido@example.test');
  let last;
  for (let i = 0; i < 3; i++) {
    const m = (await a.post('match-start.php')).data; matchAge(60);
    last = (await a.post('match-finish.php', { matchId: m.matchId, result: 'win', towersDestroyed: 1 })).data;
  }
  // 3 x 50 XP = 150 -> niveau 2 (100) met 50 over; bonus 100 munten bij level-up
  assert.equal(last.level, 2); assert.equal(last.xpInLevel, 50); assert.equal(last.xpForNext, 150);
  assert.ok(last.achievements.some(x => x.key === 'streak_3'));
  const m = (await a.post('match-start.php')).data; matchAge(60);
  await a.post('match-finish.php', { matchId: m.matchId, result: 'loss' });
  const s = (await a.get('profile.php')).data.stats;
  assert.equal(s.current_streak, 0); assert.equal(s.best_streak, 3);
});

test('kaart upgraden kost fragmenten en munten; deck opslaan', { skip }, async () => {
  const a = client(); await a.login('eli@example.test');
  assert.equal((await a.post('card-upgrade.php', { card: 'melee' })).status, 400, 'geen fragmenten');
  const pid = sql(`SELECT player_id FROM email_identities WHERE email='eli@example.test'`);
  sql(`INSERT INTO player_cards(player_id,card_type,fragments) VALUES(${pid},'melee',5); UPDATE wallets SET coins=60 WHERE player_id=${pid}`);
  const up = await a.post('card-upgrade.php', { card: 'melee' });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.deepEqual(up.data.cards.melee, { level: 2, fragments: 1 });
  assert.equal(up.data.player.coins, 10);
  assert.equal((await a.post('card-upgrade.php', { card: 'nonsense' })).status, 400);
  assert.equal((await a.post('deck-save.php', { deck: ['melee', 'melee'] })).status, 400);
  const deck = ['spy', 'samurai', 'p51', 'healer', 'melee', 'archer', 'cannon', 'musket'];
  assert.equal((await a.post('deck-save.php', { deck })).status, 200);
  assert.deepEqual((await a.get('profile.php')).data.deck, deck);
});

test('e-mail wijzigen via bevestigingslink; bezet adres lukt niet', { skip }, async () => {
  const a = client(); await a.login('fay@example.test');
  rmSync(OUTBOX, { force: true });
  assert.equal((await a.post('email-change-request.php', { email: 'nope' })).status, 400);
  assert.equal((await a.post('email-change-request.php', { email: 'anna@example.test' })).status, 200, 'bezet: generiek antwoord');
  assert.ok(!existsSync(OUTBOX), 'geen mail naar een bezet adres');
  assert.equal((await a.post('email-change-request.php', { email: 'Fay.New@Example.test' })).status, 200);
  const mail = JSON.parse(readFileSync(OUTBOX, 'utf8').trim().split('\n').pop());
  assert.equal(mail.to, 'fay.new@example.test');
  const token = mail.body.match(/email_change_token=([a-f0-9]{64})/)[1];
  const other = client(); await other.get('me.php');            // link openen in een andere browser
  assert.equal((await other.post('email-change-confirm.php', { token: 'f'.repeat(64) })).status, 400);
  assert.equal((await other.post('email-change-confirm.php', { token })).status, 200);
  assert.equal((await other.post('email-change-confirm.php', { token })).status, 400, 'link is eenmalig');
  assert.equal((await a.get('profile.php')).data.email, 'fay.new@example.test');
  const relog = client(); await relog.get('me.php');
  assert.equal((await relog.post('email-login.php', { email: 'fay.new@example.test', password: 'correct horse battery' })).status, 200);
});

test('vrienden: verzoek, accepteren, online, weigeren, eigen code, verwijderen', { skip }, async () => {
  const a = client(), b = client(), c = client();
  await a.login('gaius@example.test'); await b.login('hera@example.test'); await c.login('ivo@example.test');
  const codeA = (await a.get('friends.php')).data.friendCode;
  const codeB = (await b.get('friends.php')).data.friendCode;
  assert.equal((await a.post('friend-request.php', { code: codeA })).status, 400);
  assert.equal((await a.post('friend-request.php', { code: 'ZZZZZZZZ' })).status, 404);
  const req = await a.post('friend-request.php', { code: codeB.toLowerCase() });
  assert.equal(req.status, 200); assert.equal(req.data.outgoing.length, 1);
  const self = await a.post('friend-respond.php', { id: req.data.outgoing[0].id, accept: true });
  assert.equal(self.data.friends.length, 0, 'je kunt je eigen verzoek niet zelf accepteren');
  const inc = (await b.get('friends.php')).data;
  assert.equal(inc.incoming.length, 1);
  const acc = await b.post('friend-respond.php', { id: inc.incoming[0].id, accept: true });
  assert.equal(acc.data.friends.length, 1);
  assert.equal(acc.data.friends[0].online, true, 'a was net actief');
  const fa = (await a.get('friends.php')).data;
  assert.equal(fa.friends.length, 1); assert.equal(fa.outgoing.length, 0);
  // c vraagt b, b weigert
  await c.post('friend-request.php', { code: codeB });
  const ib = (await b.get('friends.php')).data.incoming;
  assert.equal(ib.length, 1);
  await b.post('friend-respond.php', { id: ib[0].id, accept: false });
  assert.equal((await c.get('friends.php')).data.outgoing.length, 0);
  // verwijderen
  await a.post('friend-respond.php', { id: fa.friends[0].id, accept: false });
  assert.equal((await b.get('friends.php')).data.friends.length, 0);
  // wederzijds verzoek = meteen vrienden
  const codeC = (await c.get('friends.php')).data.friendCode;
  await a.post('friend-request.php', { code: codeC });
  const mutual = await c.post('friend-request.php', { code: codeA });
  assert.equal(mutual.data.friends.length, 1);
});

test('account verwijderen ruimt alles op', { skip }, async () => {
  const a = client(); await a.login('juno@example.test');
  const m = (await a.post('match-start.php')).data; matchAge(60);
  await a.post('match-finish.php', { matchId: m.matchId, result: 'win' });
  const pid = sql(`SELECT player_id FROM email_identities WHERE email='juno@example.test'`);
  assert.equal((await a.post('delete-account.php')).status, 200);
  for (const t of ['player_cards', 'player_achievements', 'wallet_ledger', 'matches'])
    assert.equal(sql(`SELECT COUNT(*) FROM ${t} WHERE player_id=${pid}`), '0', t);
});
