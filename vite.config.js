import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Op GitHub Actions is dit de commit die gebouwd wordt; lokaal 'dev'.
const build = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);

export default defineConfig({
  base: '/historical-royale/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD__: JSON.stringify(build),
  },
  plugins: [{
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build }) });
    },
  }],
});
