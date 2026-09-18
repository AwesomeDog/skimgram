// Userscript shell. Same engine as the extension, minus the background worker: there is no
// on-demand injection here because the script already runs on every page. It paints on a
// menu command, or straight away when this origin is listed in autoSites.

import { analyze, type AnalysisStats } from '@/core/scorer';
import { normalize, toggleMode, type Settings } from '@/core/settings';
import { clear as clearPaint, paint } from '@/dom/render';
import { MODE_ATTR, SKIMGRAM_CSS } from '@/dom/styles';
import { collectText } from '@/dom/walker';
import { createPanel, type PanelHandle, type PanelHost, type PanelState } from '@/panel/panel';

const KEY = 'skimgram.settings';

let settings: Settings = normalize(GM_getValue(KEY));
let stats: AnalysisStats | null = null;
let reason: string | null = null;
let observer: MutationObserver | null = null;
let scheduled = false;
let suppress = false;
let stylesInjected = false;
let panel: PanelHandle | null = null;

function whenIdle(fn: () => void, timeout = 500): void {
  requestIdleCallback(() => fn(), { timeout });
}

function isPainted(): boolean {
  return document.documentElement.hasAttribute(MODE_ATTR);
}

/** Constructed stylesheet, not a <style> tag: a strict page CSP blocks the latter. */
function ensureStyles(): void {
  if (stylesInjected) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(SKIMGRAM_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  stylesInjected = true;
}

function teardownObserver(): void {
  observer?.disconnect();
  observer = null;
}

/** Only structural mutations count, and the panel's own insertion is not one of them. */
function setupObserver(): void {
  teardownObserver();
  observer = new MutationObserver((records) => {
    if (suppress) return;
    const structural = records.some(
      (r) => r.type === 'childList' && Array.from(r.addedNodes).some((n) => n !== panel?.element),
    );
    if (!structural) return;
    if (scheduled) return;
    scheduled = true;
    whenIdle(() => {
      scheduled = false;
      apply();
    }, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/** Idempotent: it always clears first. */
function apply(): void {
  if (!document.body) return;

  ensureStyles();
  suppress = true;
  clearPaint(document);
  observer?.takeRecords();
  suppress = false;

  const { text, runs } = collectText(document.body);
  const result = analyze(text, {
    basis: settings.basis,
    intensity: settings.intensity,
    minTokens: settings.minTokens,
  });

  if ('skipped' in result) {
    stats = null;
    reason = result.reason;
    document.documentElement.removeAttribute(MODE_ATTR);
    return;
  }

  stats = result.stats;
  reason = null;
  document.documentElement.setAttribute(MODE_ATTR, settings.modes.join(' '));
  paint(runs, result.tokens, result.levels);

  setupObserver();
}

function remove(): void {
  teardownObserver();
  suppress = true;
  clearPaint(document);
  suppress = false;
  document.documentElement.removeAttribute(MODE_ATTR);
  stats = null;
  reason = null;
}

/** Writes straight to GM storage. The listener below handles only other tabs' writes. */
function save(patch: Partial<Settings>): void {
  settings = normalize({ ...settings, ...patch });
  GM_setValue(KEY, settings);
  if (isPainted()) apply();
}

function state(): PanelState {
  const painted = isPainted();
  return {
    settings,
    painted,
    stats,
    reason,
    status: reason ?? (painted ? 'Reading view is on for this page.' : 'Off. Turn it on to analyse this page.'),
    statusKind: reason ? 'error' : 'info',
    origin: location.origin,
  };
}

const host: PanelHost = {
  get: state,
  toggle(): void {
    if (isPainted()) remove();
    else apply();
  },
  setMode(mode): void {
    save({ modes: toggleMode(settings.modes, mode) });
  },
  setIntensity(value): void {
    save({ intensity: value });
  },
  setBasis(value): void {
    save({ basis: value });
  },
  setAutoSite(on): void {
    const next = on
      ? Array.from(new Set([...settings.autoSites, location.origin]))
      : settings.autoSites.filter((site) => site !== location.origin);
    save({ autoSites: next });
  },
};

function showPanel(): void {
  if (!panel) {
    const element = document.createElement('div');
    element.id = 'skimgram-panel';
    element.style.cssText = 'position: fixed; top: 16px; right: 16px; z-index: 2147483647;';
    // A shadow root keeps the page's own CSS out of the panel.
    panel = createPanel(host, { root: element.attachShadow({ mode: 'open' }), floating: true });
    document.body.append(element);
  }
  panel.show();
}

GM_registerMenuCommand('Toggle reading view', () => host.toggle(), 't');
GM_registerMenuCommand('Skimgram settings', () => showPanel(), 's');

GM_addValueChangeListener(KEY, (_key, _old, _new, remote) => {
  if (!remote) return;
  settings = normalize(GM_getValue(KEY));
  if (isPainted()) apply();
  panel?.refresh();
});

if (settings.autoSites.includes(location.origin)) whenIdle(apply);
