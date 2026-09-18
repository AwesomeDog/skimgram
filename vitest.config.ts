import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { frequencyPlugin } from './scripts/frequency-plugin';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };
// The core imports the word lists from a virtual module, so the tests need the
// same plugin the build uses to resolve it.
const plugins = [frequencyPlugin()];

// Two projects: `core` is pure and runs in node, `dom` needs jsdom for the paint/clear round trip.
export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'core',
          environment: 'node',
          include: ['tests/core/**/*.test.ts'],
        },
      },
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/dom/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/dom/**/*.ts'],
    },
  },
});
