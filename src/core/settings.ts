// User settings, persisted in chrome.storage.sync. This is the extension's whole state:
// no account, no backend, no telemetry.

import type { Basis } from './scorer';

export const MODES = ['dim', 'heat', 'underline'] as const;

export type Mode = (typeof MODES)[number];

export interface Settings {
  /** Independent overlays, not alternatives: any subset can be on; empty marks nothing. */
  modes: Mode[];
  /** 0..100; how much of the page gets marked. */
  intensity: number;
  /** What the score measures. `auto` is almost always right. */
  basis: Basis;
  /** Pages with fewer sequence tokens than this are left alone. */
  minTokens: number;
  /** Origin patterns (e.g. `https://example.com/*`) that run automatically. */
  autoSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  modes: ['dim', 'heat'],
  intensity: 50,
  basis: 'auto',
  minTokens: 80,
  autoSites: [],
};

const KEY = 'skimgram.settings';

/** Keeps a canonical order, and still accepts the single string that stored modes used to be. */
function readModes(raw: unknown): Mode[] {
  if (Array.isArray(raw)) return MODES.filter((m) => raw.includes(m));
  if (typeof raw === 'string') return MODES.filter((m) => m === raw);
  return DEFAULT_SETTINGS.modes;
}

/** Toggle, not select: re-filtering MODES keeps the stored order canonical. */
export function toggleMode(modes: Mode[], mode: Mode): Mode[] {
  return modes.includes(mode)
    ? modes.filter((m) => m !== mode)
    : MODES.filter((m) => m === mode || modes.includes(m));
}

/** Exported so a shell can back the settings with storage of its own. */
export function normalize(raw: unknown): Settings {
  const stored = (raw ?? {}) as Partial<Settings> & { mode?: unknown };
  const intensity = typeof stored.intensity === 'number' ? stored.intensity : DEFAULT_SETTINGS.intensity;
  return {
    modes: readModes(stored.modes ?? stored.mode),
    intensity: Math.max(0, Math.min(100, Math.round(intensity))),
    basis: stored.basis ?? DEFAULT_SETTINGS.basis,
    minTokens: typeof stored.minTokens === 'number' ? stored.minTokens : DEFAULT_SETTINGS.minTokens,
    autoSites: Array.isArray(stored.autoSites) ? stored.autoSites.filter((s) => typeof s === 'string') : [],
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return normalize(stored[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalize({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(KEY in changes)) return;
    callback(normalize(changes[KEY]?.newValue));
  });
}
