// The settings panel, shared by both shells. It renders into either the popup document or a
// shadow root on a page, and knows nothing else about where it is: every action goes out
// through PanelHost, every render comes back from PanelHost.get().

import type { AnalysisStats } from '../core/scorer';
import type { Mode, Settings } from '../core/settings';
import { PANEL_CSS } from './styles';

export interface PanelState {
  settings: Settings;
  painted: boolean;
  stats: AnalysisStats | null;
  /** Why nothing was painted, if that is what happened. Feeds the footer, not the status. */
  reason: string | null;
  status: string;
  statusKind: 'info' | 'error';
  /** Empty when the shell cannot name the current site; disables the site-scoped controls. */
  origin: string;
}

export interface PanelHost {
  get(): PanelState | Promise<PanelState>;
  toggle(): void | Promise<void>;
  setMode(mode: Mode): void | Promise<void>;
  setIntensity(value: number): void | Promise<void>;
  setBasis(value: Settings['basis']): void | Promise<void>;
  setAutoSite(on: boolean): void | Promise<void>;
}

export interface PanelOptions {
  /** A popup document, or a shadow root on a page. */
  root: Document | ShadowRoot;
  /** A card floating over a page: adds the frame, the scroll cap and the close button. */
  floating?: boolean;
}

export interface PanelHandle {
  /** The shadow host, or null when the panel was rendered straight into a document. */
  element: HTMLElement | null;
  refresh(): Promise<void>;
  /** Writes the status line directly. The next refresh() replaces it from host state. */
  setStatus(text: string, kind?: 'info' | 'error'): void;
  show(): void;
  hide(): void;
}

const BASIS_HINTS: Record<string, string> = {
  auto: 'Picks contextual gain on long pages and surprisal on short ones.',
  surprisal: 'Marks what is hardest to predict — closest to measured reading time.',
  gain: 'Marks where the context failed to help, ignoring plain word rarity.',
};

const MARKUP = `
<main class="panel">
  <header>
    <h1>Skimgram</h1>
    <p class="tagline">Surprisal-based skim reading</p>
    <button id="close" class="close" type="button" aria-label="Close" hidden>&times;</button>
  </header>

  <button id="toggle" class="toggle" type="button" aria-pressed="false">
    <span>Reading view on this page</span>
    <span class="switch" aria-hidden="true"></span>
  </button>

  <p id="status" class="status" role="status"></p>

  <section>
    <h2>Emphasis</h2>
    <div class="segmented" id="mode" role="group" aria-label="Emphasis mode">
      <button type="button" data-mode="dim">Dim</button>
      <button type="button" data-mode="heat">Heat</button>
      <button type="button" data-mode="underline">Underline</button>
    </div>
    <p class="hint">Independent overlays — combine any of them, or none.</p>
  </section>

  <section>
    <h2>Intensity <output id="intensity-value">50</output></h2>
    <input id="intensity" type="range" min="0" max="100" step="5" value="50" />
  </section>

  <section>
    <h2>Score</h2>
    <select id="basis">
      <option value="auto">Auto</option>
      <option value="surprisal">Surprisal</option>
      <option value="gain">Contextual gain</option>
    </select>
    <p class="hint" id="basis-hint"></p>
  </section>

  <section>
    <label class="check">
      <input id="auto-site" type="checkbox" />
      <span>Always run on <b id="host">this site</b></span>
    </label>
    <p class="hint">Applies from the next page load on.</p>
  </section>

  <footer id="stats"></footer>
</main>
`;

export function createPanel(host: PanelHost, options: PanelOptions): PanelHandle {
  const { root, floating = false } = options;
  const body = root instanceof Document ? root.body : root;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PANEL_CSS);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  body.innerHTML = MARKUP;

  const el = <T extends HTMLElement>(selector: string): T => {
    const node = body.querySelector(selector);
    if (!node) throw new Error(`panel markup is missing ${selector}`);
    return node as T;
  };

  const panel = el<HTMLElement>('.panel');
  if (floating) panel.dataset.floating = '';

  const toggle = el<HTMLButtonElement>('#toggle');
  const status = el<HTMLParagraphElement>('#status');
  const modeGroup = el<HTMLDivElement>('#mode');
  const intensity = el<HTMLInputElement>('#intensity');
  const intensityValue = el<HTMLOutputElement>('#intensity-value');
  const basisSelect = el<HTMLSelectElement>('#basis');
  const basisHint = el<HTMLParagraphElement>('#basis-hint');
  const autoSite = el<HTMLInputElement>('#auto-site');
  const hostLabel = el<HTMLElement>('#host');
  const statsFooter = el<HTMLElement>('#stats');
  const close = el<HTMLButtonElement>('#close');
  close.hidden = !floating;

  function renderStats(stats: AnalysisStats | null, reason: string | null): void {
    if (reason) {
      statsFooter.textContent = `Nothing painted: ${reason}.`;
      return;
    }
    if (!stats) {
      statsFooter.textContent = '';
      return;
    }
    const parts = [`${stats.tokenCount.toLocaleString()} tokens`, stats.basis, `${stats.elapsedMs} ms`];
    if (stats.spread > 0) parts.push(`${stats.spread.toFixed(2)} bit spread`);
    statsFooter.textContent = parts.join('  ·  ');
  }

  async function refresh(): Promise<void> {
    const state = await host.get();
    for (const button of Array.from(modeGroup.querySelectorAll<HTMLButtonElement>('button'))) {
      button.setAttribute('aria-pressed', String(state.settings.modes.includes(button.dataset.mode as Mode)));
    }
    intensity.value = String(state.settings.intensity);
    intensityValue.value = String(state.settings.intensity);
    basisSelect.value = state.settings.basis;
    basisHint.textContent = BASIS_HINTS[state.settings.basis] ?? '';
    toggle.setAttribute('aria-pressed', String(state.painted));
    toggle.disabled = state.origin === '';
    autoSite.checked = state.origin !== '' && state.settings.autoSites.includes(state.origin);
    autoSite.disabled = state.origin === '';
    hostLabel.textContent = state.origin || 'this site';
    renderStats(state.stats, state.reason);
    status.textContent = state.status;
    status.dataset.kind = state.statusKind;
  }

  /** Every control ends in a refresh: the host owns the state, and it may have changed more than the control asked for. */
  function run(action: () => void | Promise<void>): void {
    void (async () => {
      await action();
      await refresh();
    })();
  }

  toggle.addEventListener('click', () => run(() => host.toggle()));

  modeGroup.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
    if (button) run(() => host.setMode(button.dataset.mode as Mode));
  });

  intensity.addEventListener('input', () => {
    intensityValue.value = intensity.value;
  });
  intensity.addEventListener('change', () => run(() => host.setIntensity(Number(intensity.value))));
  basisSelect.addEventListener('change', () => run(() => host.setBasis(basisSelect.value as Settings['basis'])));
  autoSite.addEventListener('change', () => run(() => host.setAutoSite(autoSite.checked)));

  const element = root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
  const handle: PanelHandle = {
    element,
    refresh,
    setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
      status.textContent = text;
      status.dataset.kind = kind;
    },
    show(): void {
      if (element) element.style.display = '';
      void refresh();
    },
    hide(): void {
      if (element) element.style.display = 'none';
    },
  };

  close.addEventListener('click', () => handle.hide());
  void refresh();
  return handle;
}
