// Flattens the page into one string plus a table of where each text node landed in it, so
// scoring runs on the string while render.ts paints the original nodes. Read-only: a reader
// extension that corrupts the page is worse than no extension at all.

import { RUN_SEPARATOR } from '../core/tokenizer';

/** Elements whose text is never prose and must never be rewritten. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'SVG',
  'MATH',
  'CANVAS',
  'SELECT',
]);

const SKIP_SELECTOR = '[contenteditable=""], [contenteditable="true"], [aria-hidden="true"]';

/** Hard ceiling: past this the statistics stop improving but the tokenising cost does not. */
const MAX_CHARS = 400_000;

export interface TextRun {
  node: Text;
  /** Offset of `node.data` inside the flattened string. */
  flatStart: number;
}

export interface PageText {
  text: string;
  runs: TextRun[];
}

function shouldSkip(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest(SKIP_SELECTOR)) return true;
  return false;
}

/** Read-only flattening; whitespace-only nodes are dropped, the run separator keeps neighbours apart. */
export function collectText(root: ParentNode): PageText {
  const runs: TextRun[] = [];
  const parts: string[] = [];
  let offset = 0;

  const walker = (root.ownerDocument ?? (root as Document)).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Text): number {
        const data = node.nodeValue;
        if (!data || !data.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const data = node.nodeValue as string;

    if (runs.length > 0) {
      parts.push(RUN_SEPARATOR);
      offset += RUN_SEPARATOR.length;
    }

    runs.push({ node, flatStart: offset });
    parts.push(data);
    offset += data.length;

    if (offset >= MAX_CHARS) break;
  }

  return { text: parts.join(''), runs };
}
