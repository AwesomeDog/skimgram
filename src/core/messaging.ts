// Protocol between panel, worker and injected script. The script is not always running, so
// a failed send means "not injected yet", not an error. `painted` runs the other way, from
// the page up, because only the page knows whether it is painted.

import type { AnalysisStats } from './scorer';
import type { Settings } from './settings';

export type Request =
  | { type: 'ping' }
  | { type: 'apply'; settings: Settings }
  | { type: 'clear' }
  | { type: 'stats' }
  | { type: 'painted'; painted: boolean }
  | { type: 'auto-site'; add: boolean; origin: string };

export type Response =
  | { ok: true; painted?: boolean; stats?: AnalysisStats | null; reason?: string; settings?: Settings }
  | { ok: false; error: string };

/** Null means nothing is listening, which is the normal state for a tab we have not injected into. */
export async function toTab(tabId: number, request: Request): Promise<Response | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request)) as Response | null;
  } catch {
    return null;
  }
}

export function toBackground(request: Request): Promise<Response> {
  return chrome.runtime.sendMessage(request) as Promise<Response>;
}
