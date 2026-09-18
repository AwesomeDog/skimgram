import { describe, expect, it } from 'vitest';
import { analyze, blendWeight } from '@/core/scorer';
import { iqr, percentileRank, smooth, toLevels } from '@/core/normalize';

/** A paragraph long enough that the page model actually has statistics. */
const BASE = `The committee reviewed the proposal and the committee approved the proposal
in the morning. The committee reviewed the proposal again in the afternoon, and
the committee approved the proposal once more before the evening. Every member
of the committee reviewed the proposal, and every member of the committee
approved the proposal. The proposal was reviewed by the committee and the
proposal was approved by the committee.`;

const LONG = Array(12).fill(BASE).join(' ');

const OPTIONS = { basis: 'auto', intensity: 50, minTokens: 80 } as const;

describe('blendWeight', () => {
  it('leans on the prior for short pages and on the page for long ones', () => {
    expect(blendWeight(100)).toBeGreaterThan(blendWeight(6000));
    expect(blendWeight(100)).toBe(0.55);
    expect(blendWeight(20000)).toBe(0.08);
  });
});

describe('percentileRank', () => {
  it('maps the smallest value to 0 and the largest to 1', () => {
    const ranks = percentileRank([1, 2, 3, 4, 5]);
    expect(ranks[0]).toBe(0);
    expect(ranks[4]).toBe(1);
  });

  it('gives tied values the same rank', () => {
    const ranks = percentileRank([5, 5, 1]);
    expect(ranks[0]).toBe(ranks[1]);
    expect(ranks[0]).toBeGreaterThan(ranks[2]!);
  });

  it('survives a single-element input', () => {
    expect(percentileRank([42])[0]).toBe(0.5);
  });
});

describe('smooth', () => {
  it('pulls an isolated spike toward its neighbours', () => {
    const values = Float64Array.from([0, 0, 1, 0, 0]);
    const out = smooth(values);
    expect(out[2]!).toBeLessThan(1);
    expect(out[2]!).toBeGreaterThan(0);
    expect(out[0]!).toBeGreaterThan(0);
  });

  it('leaves a flat series flat', () => {
    const out = smooth(Float64Array.from([0.5, 0.5, 0.5, 0.5]));
    for (const v of out) expect(v).toBeCloseTo(0.5, 12);
  });
});

describe('toLevels', () => {
  it('marks nothing at intensity 0', () => {
    const levels = toLevels(Float64Array.from([0.49, 0, -0.49]), 0);
    expect(Array.from(levels)).toEqual([0, 0, 0]);
  });

  it('marks more as intensity rises', () => {
    const values = Float64Array.from(Array.from({ length: 101 }, (_, i) => i / 100 - 0.5));
    const low = toLevels(values, 20).filter((l) => l !== 0).length;
    const high = toLevels(values, 90).filter((l) => l !== 0).length;
    expect(high).toBeGreaterThan(low);
  });
});

describe('iqr', () => {
  it('is zero for a constant series', () => {
    expect(iqr(Float64Array.from([1, 1, 1, 1]))).toBe(0);
  });
});

describe('analyze', () => {
  it('skips pages that are too short', () => {
    const result = analyze('One short sentence is not enough to score.', OPTIONS);
    expect('skipped' in result).toBe(true);
  });

  it('produces levels across the whole range on a real page', () => {
    const result = analyze(LONG, OPTIONS);
    expect('skipped' in result).toBe(false);
    if ('skipped' in result) return;

    const used = new Set(Array.from(result.levels));
    expect(used.size).toBeGreaterThan(1);
    expect(Math.max(...Array.from(result.levels))).toBeGreaterThan(0);
    expect(Math.min(...Array.from(result.levels))).toBeLessThan(0);

    expect(result.stats.tokenCount).toBeGreaterThan(600);
    expect(result.stats.basis).toBe('gain');
    expect(result.stats.spread).toBeGreaterThan(0.25);
  });

  it('gives a word the reader cannot have predicted a stronger mark than boilerplate', () => {
    const result = analyze(`${LONG} xylophone walnut`, OPTIONS);
    expect('skipped' in result).toBe(false);
    if ('skipped' in result) return;

    const levelOf = (word: string): number => {
      const token = result.tokens.find((t) => t.key === word);
      return token ? result.levels[result.tokens.indexOf(token)] ?? 0 : 0;
    };

    // "the" is the most predictable token on any English page; the two injected
    // words have never been seen before in any context.
    const boilerplate = levelOf('the');
    const novel = Math.max(levelOf('xylophone'), levelOf('walnut'));
    expect(novel).toBeGreaterThan(boilerplate);
  });

  it('only assigns levels to scoreable tokens', () => {
    const result = analyze(LONG, OPTIONS);
    if ('skipped' in result) return;
    for (let i = 0; i < result.tokens.length; i++) {
      if (!result.tokens[i]!.scoreable) expect(result.levels[i]).toBe(0);
    }
  });

  it('handles Chinese text without any word segmentation', () => {
    const paragraph =
      '研究团队在会议上讨论了这一方案，研究团队在会议上批准了这一方案。' +
      '每一次会议上，研究团队都会讨论这一方案，也会批准这一方案。';
    const result = analyze(Array(40).fill(paragraph).join(''), OPTIONS);
    expect('skipped' in result).toBe(false);
    if ('skipped' in result) return;
    expect(result.stats.tokenCount).toBeGreaterThan(600);
    expect(result.stats.spread).toBeGreaterThan(0.25);
  });
});
