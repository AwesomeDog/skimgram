// Kept as a TS string because insertCSS is exempt from the page CSP. Everything uses opacity
// and currentColor so painting works on light and dark pages alike, and every selector is
// scoped under html[data-skimgram-mode~="..."] to win without !important. The attribute is a
// token list, so ~= makes any combination of modes simply the union of the rules below.

const SKIMGRAM_STYLE_ID = 'skimgram-styles';
export const SPAN_CLASS = 'skimgram-t';
export const LEVEL_ATTR = 'data-sk';

export const MODE_ATTR = 'data-skimgram-mode';

/** One red hue, alpha only; 0.42 is the ceiling that keeps light-on-dark type readable. */
const HEAT_RGB = '255, 71, 64';
const HEAT_ALPHA_MILD = 0.18;
const HEAT_ALPHA_STRONG = 0.42;

const heat = (level: 1 | 2, alpha: number): string =>
  `html[${MODE_ATTR}~="heat"] .${SPAN_CLASS}[${LEVEL_ATTR}="${level}"]` +
  `{background:rgba(${HEAT_RGB},${alpha});border-radius:2px}`;

export const SKIMGRAM_CSS = `
.${SPAN_CLASS}{display:inline;box-decoration-break:clone}

/* --- heat: one red hue, intensity carried by alpha alone --- */
${heat(1, HEAT_ALPHA_MILD)}
${heat(2, HEAT_ALPHA_STRONG)}

/* --- underline: mark the surprises, leave the weight alone --- */
html[${MODE_ATTR}~="underline"] .${SPAN_CLASS}[${LEVEL_ATTR}="1"]{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
html[${MODE_ATTR}~="underline"] .${SPAN_CLASS}[${LEVEL_ATTR}="2"]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px;font-weight:600}

/* --- dim: the fade lives here only, so other modes leave predictable words alone;
       last, so its font-weight beats underline's 600 --- */
html[${MODE_ATTR}~="dim"] .${SPAN_CLASS}[${LEVEL_ATTR}="-1"]{opacity:.62}
html[${MODE_ATTR}~="dim"] .${SPAN_CLASS}[${LEVEL_ATTR}="-2"]{opacity:.34}
html[${MODE_ATTR}~="dim"] .${SPAN_CLASS}[${LEVEL_ATTR}="1"]{font-weight:600}
html[${MODE_ATTR}~="dim"] .${SPAN_CLASS}[${LEVEL_ATTR}="2"]{font-weight:700}
`.trim();

export function ensureStyles(doc: Document): void {
  if (doc.getElementById(SKIMGRAM_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = SKIMGRAM_STYLE_ID;
  style.textContent = SKIMGRAM_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
