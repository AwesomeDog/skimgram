/** Assembled in memory at build time, so there is no file for TypeScript to read; see scripts/frequency-plugin.ts. */
declare module 'virtual:skimgram-frequency' {
  /** Top English word forms, most frequent first. Split on spaces. */
  export const EN_WORDS: string;
  /** Top Chinese characters, most frequent first. One character per element. */
  export const CJK_CHARS: string;
}
