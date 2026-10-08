-- V2: content hierarchy. The JSON in /content is the source of truth;
-- these tables mirror it for the content studio (P3) and for serving packs.
-- course > section (CEFR level) > unit > chapter > lesson > exercise

CREATE TABLE languages (
    code          varchar(8) PRIMARY KEY,           -- BCP-47, e.g. ta
    name_english  varchar(64) NOT NULL,
    name_native   varchar(64) NOT NULL,
    script        varchar(32) NOT NULL,
    tts_locale    varchar(16) NOT NULL,             -- e.g. ta-IN
    config        jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_enabled    boolean NOT NULL DEFAULT false
);

CREATE TABLE courses (
    id               uuid PRIMARY KEY,
    source_language  varchar(8) NOT NULL REFERENCES languages (code),
    target_language  varchar(8) NOT NULL REFERENCES languages (code),
    title            varchar(120) NOT NULL,
    is_published     boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_language, target_language)
);

CREATE TABLE sections (
    id          uuid PRIMARY KEY,
    course_id   uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    position    smallint NOT NULL,
    cefr_level  varchar(2) NOT NULL CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
    title       varchar(120) NOT NULL,
    UNIQUE (course_id, position)
);

CREATE TABLE units (
    id          uuid PRIMARY KEY,
    section_id  uuid NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
    position    smallint NOT NULL,
    title       varchar(120) NOT NULL,
    guidebook   text,
    UNIQUE (section_id, position)
);

CREATE TABLE chapters (
    id          uuid PRIMARY KEY,
    unit_id     uuid NOT NULL REFERENCES units (id) ON DELETE CASCADE,
    position    smallint NOT NULL,
    title       varchar(120) NOT NULL,
    goal        text,
    status      varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published')),
    reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    UNIQUE (unit_id, position)
);

CREATE TABLE lessons (
    id          uuid PRIMARY KEY,
    chapter_id  uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
    position    smallint NOT NULL,
    kind        varchar(16) NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson','chapter_test','unit_test','section_exam')),
    UNIQUE (chapter_id, position)
);

CREATE TABLE exercises (
    id            varchar(64) PRIMARY KEY,           -- stable content id, e.g. ta-a1-u1-c2-l3-e5
    lesson_id     uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    position      smallint NOT NULL,
    type          varchar(32) NOT NULL,
    skills        text[] NOT NULL DEFAULT '{}',
    cefr_level    varchar(2) NOT NULL,
    body          jsonb NOT NULL,
    review_state  varchar(16) NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft','in_review','approved','flagged')),
    UNIQUE (lesson_id, position)
);
CREATE INDEX ix_exercises_skills ON exercises USING gin (skills);

CREATE TABLE vocab_items (
    id          varchar(64) PRIMARY KEY,             -- e.g. vocab:thanneer
    language    varchar(8) NOT NULL REFERENCES languages (code),
    text        text NOT NULL,
    translit    text,
    meaning_en  text NOT NULL,
    cefr_level  varchar(2) NOT NULL,
    morphemes   jsonb
);

CREATE TABLE grammar_notes (
    id          varchar(64) PRIMARY KEY,
    language    varchar(8) NOT NULL REFERENCES languages (code),
    title       varchar(120) NOT NULL,
    body        text NOT NULL,
    cefr_level  varchar(2) NOT NULL
);

CREATE TABLE audio_assets (
    id          uuid PRIMARY KEY,
    language    varchar(8) NOT NULL REFERENCES languages (code),
    text_hash   varchar(64) NOT NULL,                -- SHA-256 of text + voice + speed
    voice       varchar(64) NOT NULL,                -- speaker, e.g. tigris, otis
    speed       varchar(8) NOT NULL DEFAULT 'normal',
    storage_key text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (language, text_hash)
);

INSERT INTO languages (code, name_english, name_native, script, tts_locale, is_enabled) VALUES
    ('en', 'English', 'English', 'Latin', 'en-US', true),
    ('ta', 'Tamil', 'தமிழ்', 'Tamil', 'ta-IN', true);
