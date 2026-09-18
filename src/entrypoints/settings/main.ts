// Settings panel controller. The opening click is the gesture that grants activeTab, which
// is what makes injection possible at all. Everything here is scoped to that one tab.

import { toBackground, toTab, type Response } from '../../core/messaging';
import { applySettings, clearPage } from '../../core/page';
import type { AnalysisStats } from '../../core/scorer';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  toggleMode,
  type Settings,
} from '../../core/settings';
import { createPanel, type PanelHandle, type PanelHost, type PanelState } from '../../panel/panel';

let settings: Settings = DEFAULT_SETTINGS;
let tabId = 0;
let origin = '';
let active = false;
let stats: AnalysisStats | null = null;
let reason: string | null = null;
let status = 'Off. Turn it on to analyse this page.';
let statusKind: 'info' | 'error' = 'info';
let panel: PanelHandle | null = null;

/** Detaching the popup is what lets action.onClicked fire again instead of reopening this panel. */
async function releaseAction(): Promise<void> {
  try {
    await chrome.action.setPopup({ popup: '' });
  } catch {
    // Not attached; the panel is on screen either way.
  }
}

function adopt(response: Response | null): void {
  if (!response?.ok) {
    active = false;
    stats = null;
    reason = null;
    status = 'Could not reach the page. Try reloading it.';
    statusKind = 'error';
    return;
  }
  stats = response.stats ?? null;
  reason = response.reason ?? null;
  active = Boolean(response.painted);
  status = active ? 'Reading view is on for this page.' : (response.reason ?? 'Nothing to mark on this page.');
  statusKind = active ? 'info' : 'error';
}

const host: PanelHost = {
  get: (): PanelState => ({ settings, painted: active, stats, reason, status, statusKind, origin }),

  async toggle(): Promise<void> {
    if (active) {
      await clearPage(tabId);
      active = false;
      stats = null;
      reason = null;
      status = 'Reading view is off.';
      statusKind = 'info';
      return;
    }
    panel?.setStatus('Analysing…');
    try {
      adopt(await applySettings(tabId, settings));
    } catch (error) {
      active = false;
      stats = null;
      status = error instanceof Error ? error.message : 'Injection failed.';
      statusKind = 'error';
    }
  },

  async setMode(mode): Promise<void> {
    settings = await saveSettings({ modes: toggleMode(settings.modes, mode) });
    if (active) adopt(await applySettings(tabId, settings));
  },

  async setIntensity(value): Promise<void> {
    settings = await saveSettings({ intensity: value });
    if (active) adopt(await applySettings(tabId, settings));
  },

  async setBasis(value): Promise<void> {
    settings = await saveSettings({ basis: value });
    if (active) adopt(await applySettings(tabId, settings));
  },

  /** Raised here, not in the worker: permissions.request() needs a user gesture. */
  async setAutoSite(on): Promise<void> {
    if (!origin) return;
    const pattern = `${origin}/*`;

    if (on) {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: [pattern] });
      } catch {
        granted = false;
      }
      if (!granted) {
        status = `Skimgram needs access to ${origin} to run there automatically.`;
        statusKind = 'error';
        return;
      }
    } else {
      try {
        await chrome.permissions.remove({ origins: [pattern] });
      } catch {
        // Only fires if the grant was already gone: every permission we hold is optional.
      }
    }

    const response = await toBackground({ type: 'auto-site', add: on, origin });
    if (!response.ok) {
      status = response.error;
      statusKind = 'error';
      return;
    }
    if (response.settings) settings = response.settings;
    // A registered content script only reaches a page on its next load, so say the tab needs reloading.
    status = on
      ? `Skimgram will run automatically on ${origin}. Reload the tab to start now.`
      : `Removed ${origin}.`;
    statusKind = 'info';
  },
};

async function init(): Promise<void> {
  panel = createPanel(host, { root: document });
  await releaseAction();

  // An action popup is not a tab, so this resolves to the page underneath it.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) tabId = tab.id;

  // Only http(s): internal schemes give origin "null".
  try {
    const url = new URL(tab?.url ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
  } catch {
    origin = '';
  }
  if (!tabId) {
    status = 'No active tab.';
    statusKind = 'error';
  }

  settings = await loadSettings();

  // Pick up existing state: an auto site, or an earlier activation, may already have painted.
  const response = await toTab(tabId, { type: 'stats' });
  if (response?.ok) {
    active = Boolean(response.painted);
    stats = response.stats ?? null;
    reason = response.reason ?? null;
    if (response.reason) {
      status = response.reason;
      statusKind = 'error';
    } else if (active) {
      status = 'Reading view is on for this page.';
      statusKind = 'info';
    }
  }

  await panel.refresh();
}

void init();
