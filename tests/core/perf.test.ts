import { describe, expect, it } from 'vitest';
import { analyze } from '@/core/scorer';

// Not correctness - a guard against the pipeline getting slow. The analysis is synchronous,
// so anything measured here is time the tab is blocked. Budgets are generous on purpose.
function makePage(words: number): string {
  const vocab = Array.from({ length: 1200 }, (_unused, i) => 'term' + String(i));
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    out.push(vocab[Math.floor(Math.abs(Math.sin(i) * 10000) % vocab.length)] as string);
    if (i % 12 === 0) out.push('the');
    if (i % 97 === 0) out.push('.');
  }
  return out.join(' ');
}

describe('performance', () => {
  it.each([2000, 10000, 40000])('scores a %i-word page within budget', (words) => {
    const text = makePage(words);
    const started = performance.now();
    const result = analyze(text, { basis: 'auto', intensity: 50, minTokens: 80 });
    const elapsed = performance.now() - started;
    console.log(`${words} words -> ${elapsed.toFixed(1)} ms`);
    expect('skipped' in result).toBe(false);
    expect(elapsed).toBeLessThan(1500);
  });

  it('scores a Chinese page of comparable size within budget', () => {
    // Drawn pseudo-randomly from a realistic pool: a short repeating cycle
    // would make every context deterministic and the scorer would rightly
    // report the page as statistically flat.
    const chars =
      '研究团队在会议上讨论了这一方案并且批准了数据分析结果报告的内容我们在记录中看到的结论';
    let text = '';
    for (let i = 0; i < 20000; i++) {
      text += chars[Math.floor(Math.abs(Math.sin(i * 12.9898) * 43758.5453) % chars.length)] as string;
    }
    const started = performance.now();
    const result = analyze(text, { basis: 'auto', intensity: 50, minTokens: 80 });
    const elapsed = performance.now() - started;
    console.log(`20000 CJK chars -> ${elapsed.toFixed(1)} ms`);
    expect('skipped' in result).toBe(false);
    expect(elapsed).toBeLessThan(2500);
  });
});
