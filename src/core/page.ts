// Driving a tab from an extension surface. Button, panel and worker must agree on how to
// inject, apply and clear, so the sequence lives here - and in a shape the service worker
// can import, since it has no document.

import { INJECT_FILE } from './constants';
import { toTab, type Response } from './messaging';
import { loadSettings, type Settings } from './settings';
import { SKIMGRAM_CSS } from '../dom/styles';

/** insertCSS rather than a <style> tag: it bypasses the page's Content-Security-Policy. */
export async function ensureInjected(tabId: number): Promise<void> {
  const pong = await toTab(tabId, { type: 'ping' });
  if (pong?.ok) return;

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, css: SKIMGRAM_CSS });
  } catch {
    // Non-fatal: the injected script installs the same rules itself.
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: [INJECT_FILE] });
}

export async function applySettings(tabId: number, settings: Settings): Promise<Response | null> {
  await ensureInjected(tabId);
  return toTab(tabId, { type: 'apply', settings });
}

export async function readStats(tabId: number): Promise<Response | null> {
  return toTab(tabId, { type: 'stats' });
}

export async function clearPage(tabId: number): Promise<void> {
  await toTab(tabId, { type: 'clear' });
}

/** The tab is asked, not a flag: the page can paint itself, and the button must match what is on screen. */
export async function toggleReadingView(tabId: number, settings?: Settings): Promise<boolean> {
  const current = await readStats(tabId);
  if (current?.ok && current.painted) {
    await clearPage(tabId);
    return false;
  }
  const response = await applySettings(tabId, settings ?? (await loadSettings()));
  return Boolean(response?.ok && response.painted);
}
