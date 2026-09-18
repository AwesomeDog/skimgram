// The panel stylesheet, shared by both shells. It has to work in two places: the popup
// document, where :root matches, and a shadow root on a page, where :host does. Kept as a
// string so both can install it with adoptedStyleSheets, which a strict page CSP allows.

export const PANEL_CSS = `
:host,
:root {
  --bg: #16181d;
  --panel: #1e2128;
  --line: #2c3038;
  --text: #e7e9ee;
  --muted: #969cab;
  --accent: #6ea8fe;
  --accent-strong: #3d8bfd;
  color-scheme: dark;
}

@media (prefers-color-scheme: light) {
  :host,
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --line: #e2e5ea;
    --text: #1b1e24;
    --muted: #6b7280;
    --accent: #2563eb;
    --accent-strong: #1d4ed8;
    color-scheme: light;
  }
}

* {
  box-sizing: border-box;
}

.panel {
  width: 300px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.panel[data-floating] {
  max-height: calc(100vh - 32px);
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

header {
  position: relative;
}

header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.tagline {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.close {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  background: var(--line);
  color: var(--text);
}

section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

h2 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel);
  color: inherit;
  font: inherit;
  font-weight: 550;
  cursor: pointer;
}

.toggle:hover {
  border-color: var(--accent);
}

.toggle:disabled {
  cursor: default;
  opacity: 0.55;
}

.switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--line);
  transition: background 0.15s;
}

.switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  transition: transform 0.15s;
}

.toggle[aria-pressed="true"] .switch {
  background: var(--accent-strong);
}

.toggle[aria-pressed="true"] .switch::after {
  transform: translateX(14px);
  background: #fff;
}

.status {
  margin: -6px 0 0;
  min-height: 16px;
  font-size: 11.5px;
  color: var(--muted);
}

.status[data-kind="error"] {
  color: #f87171;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel);
}

.segmented button {
  padding: 6px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}

.segmented button[aria-pressed="true"] {
  background: var(--accent-strong);
  color: #fff;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--accent-strong);
}

output {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

select {
  padding: 7px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: inherit;
  font: inherit;
}

.hint {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  cursor: pointer;
}

.check b {
  font-weight: 600;
}

footer {
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

footer:empty {
  display: none;
}
`.trim();
