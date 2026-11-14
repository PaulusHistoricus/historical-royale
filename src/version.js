// Versie en build komen uit package.json en de commit (zie vite.config.js),
// zodat er maar één plek is waar de versie staat en je op het scherm altijd
// kunt zien welke build je speelt.
/* global __APP_VERSION__, __BUILD__ */
export const VERSION = __APP_VERSION__;
export const BUILD = __BUILD__;
export const VERSION_LABEL = `v${VERSION} (${BUILD})`;

/**
 * GitHub Pages laat browsers index.html tien minuten cachen. Daardoor kan een
 * telefoon na een deploy nog een oude build tonen. Deze controle haalt
 * version.json zonder cache op en laadt de pagina één keer opnieuw als er een
 * nieuwere build online staat. Geeft 'current', 'stale' of 'unknown' terug.
 */
export async function ensureLatestBuild() {
  if (import.meta.env.DEV) return 'current';
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    const latest = await response.json();
    if (!latest.build || latest.build === BUILD) return 'current';
    const url = new URL(location.href);
    if (url.searchParams.get('build') === latest.build) return 'stale'; // al geprobeerd: geen herlaadlus
    url.searchParams.set('build', latest.build);
    location.replace(url);
    return 'stale';
  } catch {
    return 'unknown';
  }
}
