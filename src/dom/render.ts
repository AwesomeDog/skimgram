// Painting levels onto the DOM and taking them off again. The only mutation is swapping a
// text node for text plus <span> wrappers - never innerHTML - so listeners, framework state
// and selection anchors survive. clear() has to be lossless.

import type { Token } from '../core/tokenizer';
import type { TextRun } from './walker';
import { LEVEL_ATTR, SPAN_CLASS } from './styles';

/** Spans and text nodes only, never innerHTML, so listeners and selection survive. */
export function paint(runs: readonly TextRun[], tokens: readonly Token[], levels: Int8Array): number {
  let created = 0;
  let cursor = 0;

  for (const run of runs) {
    const data = run.node.nodeValue;
    if (data === null) continue;

    const runStart = run.flatStart;
    const runEnd = runStart + data.length;

    while (cursor < tokens.length && (tokens[cursor] as Token).end <= runStart) cursor++;

    const local: Array<{ token: Token; index: number }> = [];
    let scan = cursor;
    while (scan < tokens.length && (tokens[scan] as Token).start < runEnd) {
      local.push({ token: tokens[scan] as Token, index: scan });
      scan++;
    }
    if (local.length === 0) continue;

    const frag = run.node.ownerDocument.createDocumentFragment();
    let at = runStart;

    for (const { token, index } of local) {
      const from = Math.max(token.start, runStart);
      const to = Math.min(token.end, runEnd);
      if (to <= from) continue;

      if (from > at) frag.append(data.slice(at - runStart, from - runStart));

      const slice = data.slice(from - runStart, to - runStart);
      const level = levels[index] ?? 0;
      if (level !== 0) {
        const span = run.node.ownerDocument.createElement('span');
        span.className = SPAN_CLASS;
        span.setAttribute(LEVEL_ATTR, String(level));
        span.textContent = slice;
        frag.append(span);
        created++;
      } else {
        frag.append(slice);
      }
      at = to;
    }

    if (at < runEnd) frag.append(data.slice(at - runStart));

    run.node.parentNode?.replaceChild(frag, run.node);
  }

  return created;
}

/** Returns the number of spans unwrapped; the document must come back byte-identical. */
export function clear(doc: Document): number {
  const spans = Array.from(doc.querySelectorAll(`span.${SPAN_CLASS}`));
  if (spans.length === 0) return 0;

  const parents = new Set<Element>();
  for (const span of spans) {
    const parent = span.parentElement;
    span.replaceWith(span.textContent ?? '');
    if (parent) parents.add(parent);
  }

  for (const parent of parents) parent.normalize();

  return spans.length;
}

export function isPainted(doc: Document): boolean {
  return doc.querySelector(`span.${SPAN_CLASS}`) !== null;
}
