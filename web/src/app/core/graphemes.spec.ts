import { describe, expect, it } from 'vitest';
import { canonical, firstDifference, graphemeLength, graphemes, sameAnswer } from './graphemes';

describe('graphemes', () => {
  it('treats a consonant plus vowel sign as one letter', () => {
    expect(graphemes('கி')).toEqual(['கி']);
    expect(graphemeLength('கி')).toBe(1);
  });

  it('splits a word into the letters a learner sees', () => {
    expect(graphemes('கொடு')).toEqual(['கொ', 'டு']);
    expect(graphemes('வணக்கம்')).toEqual(['வ', 'ண', 'க்', 'க', 'ம்']);
  });

  it('keeps all 216 combined letters as single clusters', () => {
    const consonants = ['க', 'ங', 'ச', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ப', 'ம', 'ய', 'ர', 'ல', 'வ', 'ழ', 'ள', 'ற', 'ன'];
    const signs = ['', 'ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];
    const broken = consonants.flatMap((c) => signs.map((s) => c + s)).filter((l) => graphemeLength(l) !== 1);
    expect(broken).toEqual([]);
  });

  it('normalises decomposed input to NFC before splitting', () => {
    const decomposed = 'கொ'; // க + ெ + ா, the same letter as கொ
    expect(graphemes(decomposed)).toEqual(['கொ']);
  });
});

describe('answer checking', () => {
  it('ignores spacing, case of punctuation and trailing punctuation', () => {
    expect(canonical('  ஆமாம்,   நன்றி.  ')).toBe('ஆமாம், நன்றி');
    expect(sameAnswer('ஆமாம் நன்றி', 'ஆமாம்  நன்றி!')).toBe(true);
  });

  it('accepts decomposed and composed spellings as equal', () => {
    expect(sameAnswer('கொடு', 'கொடு')).toBe(true);
  });

  it('rejects a different word', () => {
    expect(sameAnswer('நன்றி', 'வணக்கம்')).toBe(false);
  });

  it('reports the first differing letter, not the first differing code point', () => {
    // கொடு vs கோடு: the first letter differs (கொ vs கோ)
    expect(firstDifference('கொடு', 'கோடு')).toBe(0);
    expect(firstDifference('வணக்கம்', 'வணக்கம்')).toBe(-1);
    expect(firstDifference('வணக்கம்', 'வணக்கமா')).toBe(4);
  });
});
