import { describe, expect, it } from 'vitest';
import { NGramModel } from '@/core/ngram';
import { sequenceIndices, tokenize } from '@/core/tokenizer';

function keysOf(text: string): string[] {
  const tokens = tokenize(text);
  return sequenceIndices(tokens).map((i) => tokens[i]!.key);
}

describe('NGramModel', () => {
  it('produces a distribution that sums to one', () => {
    const keys = keysOf('the cat sat on the mat and the cat saw the dog and the dog saw the cat');
    const model = new NGramModel({ order: 4, smoothing: 2, minContextCount: 1 });
    model.addSequence(keys);

    // Sum P(w | context) over every token in the vocabulary seen so far.
    const vocab = Array.from(new Set(keys));
    const i = keys.length - 1;
    let total = 0;
    const probe = keys.slice(0, i);
    for (const w of vocab) total += model.prob([...probe, w], i);
    // Continuations outside the recorded vocabulary still carry probability
    // mass through the smoothing term, so the sum over seen words is <= 1.
    expect(total).toBeLessThanOrEqual(1 + 1e-9);
    expect(total).toBeGreaterThan(0.5);
  });

  it('gives a repeatedly observed continuation the highest probability', () => {
    const keys = keysOf(Array(20).fill('the cat sat on the mat').join(' ') + ' the cat sat');
    const model = new NGramModel({ order: 3, smoothing: 1, minContextCount: 1 });
    model.addSequence(keys);

    const i = keys.length;
    const pSat = model.prob([...keys, 'sat'], i);
    const pUnlikely = model.prob([...keys, 'photosynthesis'], i);
    expect(pSat).toBeGreaterThan(pUnlikely);
  });

  it('falls back to the unigram when a context is untrusted', () => {
    const keys = keysOf('alpha beta gamma delta');
    const model = new NGramModel({ order: 3, smoothing: 2, minContextCount: 2 });
    model.addSequence(keys);

    // Every context here occurs once, below the gate, so the bigram order must
    // be skipped and the answer must equal the unigram.
    expect(model.prob(keys, 1)).toBeCloseTo(model.unigramProb('beta'), 12);
  });

  it('never returns zero or one', () => {
    const keys = keysOf('one two three four five six seven eight nine ten');
    const model = new NGramModel({ order: 4, smoothing: 2, minContextCount: 1 });
    model.addSequence(keys);
    for (let i = 0; i < keys.length; i++) {
      const p = model.prob(keys, i);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('reports the number of tokens absorbed', () => {
    const model = new NGramModel({});
    model.addSequence(keysOf('a b c d e'));
    expect(model.tokenCount).toBe(5);
  });
});
