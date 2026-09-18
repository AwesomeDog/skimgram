// Text in, per-token emphasis levels out. Every token blends a built-in unigram prior
// with an n-gram model fitted on this page, which is what stops a repeated term from
// staying surprising. `lambda` slides with page length: short pages lean on the prior.

import { builtinProbability, MIN_PROBABILITY } from './builtin';
import { NGramModel } from './ngram';
import { iqr, percentileRank, smooth, toLevels } from './normalize';
import { sequenceIndices, tokenize, type Token } from './tokenizer';

// surprisal = -log2 P(token | context): tracks reading time, but rewards plain rarity.
// gain = surprisal_unigram - surprisal_context, so expected-in-context terms drop out.
// auto takes gain once the page has real statistics, surprisal otherwise.
export type Basis = 'auto' | 'surprisal' | 'gain';

const GAIN_MIN_TOKENS = 600;

/** Below this spread the page is flat and not worth painting. */
const MIN_SPREAD_BITS = 0.25;

export interface AnalyzeOptions {
  basis: Basis;
  intensity: number;
  /** Pages shorter than this are not analysed at all. */
  minTokens: number;
}

export interface AnalysisStats {
  tokenCount: number;
  basis: Extract<Basis, 'surprisal' | 'gain'>;
  /** Interquartile range of the raw scores, in bits. */
  spread: number;
  elapsedMs: number;
}

export interface Analysis {
  tokens: Token[];
  /** Level per token index, -2..2. Zero for tokens that are not scoreable. */
  levels: Int8Array;
  stats: AnalysisStats;
}

export interface Skip {
  skipped: true;
  reason: string;
  stats: Pick<AnalysisStats, 'tokenCount' | 'elapsedMs'>;
}

export type AnalysisResult = Analysis | Skip;

// 0.55 for a few hundred tokens, sliding to 0.08 once there are thousands.
export function blendWeight(tokenCount: number): number {
  const SHORT = 400;
  const LONG = 6000;
  if (tokenCount <= SHORT) return 0.55;
  if (tokenCount >= LONG) return 0.08;
  const t = Math.log(tokenCount / SHORT) / Math.log(LONG / SHORT);
  return 0.55 + (0.08 - 0.55) * t;
}

const log2 = Math.log2;

export function analyze(text: string, options: AnalyzeOptions): AnalysisResult {
  const started = Date.now();
  const tokens = tokenize(text);
  const seqIdx = sequenceIndices(tokens);
  const tokenCount = seqIdx.length;

  const elapsedMs = (): number => Date.now() - started;

  if (tokenCount < options.minTokens) {
    return {
      skipped: true,
      reason: 'page is too short to analyse',
      stats: { tokenCount, elapsedMs: elapsedMs() },
    };
  }

  const keys: string[] = new Array(tokenCount);
  for (let p = 0; p < tokenCount; p++) keys[p] = (tokens[seqIdx[p] as number] as Token).key;

  const model = new NGramModel();
  model.addSequence(keys);

  const resolvedBasis: 'surprisal' | 'gain' =
    options.basis === 'auto' ? (tokenCount >= GAIN_MIN_TOKENS ? 'gain' : 'surprisal') : options.basis;

  const lambda = blendWeight(tokenCount);

  // Raw score per sequence position; NaN marks positions we do not paint.
  const raw = new Float64Array(tokenCount).fill(Number.NaN);
  let scoreableCount = 0;

  for (let p = 0; p < tokenCount; p++) {
    const token = tokens[seqIdx[p] as number] as Token;
    if (!token.scoreable) continue;

    const pPage = model.prob(keys, p);
    const pUnigramPage = model.unigramProb(token.key);
    const prior = builtinProbability(token.key);

    const pMix = lambda * prior + (1 - lambda) * pPage;
    const pUnigramMix = lambda * prior + (1 - lambda) * pUnigramPage;

    const safeMix = Math.max(pMix, MIN_PROBABILITY);
    const safeUnigram = Math.max(pUnigramMix, MIN_PROBABILITY);

    raw[p] = resolvedBasis === 'gain' ? -log2(safeUnigram) + log2(safeMix) : -log2(safeMix);
    scoreableCount++;
  }

  const levels = new Int8Array(tokens.length);
  const stats: AnalysisStats = {
    tokenCount,
    basis: resolvedBasis,
    spread: 0,
    elapsedMs: elapsedMs(),
  };

  if (scoreableCount < options.minTokens) {
    return {
      skipped: true,
      reason: 'not enough scoreable tokens',
      stats: { tokenCount, elapsedMs: elapsedMs() },
    };
  }

  const positions: number[] = [];
  const dense: number[] = [];
  for (let p = 0; p < tokenCount; p++) {
    const v = raw[p] as number;
    if (!Number.isNaN(v)) {
      positions.push(p);
      dense.push(v);
    }
  }

  // Smooth before ranking, so a lone surprise stays at the extreme instead of being averaged away.
  const smoothed = smooth(Float64Array.from(dense));

  const spread = iqr(smoothed);
  stats.spread = spread;
  if (spread < MIN_SPREAD_BITS) {
    return { skipped: true, reason: 'page is statistically flat', stats };
  }

  const ranked = percentileRank(smoothed);
  const centred = new Float64Array(ranked.length);
  for (let i = 0; i < ranked.length; i++) centred[i] = (ranked[i] as number) - 0.5;

  const denseLevels = toLevels(centred, options.intensity);

  for (let i = 0; i < positions.length; i++) {
    levels[seqIdx[positions[i] as number] as number] = denseLevels[i] as number;
  }

  stats.elapsedMs = elapsedMs();
  return { tokens, levels, stats };
}
