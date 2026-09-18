// Background worker. Keeps the dynamic content scripts for auto-run sites registered, and
// owns the toolbar button: left click toggles the reading view and raises the panel, right
// click raises the panel alone. Scripts are re-registered on install, startup and change.

import { defineBackground } from 'wxt/utils/define-background';
import { AUTO_SCRIPT_ID, INJECT_FILE, MENU_SETTINGS, PANEL_FILE } from '../core/constants';
import type { Request, Response } from '../core/messaging';
import { readStats, toggleReadingView } from '../core/page';
import { loadSettings, saveSettings } from '../core/settings';

async function syncAutoScripts(): Promise<void> {
  const settings = await loadSettings();
  const matches = settings.autoSites.map((origin) => `${origin}/*`);

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] });
  } catch {
    // Throws on some Chrome versions when nothing is registered yet.
  }

  if (matches.length === 0) return;

  // A revoked site must not be registered, or Chrome rejects the whole call.
  const granted = await chrome.permissions.contains({ origins: matches });
  if (!granted) return;

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: AUTO_SCRIPT_ID,
        matches,
        js: [INJECT_FILE],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    console.warn('[skimgram] could not register auto scripts', error);
  }
}

/** Rebuilt on every worker start: cheaper than reasoning about what survived. */
async function createMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_SETTINGS,
    title: 'Skimgram settings',
    contexts: ['action'],
  });
}

/** Needs a popup attached first; the panel detaches it, handing left clicks back to the toggle. */
async function openPanel(windowId?: number): Promise<void> {
  try {
    await chrome.action.setPopup({ popup: PANEL_FILE });
    await chrome.action.openPopup(windowId === undefined ? {} : { windowId });
  } catch (error) {
    console.warn('[skimgram] could not open the action popup', error);
    await chrome.action.setPopup({ popup: '' }).catch(() => undefined);
  }
}

const ICONS = {
  off: { 16: 'icon/16-off.png', 32: 'icon/32-off.png' },
  on: { 16: 'icon/16-on.png', 32: 'icon/32-on.png' },
};

const TITLES = {
  off: 'Skimgram — click to toggle reading view and open settings',
  on: 'Skimgram — reading view on (click to turn it off; settings open with it)',
};

async function setAction(tabId: number, on: boolean): Promise<void> {
  try {
    await chrome.action.setTitle({ tabId, title: on ? TITLES.on : TITLES.off });
    await chrome.action.setIcon({ tabId, path: on ? ICONS.on : ICONS.off });
  } catch {
    // The tab closed on the way here.
  }
}

/** The page is the authority: it can paint itself on an auto-run site, or end up clean after a repaint. */
async function syncAction(tabId: number): Promise<void> {
  const response = await readStats(tabId);
  await setAction(tabId, Boolean(response?.ok && response.painted));
}

/** Left click toggles the reading view and raises the panel; right click raises the panel alone. */
export default defineBackground(() => {
  void createMenus();

  chrome.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId === undefined) return;
    void (async (): Promise<void> => {
      try {
        await toggleReadingView(tabId);
      } catch (error) {
        console.warn('[skimgram] could not toggle the reading view', error);
        return;
      }
      await syncAction(tabId);
      // After the toggle: the panel reads the page back, so it reports the state the click produced.
      await openPanel(tab.windowId);
    })();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_SETTINGS) return;
    void openPanel(tab?.windowId);
  });

  // A navigation takes the paint away, and Chrome does not clear tab-scoped icon state by itself.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    void setAction(tabId, false);
  });

  chrome.runtime.onInstalled.addListener(() => void syncAutoScripts());
  chrome.runtime.onStartup.addListener(() => void syncAutoScripts());
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') void syncAutoScripts();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = message as Request;

    if (request.type === 'painted') {
      if (sender.tab?.id !== undefined) void syncAction(sender.tab.id);
      return false;
    }

    if (request.type !== 'auto-site') return false;

    // permissions.request() needs a user gesture, which a runtime message does not carry.
    void (async (): Promise<void> => {
      const current = await loadSettings();
      const next = request.add
        ? Array.from(new Set([...current.autoSites, request.origin]))
        : current.autoSites.filter((site) => site !== request.origin);
      sendResponse({ ok: true, settings: await saveSettings({ autoSites: next }) } satisfies Response);
    })();

    return true;
  });

  // Chromium closes the popup for the permission dialog, so an approved site may go unrecorded.
  chrome.permissions.onAdded.addListener((granted) => {
    const origins = (granted.origins ?? []).map((pattern) => pattern.replace(/\/\*$/, ''));
    if (origins.length === 0) return;

    void (async (): Promise<void> => {
      const current = await loadSettings();
      const missing = origins.filter((origin) => !current.autoSites.includes(origin));
      if (missing.length === 0) return;
      await saveSettings({ autoSites: [...current.autoSites, ...missing] });
    })();
  });
});
