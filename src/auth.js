// Legion Royale auth UI. Login and database access happen exclusively on the PHP server.
// Unconfigured/local Vite preview: guest play remains available; NO fake local accounts.
import './auth.css';
const root = document.createElement('div');
root.id = 'auth-ui';
root.innerHTML = `
  <div class="lr-profile" id="lr-profile" hidden>
    <img id="lr-avatar" alt="" hidden>
    <span class="lr-profile-name" id="lr-profile-name"></span>
    <button id="lr-profile-button" type="button">Sign in</button>
  </div>
  <section class="lr-auth-dialog" id="lr-auth-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="lr-auth-title">
    <div class="lr-auth-panel">
      <div class="lr-auth-eagle">⚔</div>
      <h2 id="lr-auth-title">LEGION ROYALE</h2>
      <p>Build your army. Save your progress. Join the battle.</p>
      <p id="lr-auth-error" class="lr-auth-error" hidden></p>
      <a class="lr-auth-google" id="lr-auth-google" href="/api/google-start.php">Continue with Google</a>
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

function showError(message) {
  error.textContent = message; error.hidden = !message;
}
function render() {
  const profile = byId('lr-profile');
  profile.hidden = !onMenu;
  if (session?.authenticated) {
    byId('lr-profile-name').textContent =
      session.player.name + ' · Lv ' + session.player.level + ' · ' + session.player.coins + ' coins';
    byId('lr-profile-button').textContent = 'Sign out';
    const img = byId('lr-avatar');
    img.hidden = !session.player.avatar;
    if (session.player.avatar) img.src = session.player.avatar;
    dialog.hidden = true;
  } else {
    byId('lr-profile-name').textContent = 'Guest';
    byId('lr-avatar').hidden = true;
    byId('lr-profile-button').textContent = 'Sign in';
    dialog.hidden = !(onMenu && hasChecked && !guest);
  }
}
async function checkSession() {
  try {
    const response = await fetch('/api/me.php', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Authentication server is not configured');
    session = await response.json();
  } catch {
    session = { authenticated: false };
    showError('Google sign-in is not configured on this server yet. You can still play as a guest.');
    byId('lr-auth-google').setAttribute('aria-disabled', 'true');
    byId('lr-auth-google').addEventListener('click', event => event.preventDefault(), { once: true });
  }
  if (qs.has('login_error')) showError('Sign-in could not be completed. Please try again.');
  if (qs.has('login') || qs.has('login_error')) {
    qs.delete('login'); qs.delete('login_error');
    history.replaceState(null, '', location.pathname + (qs.size ? '?' + qs : '') + location.hash);
  }
  hasChecked = true;
  render();
}
byId('lr-auth-guest').addEventListener('click', () => { guest = true; dialog.hidden = true; render(); });
byId('lr-profile-button').addEventListener('click', async () => {
  if (session?.authenticated) {
    try {
      const res = await fetch('/api/logout.php', { method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error('Sign-out failed');
      session = { authenticated: false }; guest = true;
      render();
    } catch { showError('Unable to sign out. Please try again.'); dialog.hidden = false; }
  } else {
    guest = false; render();
  }
});
window.addEventListener('lr:menu', () => { onMenu = true; render(); });
window.addEventListener('lr:battle', () => { onMenu = false; dialog.hidden = true; render(); });
checkSession();
