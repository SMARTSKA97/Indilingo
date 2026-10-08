import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll, checkLanguageConfig } from './validate-content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const realContent = join(here, '..', 'content');
const chapterPath = 'courses/ta/a1/u01-hello/c01-greetings.json';

/** Copies the real content, lets the test mutate the greetings chapter, validates, cleans up. */
function withMutation(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'indilingo-content-'));
  try {
    cpSync(realContent, dir, { recursive: true });
    const file = join(dir, chapterPath);
    const chapter = JSON.parse(readFileSync(file, 'utf8'));
    mutate(chapter);
    writeFileSync(file, JSON.stringify(chapter, null, 2));
    return validateAll(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const firstExercise = (chapter, type) =>
  chapter.lessons.flatMap((l) => l.exercises).find((e) => e.type === type);

test('the sample Tamil course is valid', () => {
  const { errors, stats } = validateAll(realContent);
  assert.deepEqual(errors, []);
  assert.equal(stats.chapters, 2);
  assert.ok(stats.exercises >= 10);
});

test('Tamil language config: 12 vowels, 18 consonants, 216 combined letters, one cluster each', () => {
  const config = JSON.parse(readFileSync(join(realContent, 'languages', 'ta.json'), 'utf8'));
  const errors = [];
  checkLanguageConfig(config, 'ta.json', errors);
  assert.deepEqual(errors, []);
});

test('a missing consonant is caught in the language config', () => {
  const config = JSON.parse(readFileSync(join(realContent, 'languages', 'ta.json'), 'utf8'));
  config.letters.consonants.pop();
  const errors = [];
  checkLanguageConfig(config, 'ta.json', errors);
  assert.ok(errors.some((e) => e.includes('18 Tamil consonants')));
});

test('a correct answer that is not an option is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'multiple_choice').correct = 'z';
  });
  assert.ok(errors.some((e) => e.includes('not one of the options')));
});

test('decomposed (non-NFC) Tamil text is rejected', () => {
  const { errors } = withMutation((c) => {
    // கொ composed (U+0B95 U+0BCA) written as க + ெ + ா
    firstExercise(c, 'translate_type').answer.accepted = ['கொ'];
  });
  assert.ok(errors.some((e) => e.includes('not NFC')));
});

test('a word that starts with a vowel sign is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'translate_type').answer.accepted = ['ாக'];
  });
  assert.ok(errors.some((e) => e.includes('broken letter')));
});

test('Tamil mixed with Latin letters is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'translate_type').answer.accepted = ['வணக்கம்hello'];
  });
  assert.ok(errors.some((e) => e.includes('mixed with Latin')));
});

test('a duplicate exercise id is rejected', () => {
  const { errors } = withMutation((c) => {
    const exercises = c.lessons[0].exercises;
    exercises[1].id = exercises[0].id;
  });
  assert.ok(errors.some((e) => e.includes('duplicate exercise id')));
});

test('a distractor that is also an answer word is rejected', () => {
  const { errors } = withMutation((c) => {
    const ex = firstExercise(c, 'translate_wordbank');
    ex.distractors.push(ex.answer.accepted[0][0]);
  });
  assert.ok(errors.some((e) => e.includes('also an accepted answer word')));
});

test('an unknown speaker is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'listen_select').audio.speaker = 'nobody';
  });
  assert.ok(errors.some((e) => e.includes('unknown speaker')));
});

test('an unknown vocabulary reference is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'multiple_choice').items = ['vocab:doesnotexist'];
  });
  assert.ok(errors.some((e) => e.includes('unknown vocabulary item')));
});

test('a listening exercise must carry the listening skill', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'listen_select').skills = ['reading'];
  });
  assert.ok(errors.some((e) => e.includes('must include the listening skill')));
});

test('an exercise above the chapter CEFR level is rejected', () => {
  const { errors } = withMutation((c) => {
    firstExercise(c, 'multiple_choice').cefr = 'B1';
  });
  assert.ok(errors.some((e) => e.includes('above the chapter level')));
});

test('a section/CEFR mismatch is rejected', () => {
  const { errors } = withMutation((c) => {
    c.section = 2;
  });
  assert.ok(errors.some((e) => e.includes('section 2 is A2')));
});

test('an exercise that breaks the schema is reported', () => {
  const { errors } = withMutation((c) => {
    delete firstExercise(c, 'translate_type').answer;
  });
  assert.ok(errors.some((e) => e.includes('schema')));
});
