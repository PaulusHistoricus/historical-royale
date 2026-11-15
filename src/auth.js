// Legion Royale auth UI. Login and database access happen exclusively on the PHP server.
// Unconfigured/local Vite preview: guest play remains available; NO fake local accounts.
import './auth.css';
const root = document.createElement('div');
root.id = 'auth-ui';
for (const t of ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup']) root.addEventListener(t, e => e.stopPropagation());   // niet doortikken naar Phaser
root.innerHTML = `
  <div class="lr-profile" id="lr-profile" hidden>
    <img id="lr-avatar" alt="" hidden>
    <span class="lr-profile-text"><span class="lr-profile-name" id="lr-profile-name"></span>
      <span class="lr-profile-xp" id="lr-profile-xp" hidden><i id="lr-profile-xpfill"></i></span></span>
    <button id="lr-profile-button" type="button">Sign in</button>
  </div>
  <section class="lr-auth-dialog" id="lr-auth-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="lr-auth-title">
    <div class="lr-auth-panel">
      <div class="lr-auth-eagle">⚔</div>
      <h2 id="lr-auth-title">LEGION ROYALE</h2>
      <p>Build your army. Save your progress. Join the battle.</p>
      <p id="lr-auth-error" class="lr-auth-error" hidden></p>
      <a class="lr-auth-google" id="lr-auth-google" href="/api/google-start.php">Continue with Google</a>
      <button id="lr-email-open" type="button">Continue with email</button>
      <div id="lr-email-forms" hidden>
        <form id="lr-email-request-form" hidden>
          <label for="lr-email-request-address">Email address</label>
          <input id="lr-email-request-address" name="email" type="email" autocomplete="email" maxlength="254" required>
          <button type="submit" id="lr-email-request-submit">Send sign-in link</button>
          <button type="button" id="lr-email-show-login">Already have a password? Sign in</button>
        </form>
        <form id="lr-email-login-form" hidden>
          <label for="lr-email-login-address">Email address</label>
          <input id="lr-email-login-address" name="email" type="email" autocomplete="email" maxlength="254" required>
          <label for="lr-email-login-password">Password</label>
          <div class="lr-password-wrap">
            <input id="lr-email-login-password" type="password" autocomplete="current-password" required>
            <button type="button" id="lr-email-login-eye" aria-label="Show password" aria-pressed="false">👁</button>
          </div>
          <button type="submit" id="lr-email-login-submit">Sign in</button>
          <button type="button" id="lr-email-forgot">Forgot password?</button>
        </form>
        <form id="lr-email-set-form" hidden>
          <p>Set your new password</p>
          <label for="lr-email-new-password">New password (12 characters minimum)</label>
          <div class="lr-password-wrap">
            <input id="lr-email-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required>
            <button type="button" id="lr-email-new-eye" aria-label="Show password" aria-pressed="false">👁</button>
          </div>
          <label for="lr-email-confirm-password">Confirm password</label>
          <div class="lr-password-wrap">
            <input id="lr-email-confirm-password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required>
            <button type="button" id="lr-email-confirm-eye" aria-label="Show password" aria-pressed="false">👁</button>
          </div>
          <button type="submit" id="lr-email-set-submit">Save password</button>
        </form>
        <p id="lr-email-feedback" role="status" aria-live="polite" hidden></p>
        <button type="button" id="lr-email-back">Back</button>
      </div>
      <button class="lr-auth-guest" id="lr-auth-guest" type="button">Play as guest</button>
      <small>Guest progress is not saved. By signing in you create a player profile.</small>
    </div>
  </section>`;
document.body.append(root);
const byId = id => document.getElementById(id);
const dialog = byId('lr-auth-dialog'), error = byId('lr-auth-error');
let session = null;
let hasChecked = false;
let guest = false;
let onMenu = true;
const qs = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '');
const emailToken = fragment.get('email_token') || '';
if (emailToken) {
  // Strip the secret from browser history immediately. It is never sent as an HTTP request.
  history.replaceState(null, '', location.pathname + location.search);
}
let emailMode = emailToken ? 'set' : '';
let authBusy = false;
const genericMailMessage = 'If the address is valid, a sign-in link will arrive shortly. Check your inbox and spam folder.';

