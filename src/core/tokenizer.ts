// Language-agnostic: CJK is split per character, everything else into runs of letters,
// marks and digits. Tokens tile the input exactly, which is what lets the caller score one
// flat string and then paint the original text nodes.

export type TokenKind = 'cjk' | 'word' | 'number' | 'punct' | 'space';

export interface Token {
  text: string;
  /** Case-folded lookup key used by the n-gram model. */
  key: string;
  kind: TokenKind;
  /** Start offset in the source string (inclusive). */
  start: number;
  /** End offset in the source string (exclusive). */
  end: number;
  scoreable: boolean;
}

const SPACE_RE = /\s/;
const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}’'\-]/u;
const HAS_LETTER_RE = /[\p{L}\p{M}]/u;
const EDGE_PUNCT_RE = /[’'\-]/;
const FULLWIDTH_RE = /[！-｠｡-ﾟ　-〿]/;

function isCjkLetter(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
    (cp >= 0xac00 && cp <= 0xd7af) // Hangul syllables
  );
}

function isCjkPunct(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK Symbols and Punctuation
    (cp >= 0xff01 && cp <= 0xff20) || // Fullwidth ASCII punctuation
    (cp >= 0xff3b && cp <= 0xff40) ||
    (cp >= 0xff5b && cp <= 0xff65)
  );
}

function makeKey(text: string): string {
  // NFKC folds fullwidth forms onto ASCII but is slow, so only pay for it when it can matter.
  const folded = FULLWIDTH_RE.test(text) ? text.normalize('NFKC') : text;
  return folded.toLowerCase();
}

function make(text: string, kind: TokenKind, start: number, end: number, scoreable: boolean): Token {
  return { text, key: makeKey(text), kind, start, end, scoreable };
}

/** Separates text nodes in the flat string; a control char no rule absorbs, so it cannot leak into the DOM. */
export const RUN_SEPARATOR = '\u0001';

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const cp = text.codePointAt(i) as number;
    const width = cp > 0xffff ? 2 : 1;
    const ch = text[i] as string;

    if (isCjkLetter(cp)) {
      out.push(make(text.slice(i, i + width), 'cjk', i, i + width, true));
      i += width;
      continue;
    }

    if (isCjkPunct(cp)) {
      out.push(make(text.slice(i, i + width), 'punct', i, i + width, false));
      i += width;
      continue;
    }

    if (SPACE_RE.test(ch)) {
      let j = i;
      while (j < n && SPACE_RE.test(text[j] as string)) j++;
      out.push(make(text.slice(i, j), 'space', i, j, false));
      i = j;
      continue;
    }

    if (WORD_CHAR_RE.test(ch)) {
      let j = i;
      while (j < n && WORD_CHAR_RE.test(text[j] as string)) j++;
      // Drop trailing apostrophes / hyphens so they do not swallow the closing punctuation.
      let end = j;
      while (end > i + 1 && EDGE_PUNCT_RE.test(text[end - 1] as string)) end--;
      const slice = text.slice(i, end);
      const kind: TokenKind = HAS_LETTER_RE.test(slice) ? 'word' : 'number';
      out.push(make(slice, kind, i, end, kind === 'word'));
      i = end;
      continue;
    }

    out.push(make(text.slice(i, i + width), 'punct', i, i + width, false));
    i += width;
  }

  return out;
}

export function sequenceIndices(tokens: readonly Token[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.kind !== 'space') out.push(i);
  }
  return out;
}
