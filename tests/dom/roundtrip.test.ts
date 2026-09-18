import { beforeEach, describe, expect, it } from 'vitest';
import { analyze } from '@/core/scorer';
import { clear, isPainted, paint } from '@/dom/render';
import { collectText } from '@/dom/walker';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('collectText', () => {
  it('skips non-prose elements', () => {
    setBody('<p>Hello world</p><pre>do not touch me</pre><script>x=1</script>');
    const { text } = collectText(document.body);
    expect(text).toContain('Hello world');
    expect(text).not.toContain('do not touch');
    expect(text).not.toContain('x=1');
  });

  it('skips editable and hidden subtrees', () => {
    setBody('<p>visible</p><div contenteditable="true">editing</div><div aria-hidden="true">hidden</div>');
    const { text } = collectText(document.body);
    expect(text).toContain('visible');
    expect(text).not.toContain('editing');
    expect(text).not.toContain('hidden');
  });

  it('records offsets that index correctly into the flattened string', () => {
    setBody('<p>alpha</p><p>beta gamma</p>');
    const { text, runs } = collectText(document.body);
    for (const run of runs) {
      expect(text.slice(run.flatStart, run.flatStart + (run.node.nodeValue?.length ?? 0))).toBe(
        run.node.nodeValue,
      );
    }
  });
});

describe('paint / clear', () => {
  beforeEach(() => {
    setBody('<article><p>Hello world, this is a test of the round trip.</p></article>');
  });

  function runOnce(): number {
    const { text, runs } = collectText(document.body);
    const result = analyze(text, { basis: 'surprisal', intensity: 90, minTokens: 5 });
    if ('skipped' in result) throw new Error(`unexpected skip: ${result.reason}`);
    return paint(runs, result.tokens, result.levels);
  }

  it('wraps tokens in spans', () => {
    const created = runOnce();
    expect(created).toBeGreaterThan(0);
    expect(isPainted(document)).toBe(true);
  });

  it('is lossless: clearing restores the original text exactly', () => {
    const before = document.body.innerHTML;
    runOnce();
    expect(document.body.innerHTML).not.toBe(before);

    clear(document);
    expect(document.body.innerHTML).toBe(before);
    expect(isPainted(document)).toBe(false);
  });

  it('does not lose non-text elements', () => {
    setBody(
      '<p>one <strong>two</strong> three <em>four</em> photosynthesis xylophone walnut</p>',
    );
    const before = document.body.innerHTML;
    runOnce();
    clear(document);
    expect(document.body.innerHTML).toBe(before);
  });

  it('is idempotent under repeated paint cycles', () => {
    const before = document.body.innerHTML;
    runOnce();
    runOnce();
    runOnce();
    clear(document);
    expect(document.body.innerHTML).toBe(before);
  });

  it('reports zero when there is nothing to clear', () => {
    expect(clear(document)).toBe(0);
  });
});
