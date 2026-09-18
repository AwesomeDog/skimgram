// Raw scores are not renderable. Ranking within the document removes the scale problem -
// no fixed threshold survives across vocabularies - and a short centred moving average
// removes the token-level noise that would otherwise look like static.

/** How much neighbouring tokens contribute, as [self, distance 1, distance 2]. */
const SMOOTH_KERNEL = [0.5, 0.3, 0.2];

/** Rank within this document, in [0, 1]; ties share the mean rank. */
export function percentileRank(values: ArrayLike<number>): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;

  const order = Array.from({ length: n }, (_unused, i) => i).sort(
    (a, b) => (values[a] as number) - (values[b] as number),
  );
  const ranks = new Float64Array(n);

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1] as number] === values[order[i] as number]) j++;
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[order[k] as number] = avg;
    i = j + 1;
  }

  for (let k = 0; k < n; k++) {
    out[k] = n === 1 ? 0.5 : ((ranks[k] as number) - 1) / (n - 1);
  }
  return out;
}

export function smooth(values: Float64Array): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const radius = SMOOTH_KERNEL.length - 1;

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let weight = 0;
    for (let d = -radius; d <= radius; d++) {
      const j = i + d;
      if (j < 0 || j >= n) continue;
      const w = SMOOTH_KERNEL[Math.abs(d)] as number;
      sum += (values[j] as number) * w;
      weight += w;
    }
    out[i] = weight > 0 ? sum / weight : 0;
  }

  return out;
}

export function iqr(values: Float64Array): number {
  const n = values.length;
  if (n < 4) return 0;
  const sorted = Float64Array.from(values).sort();
  const q = (p: number): number => sorted[Math.min(n - 1, Math.floor(p * n))] as number;
  return q(0.75) - q(0.25);
}

/** Quantise into CSS levels; `intensity` is the 0..100 slider, where 0 marks nothing at all. */
export function toLevels(centred: Float64Array, intensity: number): Int8Array {
  const out = new Int8Array(centred.length);
  const k = Math.max(0, Math.min(100, intensity)) / 100;

  // Intensity 0 is off literally: edge cutoffs would still catch the most extreme token.
  if (k === 0) return out;

  // Cutoffs move outward from the median together, so coverage grows monotonically with the slider.
  const outer = 0.5 - 0.24 * k;
  const inner = 0.5 - 0.6 * k;

  for (let i = 0; i < centred.length; i++) {
    const v = centred[i] as number;
    if (v >= outer) out[i] = 2;
    else if (v >= inner) out[i] = 1;
    else if (v <= -outer) out[i] = -2;
    else if (v <= -inner) out[i] = -1;
    else out[i] = 0;
  }
  return out;
}
