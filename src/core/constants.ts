// Shared by panel, worker and injected script. Kept out of background.ts so importing them
// does not pull the background definition into those bundles.

/** Name of the injected bundle, relative to the extension root. */
export const INJECT_FILE = 'inject.js';

/** Relative to the extension root. */
export const PANEL_FILE = 'settings.html';

export const AUTO_SCRIPT_ID = 'skimgram-auto';

export const MENU_SETTINGS = 'skimgram-settings';
