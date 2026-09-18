// The only data Skimgram ships: two rank-ordered lists, about 28 KB of source. Zipf's law
// turns a rank into a probability, so the ordering is all we need. It is a prior - the page
// model overrides it as soon as the page has statistics of its own.

import { CJK_CHARS, EN_WORDS } from 'virtual:skimgram-frequency';

/** Every probability is clamped above this so a total OOV cannot yield infinity. */
export const MIN_PROBABILITY = 1e-7;

let enRanks: Map<string, number> | null = null;
let cjkRanks: Map<string, number> | null = null;

function enRankMap(): Map<string, number> {
  if (!enRanks) {
    const words = EN_WORDS.split(' ');
    enRanks = new Map();
    for (let i = 0; i < words.length; i++) enRanks.set(words[i] as string, i + 1);
  }
  return enRanks;
}

function cjkRankMap(): Map<string, number> {
  if (!cjkRanks) {
    cjkRanks = new Map();
    for (let i = 0; i < CJK_CHARS.length; i++) cjkRanks.set(CJK_CHARS[i] as string, i + 1);
  }
  return cjkRanks;
}

function zipf(rank: number, n: number): number {
  const h = Math.log(n) + 0.577_215_664_9;
  return 1 / (rank * h);
}

/** OOV is evidence of rarity, not missing information, so it gets a floor. */
function oovProbability(): number {
  const n = enRankMap().size;
  return zipf(n + 1, n);
}

export function builtinProbability(key: string): number {
  const en = enRankMap();
  const fromEn = en.get(key);
  if (fromEn !== undefined) return zipf(fromEn, en.size);

  // CJK keys are single characters; anything longer is a Latin word and cannot be in that list.
  if (key.length === 1) {
    const cjk = cjkRankMap();
    const fromCjk = cjk.get(key);
    if (fromCjk !== undefined) return zipf(fromCjk, cjk.size);
  }

  return oovProbability();
}
