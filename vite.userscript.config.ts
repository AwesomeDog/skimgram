// Second build: the same core, packaged as a Tampermonkey userscript instead of an
// extension. Kept separate from wxt.config.ts because WXT only knows how to emit manifests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { frequencyPlugin } from './scripts/frequency-plugin';

const root = new URL('./', import.meta.url);

// minify stays off: a userscript ships as source, so whoever installs it should be able to
// read it. @noframes keeps it out of iframes, which is what the extension does by default.
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  version: string;
};

const header = `// ==UserScript==
// @name         Skimgram
// @namespace    http://tampermonkey.net/
// @version      ${version}
// @description  Skim reading driven by surprisal: fade what you can guess, emphasise what you cannot.
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @downloadURL  https://github.com/awesomedog/skimgram/releases/latest/download/skimgram.user.js
// @updateURL    https://github.com/awesomedog/skimgram/releases/latest/download/skimgram.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// ==/UserScript==
`;

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('src', root)) } },
  plugins: [frequencyPlugin()],
  build: {
    outDir: '.output/userscript',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('src/userscript/main.ts', root)),
      formats: ['iife'],
      name: 'Skimgram',
      fileName: () => 'skimgram.user.js',
    },
    rollupOptions: { output: { banner: header } },
  },
});