function emailFeedback(message, isError = false) {
  const node = byId('lr-email-feedback');
  node.hidden = !message;
  node.textContent = message;
  node.setAttribute('data-error', isError ? 'true' : 'false');
}
function showEmail(mode) {
  emailMode = mode;
  byId('lr-email-forms').hidden = !mode;
  byId('lr-email-open').hidden = !!mode;
  byId('lr-email-request-form').hidden = mode !== 'request';
  byId('lr-email-login-form').hidden = mode !== 'login';
  byId('lr-email-set-form').hidden = mode !== 'set';
  byId('lr-email-back').hidden = mode === 'set';
  byId('lr-auth-google').hidden = mode === 'set';
  byId('lr-auth-guest').hidden = mode === 'set';
  emailFeedback('');
  if (mode) { guest = false; dialog.hidden = false; }
}
async function postEmailApi(endpoint, payload) {
  if (!session?.csrfToken) throw new Error('Login service is unavailable. Please try again later.');
  const res = await fetch('/api/' + endpoint, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to complete your request.');
  return data;
}
function togglePassword(id, buttonId) {
  const input = byId(id), button = byId(buttonId);
  input.type = input.type === 'password' ? 'text' : 'password';
  const visible = input.type === 'text';
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
}


function showError(message) {
  error.textContent = message; error.hidden = !message;
}
function render() {
  window.lrSession = session;
  window.dispatchEvent(new Event('lr:session'));
  const profile = byId('lr-profile');
  showEmailFields();
  profile.hidden = !onMenu;
  if (session?.authenticated) {
    const pl = session.player;
    byId('lr-profile-name').textContent = pl.name + ' · Lv ' + pl.level + ' · ' + pl.coins + ' 🪙';
    byId('lr-profile-xp').hidden = !pl.xpForNext;
    byId('lr-profile-xpfill').style.width = (pl.xpForNext ? 100 * pl.xpInLevel / pl.xpForNext : 100) + '%';
    byId('lr-profile-button').textContent = 'Profile';
    const img = byId('lr-avatar');
    const src = pl.avatarKey ? import.meta.env.BASE_URL + 'assets/avatars/' + pl.avatarKey + '.webp' : pl.avatar;
    img.hidden = !src;
    if (src) img.src = src;
    dialog.hidden = true;
  } else {
    byId('lr-profile-name').textContent = 'Guest';
    byId('lr-profile-xp').hidden = true;
    byId('lr-avatar').hidden = true;
    byId('lr-profile-button').textContent = 'Sign in';
    dialog.hidden = !(onMenu && hasChecked && (!guest || emailMode === 'set'));
  }
}
async function checkSession() {
  try {
    const response = await fetch('/api/me.php', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Authentication server is not configured');
    session = await response.json();
    if (typeof session.authenticated !== 'boolean') throw new Error('Invalid authentication response');
  } catch {
    session = { authenticated: false };
    showError('Sign-in is not configured on this server yet. You can still play as a guest.');
    byId('lr-auth-google').setAttribute('aria-disabled', 'true');
    byId('lr-auth-google').removeAttribute('href');
  }
  if (qs.has('login_error')) showError('Sign-in could not be completed. Please try again.');
  if (qs.has('login') || qs.has('login_error')) {
    qs.delete('login'); qs.delete('login_error');
    history.replaceState(null, '', location.pathname + (qs.size ? '?' + qs : '') + location.hash);
  }
  hasChecked = true;
  render();
  if (emailToken && !session?.authenticated) showEmail('set');
}
function showEmailFields() {
  byId('lr-email-forms').hidden = !emailMode;
  byId('lr-email-open').hidden = !!emailMode;
  byId('lr-email-request-form').hidden = emailMode !== 'request';
  byId('lr-email-login-form').hidden = emailMode !== 'login';
  byId('lr-email-set-form').hidden = emailMode !== 'set';
  byId('lr-email-back').hidden = emailMode === 'set';
  byId('lr-auth-google').hidden = emailMode === 'set';
  byId('lr-auth-guest').hidden = emailMode === 'set';
}
byId('lr-email-open').addEventListener('click', () => showEmail('request'));
byId('lr-email-show-login').addEventListener('click', () => {
  byId('lr-email-login-address').value = byId('lr-email-request-address').value;
  showEmail('login');
});
byId('lr-email-forgot').addEventListener('click', () => {
  byId('lr-email-request-address').value = byId('lr-email-login-address').value;
  showEmail('request');
});
byId('lr-email-back').addEventListener('click', () => showEmail(''));
for (const [input, eye] of [
  ['lr-email-login-password', 'lr-email-login-eye'],
  ['lr-email-new-password', 'lr-email-new-eye'],
  ['lr-email-confirm-password', 'lr-email-confirm-eye']
]) byId(eye).addEventListener('click', () => togglePassword(input, eye));

byId('lr-email-request-form').addEventListener('submit', async event => {
  event.preventDefault(); if (authBusy) return;
  authBusy = true; const button = byId('lr-email-request-submit'); button.disabled = true;
  try {
    await postEmailApi('email-request-link.php', { email: byId('lr-email-request-address').value });
    emailFeedback(genericMailMessage);
  } catch (e) { emailFeedback(e.message, true); }
  finally { authBusy = false; button.disabled = false; }
});
byId('lr-email-login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (authBusy) return;
  authBusy = true; const button = byId('lr-email-login-submit'); button.disabled = true;
  try {
    const result = await postEmailApi('email-login.php', {
      email: byId('lr-email-login-address').value,
      password: byId('lr-email-login-password').value
    });
    session = { authenticated: true, player: result.player, csrfToken: result.csrfToken };
    emailMode = ''; byId('lr-email-login-password').value = ''; render();
  } catch (e) { emailFeedback(e.message, true); }
  finally { authBusy = false; button.disabled = false; }
});
byId('lr-email-set-form').addEventListener('submit', async event => {
  event.preventDefault(); if (authBusy) return;
  const password = byId('lr-email-new-password').value;
  const confirmPassword = byId('lr-email-confirm-password').value;
  if (password !== confirmPassword) { emailFeedback('Passwords do not match.', true); return; }
  authBusy = true; const button = byId('lr-email-set-submit'); button.disabled = true;
  try {
    const result = await postEmailApi('email-set-password.php', { token: emailToken, password, confirmPassword });
    session = { authenticated: true, player: result.player, csrfToken: result.csrfToken };
    emailMode = '';
    byId('lr-email-new-password').value = ''; byId('lr-email-confirm-password').value = '';
    render();
  } catch (e) { emailFeedback(e.message, true); }
  finally { authBusy = false; button.disabled = false; }
});
byId('lr-auth-guest').addEventListener('click', () => { guest = true; dialog.hidden = true; render(); });
async function signOut() {
  if (session?.authenticated) {
    try {
      const res = await fetch('/api/logout.php', { method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error('Sign-out failed');
      session = { authenticated: false }; guest = true;
      render();
    } catch { showError('Unable to sign out. Please try again.'); dialog.hidden = false; }
  }
}
window.lrSignOut = signOut;
window.addEventListener('lr:player', render);
byId('lr-avatar').addEventListener('click', () => { if (session?.authenticated) window.dispatchEvent(new CustomEvent('lr:open', { detail: 'profile' })); });
byId('lr-profile-button').addEventListener('click', () => {
  if (session?.authenticated) window.dispatchEvent(new CustomEvent('lr:open', { detail: 'profile' }));
  else { guest = false; render(); }
});
window.addEventListener('lr:menu', () => { onMenu = true; render(); });
window.addEventListener('lr:battle', () => { onMenu = false; dialog.hidden = true; render(); });
checkSession();
