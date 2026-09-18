// Injected on demand rather than declared, which is why Skimgram ships without <all_urls>.
// It is therefore not running on most tabs and must treat every message as the first.

import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import type { Request, Response } from '../core/messaging';
import { analyze, type AnalysisStats } from '../core/scorer';
import { loadSettings, onSettingsChanged, type Settings } from '../core/settings';
import { clear as clearPaint, paint } from '../dom/render';
import { ensureStyles, MODE_ATTR } from '../dom/styles';
import { collectText } from '../dom/walker';

let settings: Settings | null = null;
let stats: AnalysisStats | null = null;
let skipReason: string | null = null;
let suppressObserver = false;
let observer: MutationObserver | null = null;
let scheduled = false;

let reportedPainted: boolean | null = null;

/** The page is the authority on its own state, so every route into apply() and remove() reports upward. */
function reportState(): void {
  const painted = document.documentElement.hasAttribute(MODE_ATTR);
  if (painted === reportedPainted) return;
  reportedPainted = painted;
  void chrome.runtime
    .sendMessage({ type: 'painted', painted } satisfies Request)
    .catch(() => undefined);
}

function whenIdle(fn: () => void, timeout = 500): void {
  requestIdleCallback(() => fn(), { timeout });
}

function teardownObserver(): void {
  observer?.disconnect();
  observer = null;
}

/** Only structural mutations count: attribute churn never changes what we scored. */
function setupObserver(): void {
  teardownObserver();
  observer = new MutationObserver((records) => {
    if (suppressObserver) return;
    const structural = records.some((r) => r.type === 'childList' && r.addedNodes.length > 0);
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
  const current = settings;
  if (!current || !document.body) return;

  ensureStyles(document);
  suppressObserver = true;
  clearPaint(document);
  // Drop the records our own unwrapping generated.
  observer?.takeRecords();

  const { text, runs } = collectText(document.body);
  const result = analyze(text, {
    basis: current.basis,
    intensity: current.intensity,
    minTokens: current.minTokens,
  });

  if ('skipped' in result) {
    stats = null;
    skipReason = result.reason;
    document.documentElement.removeAttribute(MODE_ATTR);
    suppressObserver = false;
    reportState();
    return;
  }

  stats = result.stats;
  skipReason = null;
  document.documentElement.setAttribute(MODE_ATTR, current.modes.join(' '));
  paint(runs, result.tokens, result.levels);

  suppressObserver = false;
  setupObserver();
  reportState();
}

function remove(): void {
  teardownObserver();
  suppressObserver = true;
  clearPaint(document);
  document.documentElement.removeAttribute(MODE_ATTR);
  suppressObserver = false;
  stats = null;
  skipReason = null;
  reportState();
}

/** Stored as bare origins, so this is string equality and the prompt names one site. */
function isAutoSite(current: Settings): boolean {
  try {
    return current.autoSites.includes(new URL(location.href).origin);
  } catch {
    return false;
  }
}

async function handle(request: Request): Promise<Response> {
  switch (request.type) {
    case 'ping':
      return { ok: true, painted: document.documentElement.hasAttribute(MODE_ATTR) };

    case 'apply':
      settings = request.settings;
      document.documentElement.setAttribute(MODE_ATTR, settings.modes.join(' '));
      apply();
      return { ok: true, painted: document.documentElement.hasAttribute(MODE_ATTR), stats, reason: skipReason ?? undefined };

    case 'clear':
      remove();
      return { ok: true, painted: false };

    case 'stats':
      // `painted` rides along so callers can tell "on" from "here but skipped" — the toggle needs that.
      return {
        ok: true,
        painted: document.documentElement.hasAttribute(MODE_ATTR),
        stats,
        reason: skipReason ?? undefined,
      };

    default:
      return { ok: false, error: `unknown request: ${(request as { type: string }).type}` };
  }
}

/** Unlisted, so injection is always on demand and nothing claims access to every site. */
export default defineUnlistedScript(async () => {
  settings = await loadSettings();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handle(message as Request).then(sendResponse);
    // Keep the channel open for the async handler.
    return true;
  });

  onSettingsChanged((next) => {
    settings = next;
    if (document.documentElement.hasAttribute(MODE_ATTR)) whenIdle(apply);
  });

  if (isAutoSite(settings)) whenIdle(apply);
});
