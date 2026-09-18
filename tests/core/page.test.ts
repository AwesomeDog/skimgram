// The toggle decision: given a tab in an unknown state, which way does the reading view flip?

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPage, toggleReadingView } from '@/core/page';

interface FakeTab {
  injected: boolean;
  painted: boolean;
}

let tab: FakeTab;
/** Every side effect that touched the page, in order. */
let trace: string[];

function stubChrome(): void {
  vi.stubGlobal('chrome', {
    tabs: {
      sendMessage: async (_tabId: number, request: { type: string }) => {
        // A tab without our script has no receiver, which is exactly what
        // Chrome does: the promise rejects and `toTab` turns it into null.
        if (!tab.injected) throw new Error('Could not establish connection.');
        switch (request.type) {
          case 'ping':
          case 'stats':
            return { ok: true, painted: tab.painted };
          case 'apply':
            trace.push('apply');
            tab.painted = true;
            return { ok: true, painted: true };
          case 'clear':
            trace.push('clear');
            tab.painted = false;
            return { ok: true, painted: false };
          default:
            return { ok: false, error: `unknown request: ${request.type}` };
        }
      },
    },
    scripting: {
      insertCSS: async () => undefined,
      executeScript: async () => {
        trace.push('inject');
        tab.injected = true;
        return [];
      },
    },
    storage: {
      sync: { get: async () => ({}) },
    },
  });
}

describe('toggleReadingView', () => {
  beforeEach(() => {
    tab = { injected: false, painted: false };
    trace = [];
    stubChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects and paints a tab that was never touched', async () => {
    expect(await toggleReadingView(7)).toBe(true);
    expect(trace).toEqual(['inject', 'apply']);
  });

  it('turns the reading view off when it is already painted', async () => {
    tab = { injected: true, painted: true };
    expect(await toggleReadingView(7)).toBe(false);
    expect(trace).toEqual(['clear']);
  });

  it('analyses again without re-injecting when the earlier run was skipped', async () => {
    // The script can be present and unpainted: the page was too short, or its
    // scores were flat. That is still "off", so the toggle must paint it — and
    // must not pay for a second injection to do so.
    tab = { injected: true, painted: false };
    expect(await toggleReadingView(7)).toBe(true);
    expect(trace).toEqual(['apply']);
  });

  it('recovers when the script was lost, so a stale "on" cannot wedge it', async () => {
    // A navigation drops the injected script. Asking the tab is what keeps this
    // from being a toggle that only ever turns itself on.
    tab = { injected: false, painted: false };
    await toggleReadingView(7);
    tab.injected = false;
    expect(await toggleReadingView(7)).toBe(true);
    expect(trace).toEqual(['inject', 'apply', 'inject', 'apply']);
  });

  it('reports off when the page refuses to be painted', async () => {
    tab = { injected: true, painted: false };
    vi.stubGlobal('chrome', {
      ...(globalThis.chrome as object),
      tabs: { sendMessage: async () => ({ ok: true, painted: false, reason: 'too few tokens' }) },
    });
    expect(await toggleReadingView(7)).toBe(false);
  });
});

describe('clearPage', () => {
  beforeEach(() => {
    tab = { injected: false, painted: false };
    trace = [];
    stubChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op on a tab that was never injected', async () => {
    await expect(clearPage(7)).resolves.toBeUndefined();
    expect(trace).toEqual([]);
  });
});
