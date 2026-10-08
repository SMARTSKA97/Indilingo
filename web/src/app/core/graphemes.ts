/**
 * Text helpers for Indic scripts. A Tamil syllable such as கி is two code points, so anything
 * that splits, counts or compares learner text must work on grapheme clusters, after NFC.
 */

const segmenters = new Map<string, Intl.Segmenter>();

function segmenter(locale: string): Intl.Segmenter {
  let s = segmenters.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    segmenters.set(locale, s);
  }
  return s;
}

export function normalize(text: string): string {
  return text.normalize('NFC');
}

/** Splits text into user-perceived letters. */
export function graphemes(text: string, locale = 'ta'): string[] {
  return Array.from(segmenter(locale).segment(normalize(text)), (part) => part.segment);
}

export function graphemeLength(text: string, locale = 'ta'): number {
  return graphemes(text, locale).length;
}

/** Comparison used for answer checking: NFC, trimmed, single spaces, trailing punctuation ignored. */
export function canonical(text: string): string {
  return normalize(text)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,?!;:।]+$/u, '');
}

export function sameAnswer(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

/**
 * Where two answers first differ, as a grapheme index, or -1 when they match.
 * Used for hints such as "close, check this letter".
 */
export function firstDifference(expected: string, given: string, locale = 'ta'): number {
  const e = graphemes(canonical(expected), locale);
  const g = graphemes(canonical(given), locale);
  const length = Math.max(e.length, g.length);
  for (let i = 0; i < length; i++) {
    if (e[i] !== g[i]) return i;
  }
  return -1;
}
