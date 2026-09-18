import { describe, expect, it } from 'vitest';
import { sequenceIndices, tokenize } from '@/core/tokenizer';

describe('tokenize', () => {
  it('tiles the input exactly, with correct offsets', () => {
    const text = 'Hello, 世界! 2024 — don’t stop.';
    const tokens = tokenize(text);
    let at = 0;
    for (const token of tokens) {
      expect(token.start).toBe(at);
      expect(text.slice(token.start, token.end)).toBe(token.text);
      at = token.end;
    }
    expect(at).toBe(text.length);
  });

  it('splits CJK into single characters', () => {
    const tokens = tokenize('今天天气不错');
    expect(tokens).toHaveLength(6);
    expect(tokens.every((t) => t.kind === 'cjk')).toBe(true);
    expect(tokens.map((t) => t.text)).toEqual(['今', '天', '天', '气', '不', '错']);
  });

  it('keeps Latin words whole, including apostrophes and hyphens', () => {
    const tokens = tokenize("don't well-known it's");
    expect(tokens.filter((t) => t.kind === 'word').map((t) => t.text)).toEqual([
      "don't",
      'well-known',
      "it's",
    ]);
  });

  it('does not let trailing punctuation ride along with a word', () => {
    const tokens = tokenize('quoted, —dash');
    expect(tokens.filter((t) => t.kind === 'word').map((t) => t.text)).toEqual(['quoted', 'dash']);
  });

  it('classifies digits separately from words', () => {
    const tokens = tokenize('3D printing in 2024');
    const byKind = tokens.map((t) => `${t.kind}:${t.text}`);
    expect(byKind).toEqual(['word:3D', 'space: ', 'word:printing', 'space: ', 'word:in', 'space: ', 'number:2024']);
  });

  it('treats fullwidth punctuation as punctuation, not as prose', () => {
    const tokens = tokenize('你好，世界。');
    expect(tokens.filter((t) => t.kind === 'punct').map((t) => t.text)).toEqual(['，', '。']);
    expect(tokens.filter((t) => t.kind === 'cjk').map((t) => t.text)).toEqual(['你', '好', '世', '界']);
  });

  it('case-folds keys but preserves the original text', () => {
    const tokens = tokenize('The THE the');
    expect(tokens.filter((t) => t.kind === 'word').map((t) => t.key)).toEqual(['the', 'the', 'the']);
    expect(tokens.filter((t) => t.kind === 'word').map((t) => t.text)).toEqual(['The', 'THE', 'the']);
  });

  it('handles every script without throwing', () => {
    for (const text of ['Привет мир', 'مرحبا بالعالم', 'こんにちは世界', '안녕하세요', '']) {
      expect(() => tokenize(text)).not.toThrow();
    }
    expect(tokenize('')).toEqual([]);
  });
});

describe('sequenceIndices', () => {
  it('drops whitespace but keeps punctuation', () => {
    const tokens = tokenize('a b, c');
    const seq = sequenceIndices(tokens).map((i) => tokens[i]!.text);
    expect(seq).toEqual(['a', 'b', ',', 'c']);
  });
});
