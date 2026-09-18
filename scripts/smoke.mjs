// End-to-end smoke test in a real Chromium: whether injection resolves, whether the popup
// talks to the injected script, whether the stylesheet survives a real page.
// Patches the built manifest to add a localhost permission, since activeTab needs a
// physical toolbar click.

import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const dist = path.join(root, '.output/chrome-mv3');

const ARTICLE = `<!doctype html><html><head><title>Test</title>
<meta http-equiv="Content-Security-Policy" content="style-src 'self'">
<style>span{font-family:inherit}</style></head><body>
<article>
${Array.from(
  { length: 40 },
  (_unused, i) =>
    `<p>The committee reviewed the proposal number ${i} and the committee approved the ` +
    `proposal before the evening session concluded. Every member of the committee reviewed ` +
    `the proposal carefully and every member approved the final version.</p>`,
).join('\n')}
<p>Then, entirely without warning, a xylophone appeared on the table.</p>
</article>
<pre>this code block must never be touched</pre>
</body></html>`;

const PORT = 8731;

function serve() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(ARTICLE);
  });
  return new Promise((resolve) => {
    server.listen(PORT, () => resolve({ close: () => server.close() }));
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

const server = await serve();

// Grant localhost: activeTab is only granted by a physical toolbar click, which a headless browser cannot do.
const manifestPath = path.join(dist, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(
  manifestPath,
  JSON.stringify({ ...manifest, host_permissions: [`http://localhost:${PORT}/*`] }),
);

// Attaching a popup suppresses both action.onClicked and the action context menu; the design needs the left click.
check('button declares no popup', !manifest.action?.default_popup, String(manifest.action?.default_popup));
check('contextMenus is declared', manifest.permissions?.includes('contextMenus') === true);
// Chrome refuses to grant an origin that is not declared optional, and always-run is granted entirely at runtime.
check(
  'optional host permissions declared',
  (manifest.optional_host_permissions ?? []).length > 0,
  JSON.stringify(manifest.optional_host_permissions ?? []),
);

// Icon variants are how the button shows state, so both sets have to reach the build.
const icons = await readdir(path.join(dist, 'icon'));
const ships = (variant) => [16, 32].every((size) => icons.includes(`${size}-${variant}.png`));
check('both icon variants ship', ships('off') && ships('on'), icons.filter((f) => f.endsWith('.png')).join(' '));
check(
  'default icon is the idle one',
  manifest.action?.default_icon?.['16'] === 'icon/16-off.png',
  String(manifest.action?.default_icon?.['16']),
);

const context = await chromium.launchPersistentContext('', {
  headless: true,
  // Playwright's default is the headless shell, which cannot load extensions; SMOKE_CHANNEL=chrome for installed Chrome.
  channel: process.env.SMOKE_CHANNEL ?? 'chromium',
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

try {
  let extensionId = '';
  const deadline = Date.now() + 15000;
  while (!extensionId && Date.now() < deadline) {
    for (const worker of context.serviceWorkers()) {
      const match = /chrome-extension:\/\/([a-z]{32})\//.exec(worker.url());
      if (match) extensionId = match[1];
    }
    if (!extensionId) await new Promise((r) => setTimeout(r, 300));
  }
  check('extension loaded', Boolean(extensionId), extensionId || 'no service worker found');
  if (!extensionId) throw new Error('extension did not start');

  const errors = [];

  // Order matters: the popup is just another tab here, so the article must be in front before the popup reloads.
  const popup = await context.newPage();
  popup.on('pageerror', (e) => errors.push(`popup: ${e}`));
  await popup.goto(`chrome-extension://${extensionId}/settings.html`, { waitUntil: 'load' });

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.bringToFront();
  await popup.reload({ waitUntil: 'load' });

  check('popup renders', (await popup.locator('#toggle').count()) === 1);
  // The panel installs its stylesheet with adoptedStyleSheets, so this is what proves it landed.
  check(
    'popup is styled',
    (await popup.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundColor)) ===
      'rgb(246, 247, 249)',
    await popup.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundColor),
  );

  // A DOM click, not a Playwright click: the latter would focus the popup and make it the active tab again.
  await popup.evaluate(() => document.getElementById('toggle').click());
  await popup
    .waitForFunction(
      () => document.querySelector('#toggle')?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 10000 },
    )
    .catch(async () => {
      const status = await popup.locator('#status').textContent();
      console.log(`  popup status: ${status}`);
      console.log(`  popup errors: ${errors.join(' | ') || 'none'}`);
      const perms = await popup.evaluate(async () => ({
        all: await chrome.permissions.getAll(),
        tabs: await chrome.tabs.query({ active: true, currentWindow: true }),
      }));
      console.log(`  permissions: ${JSON.stringify(perms.all)}`);
      console.log(`  active tab: ${JSON.stringify(perms.tabs.map((t) => [t.id, t.url]))}`);
      throw new Error('toggle never turned on');
    });

  const painted = await page
    .waitForFunction(() => document.querySelectorAll('span.skimgram-t').length > 0, undefined, {
      timeout: 10000,
    })
    .then(() => true)
    .catch(() => false);
  check('page is painted', painted);

  const info = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.skimgram-t'));
    const levels = new Set(spans.map((s) => s.getAttribute('data-sk')));
    const pre = Array.from(document.querySelectorAll('pre'))[0];
    const first = spans[0];
    const style = first ? getComputedStyle(first) : null;
    return {
      count: spans.length,
      levels: Array.from(levels).sort(),
      preUntouched: pre?.querySelectorAll('span.skimgram-t').length === 0,
      preText: pre?.textContent,
      mode: document.documentElement.getAttribute('data-skimgram-mode'),
      fontFamily: style?.fontFamily ?? null,
    };
  });

  /** Fade on a predictable token, wash on a surprising one, as computed. */
  const readPaint = () =>
    page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.skimgram-t'));
      const plain = spans.find((s) => Number(s.getAttribute('data-sk')) < 0);
      const hot = spans.find((s) => s.getAttribute('data-sk') === '2');
      return {
        opacity: plain ? getComputedStyle(plain).opacity : null,
        background: hot ? getComputedStyle(hot).backgroundColor : null,
      };
    });

  const waitForMode = (mode, present) =>
    page
      .waitForFunction(
        ([m, want]) =>
          (document.documentElement.getAttribute('data-skimgram-mode') ?? '')
            .split(' ')
            .includes(m) === want,
        [mode, present],
        { timeout: 10000 },
      )
      .catch(() => undefined);

  check('multiple levels assigned', info.levels.length > 1, info.levels.join(','));
  check('mode attribute set', info.mode === 'dim heat', String(info.mode));
  check('code block untouched', info.preUntouched, info.preText);

  // Default is dim and heat together: predictable words fade, surprising ones take the red wash.
  const defaultPaint = await readPaint();
  check(
    'heat paints the expected red',
    Boolean(defaultPaint.background && defaultPaint.background.includes('255, 71, 64')),
    String(defaultPaint.background),
  );
  check('dim fades the predictable', Number(defaultPaint.opacity) < 1, `opacity=${defaultPaint.opacity}`);

  const stats = await popup.locator('#stats').textContent();
  check('popup reports stats', Boolean(stats && stats.includes('tokens')), stats ?? '');

  // Modes are overlays: taking dim away has to drop the fade and leave the wash standing alone.
  await popup.evaluate(() => document.querySelector('#mode button[data-mode="dim"]').click());
  await waitForMode('dim', false);
  const noDim = await readPaint();
  check('dim off leaves the predictable words alone', noDim.opacity === '1', `opacity=${noDim.opacity}`);
  check(
    'dim off keeps the heat wash',
    Boolean(noDim.background && noDim.background.includes('255, 71, 64')),
    String(noDim.background),
  );

  await popup.evaluate(() => document.querySelector('#mode button[data-mode="dim"]').click());
  await waitForMode('dim', true);
  const withDim = await readPaint();
  check('dim on fades the predictable', Number(withDim.opacity) < 1, `opacity=${withDim.opacity}`);
  check(
    'dim on stacks with heat',
    Boolean(withDim.background && withDim.background.includes('255, 71, 64')),
    String(withDim.background),
  );

  // Toggling off must restore the DOM byte for byte.
  const beforeHtml = await page.evaluate(() => document.body.innerHTML);
  await popup.locator('#toggle').click();
  await popup.waitForFunction(
    () => document.querySelector('#toggle')?.getAttribute('aria-pressed') === 'false',
    undefined,
    { timeout: 10000 },
  );
  const afterHtml = await page.evaluate(() => document.body.innerHTML);
  check(
    'toggle off restores the page',
    !afterHtml.includes('skimgram-t'),
    afterHtml.includes('skimgram-t') ? 'spans remain' : '',
  );

  // setIcon is how the button shows state, and it throws if a path 404s in the built extension.
  const iconSwap = await popup.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.action.setIcon({ tabId: tab.id, path: { 16: 'icon/16-on.png', 32: 'icon/32-on.png' } });
      await chrome.action.setIcon({ tabId: tab.id, path: { 16: 'icon/16-off.png', 32: 'icon/32-off.png' } });
      return 'ok';
    } catch (error) {
      return String(error);
    }
  });
  check('state icons load at runtime', iconSwap === 'ok', iconSwap === 'ok' ? '' : iconSwap);

  // Informational only: whether action.openPopup() works depends on the browser session we were handed.
  const openPopup = await popup.evaluate(async () => {
    try {
      await chrome.action.setPopup({ popup: 'settings.html' });
      await chrome.action.openPopup();
      return 'opened';
    } catch (error) {
      return String(error);
    } finally {
      await chrome.action.setPopup({ popup: '' });
    }
  });
  console.log(`  note: action.openPopup() -> ${openPopup}`);

  // Always-run is the only path that starts without a click; the patched localhost grant stands in for a held permission.
  await popup.evaluate(() => document.getElementById('auto-site').click());
  await popup
    .waitForFunction(() => document.getElementById('auto-site')?.checked === true, undefined, {
      timeout: 5000,
    })
    .catch(() => undefined);
  const recorded = await popup.evaluate(async () => {
    const key = 'skimgram.settings';
    return ((await chrome.storage.sync.get(key))[key]?.autoSites ?? []).length;
  });
  check('ticking the box records the site', recorded === 1, `autoSites=${recorded}`);

  await page.reload({ waitUntil: 'load' });
  const auto = await page
    .waitForFunction(() => document.querySelectorAll('span.skimgram-t').length > 0, undefined, {
      timeout: 10000,
    })
    .then(() => true)
    .catch(() => false);
  check('always-run site paints on load', auto);

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await context.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
