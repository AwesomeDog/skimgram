// Serves virtual:skimgram-frequency at build time from most-common-words-by-language (MIT)
// and hanzi (MIT, Jun Da's list). Nothing is written to disk; only the ordering is kept,
// since builtin.ts turns a rank into a probability with Zipf.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const FREQUENCY_MODULE_ID = 'virtual:skimgram-frequency';

/** Vite's convention: a leading NUL marks an id that no file on disk answers to. */
const RESOLVED_ID = `\0${FREQUENCY_MODULE_ID}`;

const EN_LIMIT = 3000;
const ZH_LIMIT = 2000;

/** Keeps the payload escaping-free. */
const EN_ALLOWED = /^[a-z0-9'-]+$/;

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const require = createRequire(import.meta.url);

function englishWords(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const word = line.trim();
    if (!word || word.length > 20 || !EN_ALLOWED.test(word)) continue;
    out.push(word);
    if (out.length >= EN_LIMIT) break;
  }
  return out;
}

function chineseChars(text: string): string[] {
  // The data file is a CommonJS module exporting one tab-separated blob.
  const body = text.replace(/^module\.exports\s*=\s*`/, '').replace(/`;?\s*$/, '');
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const char = line.split('\t')[1]?.trim() ?? '';
    // Code points, not UTF-16 units: rare Jun Da entries live in plane 2.
    if ([...char].length !== 1) continue;
    out.push(char);
    if (out.length >= ZH_LIMIT) break;
  }
  return out;
}

function moduleSource(): string {
  const en = englishWords(
    readFileSync(
      path.join(root, 'node_modules/most-common-words-by-language/build/resources/english.txt'),
      'utf8',
    ),
  );
  const zh = chineseChars(require('hanzi/lib/data/frequencyjunda.txt.js') as string);

  if (en.length < 1000 || zh.length < 1000) {
    throw new Error(
      `skimgram: frequency corpus too small (en=${en.length}, zh=${zh.length}); ` +
        'run `npm install` and check the pinned data packages',
    );
  }

  return (
    '// Generated in memory by scripts/frequency-plugin.ts. Not a file on disk.\n' +
    `export const EN_WORDS = ${JSON.stringify(en.join(' '))};\n` +
    `export const CJK_CHARS = ${JSON.stringify(zh.join(''))};\n`
  );
}

export function frequencyPlugin(): Plugin {
  return {
    name: 'skimgram-frequency',
    resolveId(id) {
      return id === FREQUENCY_MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID ? moduleSource() : null;
    },
  };
}
