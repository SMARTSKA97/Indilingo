// Validates Indilingo course content: JSON schema first, then the semantic rules
// that a schema cannot express (ids, CEFR, skills, Tamil text hygiene, references).
//
// Usage: node validate-content.mjs <content-dir>
// Exit code 1 when any error is found; warnings never fail the run.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const SECTION_CEFR = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2' };
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TAMIL_CHAR = /[஀-௿]/u;
const LATIN_LETTER = /[A-Za-z]/;
const TAMIL_BAD_TOKEN_START = /^[ா-்ௗ]/u; // vowel sign, pulli or au length mark cannot start a word
const TAMIL_ALLOWED = /^[஀-௿\s.,?!;:'"()\-_0-9]+$/u;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${path}: invalid JSON (${e.message})`);
    return null;
  }
}

/** Every string inside an exercise, with a path for messages. */
function* strings(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

function checkTamilText(text, where, errors) {
  if (!TAMIL_CHAR.test(text)) return;
  if (text !== text.normalize('NFC')) errors.push(`${where}: Tamil text is not NFC-normalised`);
  const stripped = text.replace(/___/g, '');
  if (LATIN_LETTER.test(stripped)) errors.push(`${where}: Tamil text mixed with Latin letters: "${text}"`);
  else if (!TAMIL_ALLOWED.test(stripped)) errors.push(`${where}: unexpected character in Tamil text: "${text}"`);
  for (const token of text.split(/\s+/)) {
    if (token && TAMIL_BAD_TOKEN_START.test(token)) {
      errors.push(`${where}: word starts with a vowel sign or pulli (broken letter): "${token}"`);
    }
  }
}

export function checkLanguageConfig(config, where, errors) {
  const L = config.letters;
  if (!L) return;
  if (config.code === 'ta') {
    if (L.vowels.length !== 12) errors.push(`${where}: expected 12 Tamil vowels, found ${L.vowels.length}`);
    if (L.vowelSigns.length !== 12) errors.push(`${where}: expected 12 vowel signs, found ${L.vowelSigns.length}`);
    if (L.consonants.length !== 18) errors.push(`${where}: expected 18 Tamil consonants, found ${L.consonants.length}`);
    if (L.special.length !== 1) errors.push(`${where}: expected 1 special letter (aytham), found ${L.special.length}`);
    const syllables = L.consonants.flatMap((c) => L.vowelSigns.map((s) => c + s));
    const total = L.vowels.length + L.consonants.length + L.special.length + syllables.length;
    if (syllables.length !== 216) errors.push(`${where}: expected 216 combined letters, built ${syllables.length}`);
    if (total !== 247) errors.push(`${where}: expected 247 letters in total, counted ${total}`);
    const segmenter = new Intl.Segmenter('ta', { granularity: 'grapheme' });
    for (const syllable of syllables) {
      const count = [...segmenter.segment(syllable)].length;
      if (count !== 1) errors.push(`${where}: "${syllable}" segments into ${count} grapheme clusters, expected 1`);
    }
    for (const group of config.confusablePairs ?? []) {
      for (const letter of group) {
        if (!L.consonants.includes(letter)) errors.push(`${where}: confusable letter "${letter}" is not a listed consonant`);
      }
    }
  }
}

export function validateAll(contentDir) {
  const errors = [];
  const warnings = [];
  const stats = { chapters: 0, lessons: 0, exercises: 0, byType: {}, bySkill: {}, vocabItems: 0 };

  const root = resolve(contentDir);

  const schemaPath = join(root, 'schema', 'chapter.schema.json');
  if (!existsSync(schemaPath)) return { errors: [`${schemaPath}: schema not found`], warnings, stats };
  const schema = readJson(schemaPath, errors);
  if (!schema) return { errors, warnings, stats };

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateChapter = ajv.compile(schema);

  // Speakers
  const speakers = new Set();
  const charactersPath = join(root, 'characters.json');
  if (existsSync(charactersPath)) {
    const characters = readJson(charactersPath, errors);
    for (const s of characters?.speakers ?? []) speakers.add(s.id);
  } else {
    warnings.push('characters.json not found; speaker ids are not checked');
  }

  // Languages
  const languagesDir = join(root, 'languages');
  if (existsSync(languagesDir)) {
    for (const file of walk(languagesDir).filter((f) => f.endsWith('.json'))) {
      const config = readJson(file, errors);
      if (config) checkLanguageConfig(config, relative(root, file), errors);
    }
  }

  // Vocabulary
  const vocabIds = new Set();
  const coursesDir = join(root, 'courses');
  const files = existsSync(coursesDir) ? walk(coursesDir).filter((f) => f.endsWith('.json')) : [];
  for (const file of files.filter((f) => f.endsWith('vocab.json'))) {
    const vocab = readJson(file, errors);
    for (const item of vocab?.items ?? []) {
      const where = `${relative(root, file)}:${item.id}`;
      if (vocabIds.has(item.id)) errors.push(`${where}: duplicate vocabulary id`);
      vocabIds.add(item.id);
      stats.vocabItems++;
      if (!CEFR_ORDER.includes(item.cefr)) errors.push(`${where}: invalid CEFR level "${item.cefr}"`);
      checkTamilText(item.text, `${where}.text`, errors);
      if (!item.translit) warnings.push(`${where}: missing romanization`);
    }
  }

  // Chapters
  const exerciseIds = new Set();
  const seenPrompts = new Map();
  for (const file of files.filter((f) => !f.endsWith('vocab.json'))) {
    const rel = relative(root, file);
    const chapter = readJson(file, errors);
    if (!chapter) continue;

    if (!validateChapter(chapter)) {
      for (const err of validateChapter.errors) {
        errors.push(`${rel}: schema ${err.instancePath || '/'} ${err.message}`);
      }
      continue; // semantic checks assume a schema-valid chapter
    }
    stats.chapters++;

    if (SECTION_CEFR[chapter.section] && SECTION_CEFR[chapter.section] !== chapter.cefr) {
      errors.push(`${rel}: section ${chapter.section} is ${SECTION_CEFR[chapter.section]} but chapter says ${chapter.cefr}`);
    }
    const target = chapter.course.split('-')[1];
    const expectedId = `${target}-${chapter.cefr.toLowerCase()}-u${chapter.unit}-c${chapter.chapter}`;
    if (chapter.id !== expectedId) errors.push(`${rel}: chapter id "${chapter.id}" should be "${expectedId}"`);

    const positions = new Set();
    for (const lesson of chapter.lessons) {
      stats.lessons++;
      if (positions.has(lesson.position)) errors.push(`${rel}: duplicate lesson position ${lesson.position}`);
      positions.add(lesson.position);

      lesson.exercises.forEach((ex, index) => {
        stats.exercises++;
        stats.byType[ex.type] = (stats.byType[ex.type] ?? 0) + 1;
        for (const skill of ex.skills) stats.bySkill[skill] = (stats.bySkill[skill] ?? 0) + 1;
        const where = `${rel}:${ex.id}`;

        if (exerciseIds.has(ex.id)) errors.push(`${where}: duplicate exercise id`);
        exerciseIds.add(ex.id);

        const idPattern = new RegExp(`^${chapter.id}-l${lesson.position}-e\\d+$`);
        if (!idPattern.test(ex.id)) errors.push(`${where}: id should look like ${chapter.id}-l${lesson.position}-e<number>`);

        if (CEFR_ORDER.indexOf(ex.cefr) > CEFR_ORDER.indexOf(chapter.cefr)) {
          errors.push(`${where}: exercise level ${ex.cefr} is above the chapter level ${chapter.cefr}`);
        }

        // Skills must match what the exercise really trains.
        if (['listen_type', 'listen_select'].includes(ex.type) && !ex.skills.includes('listening')) {
          errors.push(`${where}: ${ex.type} must include the listening skill`);
        }
        if (ex.type === 'speak' && !ex.skills.includes('speaking')) errors.push(`${where}: speak must include the speaking skill`);
        if (['translate_type', 'listen_type'].includes(ex.type) && !ex.skills.includes('writing')) {
          errors.push(`${where}: ${ex.type} must include the writing skill`);
        }

        // Option-based exercises: unique option ids and a valid answer.
        if (ex.options) {
          const ids = ex.options.map((o) => o.id);
          if (new Set(ids).size !== ids.length) errors.push(`${where}: duplicate option ids`);
          if (!ids.includes(ex.correct)) errors.push(`${where}: correct answer "${ex.correct}" is not one of the options`);
          const texts = ex.options.map((o) => o.text);
          if (new Set(texts).size !== texts.length) errors.push(`${where}: two options have the same text`);
        }

        // Word banks: distractors must never be valid answer words.
        if (ex.type === 'translate_wordbank') {
          const used = new Set(ex.answer.accepted.flat());
          for (const d of ex.distractors ?? []) {
            if (used.has(d)) errors.push(`${where}: distractor "${d}" is also an accepted answer word`);
          }
        }

        // Pairs: no duplicates on either side.
        if (ex.pairs) {
          const lefts = ex.pairs.map((p) => p.left ?? p.glyph);
          const rights = ex.pairs.map((p) => p.right ?? p.sound);
          if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
            errors.push(`${where}: pairs contain duplicates`);
          }
        }

        // Speakers
        const spoken = [ex.audio, ex.target].filter(Boolean);
        for (const s of spoken) {
          if (speakers.size > 0 && !speakers.has(s.speaker)) errors.push(`${where}: unknown speaker "${s.speaker}"`);
        }

        // References
        for (const ref of ex.items ?? []) {
          if (ref.startsWith('vocab:') && !vocabIds.has(ref)) errors.push(`${where}: unknown vocabulary item ${ref}`);
        }

        // Tamil hygiene on every string
        let hasTamil = false;
        for (const [path, text] of strings(ex)) {
          if (path === 'explanation' || path === 'meaning') continue; // English prose may quote Tamil
          if (TAMIL_CHAR.test(text)) {
            hasTamil = true;
            checkTamilText(text, `${where}.${path}`, errors);
          }
        }
        if (hasTamil) {
          const optionRoman = ex.options?.every((o) => o.translit);
          if (!ex.translit && !optionRoman && !['match_pairs', 'script_recognition', 'script_sound_match'].includes(ex.type)) {
            warnings.push(`${where}: has Tamil text but no romanization`);
          }
        }

        // Near-duplicate detection
        const key = `${ex.type}|${JSON.stringify(ex.prompt ?? ex.audio ?? ex.sentence ?? ex.glyph ?? index)}`;
        if (seenPrompts.has(key)) warnings.push(`${where}: same prompt as ${seenPrompts.get(key)}`);
        else seenPrompts.set(key, ex.id);
      });
    }
  }

  return { errors, warnings, stats };
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? '../content';
  const { errors, warnings, stats } = validateAll(dir);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(
    `\nchapters: ${stats.chapters}, lessons: ${stats.lessons}, exercises: ${stats.exercises}, vocabulary: ${stats.vocabItems}`,
  );
  console.log(`by type: ${JSON.stringify(stats.byType)}`);
  console.log(`by skill: ${JSON.stringify(stats.bySkill)}`);
  console.log(errors.length === 0 ? 'content OK' : `${errors.length} error(s)`);
  process.exit(errors.length === 0 ? 0 : 1);
}
