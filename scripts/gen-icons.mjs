// Rasterizes the vector icons into the PNG sizes Chrome expects. Wired to predev/prebuild
// /prezip. `on` must be the same drawing as `off` apart from the accent line, or the button
// looks like it changes shape when it is only changing state.
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const SIZES = [16, 32, 48, 128];
const VARIANTS = ['off', 'on'];

for (const variant of VARIANTS) {
  const svg = await readFile(path.join(root, `public/icon/icon-${variant}.svg`), 'utf8');
  for (const size of SIZES) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    await writeFile(path.join(root, `public/icon/${size}-${variant}.png`), png);
  }
}

console.log(`[icons] ${VARIANTS.join('/')} -> ${SIZES.join('/')}.png`);
