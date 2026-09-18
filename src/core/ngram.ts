// Hierarchical Dirichlet smoothing instead of Stupid Backoff: each order uses the one
// below as a prior, so P sums to 1 and unseen contexts fall back by themselves.
// `smoothing` is the prior strength. Contexts seen fewer than `minContextCount` times
// are skipped rather than smoothed - one observation is a coincidence, not evidence.

const SEP = '\u0000';

export interface NGramOptions {
  /** Highest n; 4 means trigram contexts. */
  order?: number;
  smoothing?: number;
  minContextCount?: number;
}

const DEFAULT_ORDER = 4;
const DEFAULT_SMOOTHING = 2;
const DEFAULT_MIN_CONTEXT_COUNT = 2;

export class NGramModel {
  readonly order: number;
  readonly smoothing: number;
  readonly minContextCount: number;

  private contexts = new Map<string, number>();
  private unigrams = new Map<string, number>();
  private total = 0;

  constructor(options: NGramOptions = {}) {
    this.order = options.order ?? DEFAULT_ORDER;
    this.smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
    this.minContextCount = options.minContextCount ?? DEFAULT_MIN_CONTEXT_COUNT;
  }

  // maxTokens is for tests only: the fit must cover the whole page, or gain collapses past it.
  addSequence(keys: readonly string[], maxTokens = Number.POSITIVE_INFINITY): void {
    const limit = Math.min(keys.length, maxTokens);
    const maxContext = this.order - 1;

    for (let i = 0; i < limit; i++) {
      const w = keys[i] as string;
      this.unigrams.set(w, (this.unigrams.get(w) ?? 0) + 1);
      this.total++;

      for (let k = 1; k <= maxContext && i - k >= 0; k++) {
        let ctx = keys[i - k] as string;
        for (let j = i - k + 1; j < i; j++) ctx += SEP + keys[j];
        this.contexts.set(ctx, (this.contexts.get(ctx) ?? 0) + 1);
        this.contexts.set(ctx + SEP + w, (this.contexts.get(ctx + SEP + w) ?? 0) + 1);
      }
    }
  }

  get tokenCount(): number {
    return this.total;
  }

  unigramProb(w: string): number {
    const c = this.unigrams.get(w) ?? 0;
    return (c + this.smoothing) / (this.total + this.smoothing * (this.unigrams.size + 1));
  }

  // P(keys[i] | left context). Walks up from the unigram, using the previous level as
  // the prior, and stops once a context is too sparse to trust.
  prob(keys: readonly string[], i: number): number {
    let p = this.unigramProb(keys[i] as string);
    const maxContext = Math.min(this.order - 1, i);
    const w = keys[i] as string;

    for (let k = 1; k <= maxContext; k++) {
      let ctx = keys[i - k] as string;
      for (let j = i - k + 1; j < i; j++) ctx += SEP + keys[j];

      const cCtx = this.contexts.get(ctx) ?? 0;
      if (cCtx < this.minContextCount) break;

      const cFull = this.contexts.get(ctx + SEP + w) ?? 0;
      p = (cFull + this.smoothing * p) / (cCtx + this.smoothing);
    }

    return p;
  }
}
