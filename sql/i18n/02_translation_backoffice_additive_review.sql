-- REVIEW ONLY. Do not apply on production without a verified schema audit,
-- a backup, a rollout plan and explicit authorization.
-- Backoffice-only: this does not create the player's language preference.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $preflight$
BEGIN
  IF to_regclass('users') IS NULL
     OR to_regclass('v2_food_library') IS NULL
     OR to_regclass('v2_dish_library') IS NULL THEN
    RAISE EXCEPTION 'i18n blocked: required source tables missing';
  END IF;
END $preflight$;

CREATE TABLE IF NOT EXISTS v2_content_translations (
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved')),
  updated_at BIGINT NOT NULL,
  updated_by TEXT NOT NULL,
  approved_at BIGINT,
  approved_by TEXT,
  PRIMARY KEY(entity_kind,entity_id,field_path,language)
);
CREATE INDEX IF NOT EXISTS v2_content_translations_review
  ON v2_content_translations(language,status,updated_at);

CREATE TABLE IF NOT EXISTS v2_content_translation_history (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted','approved')),
  actor_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS v2_content_translation_history_lookup
  ON v2_content_translation_history(entity_kind,entity_id,field_path,language,created_at);

-- Fail closed rather than silently reusing incompatible existing tables.
-- Any failure rolls back the whole transaction.
DO $postcheck$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM (VALUES
      ('v2_content_translations','entity_kind','text','NO'),
      ('v2_content_translations','entity_id','text','NO'),
      ('v2_content_translations','field_path','text','NO'),
      ('v2_content_translations','language','text','NO'),
      ('v2_content_translations','source_hash','text','NO'),
      ('v2_content_translations','translated_text','text','NO'),
      ('v2_content_translations','status','text','NO'),
      ('v2_content_translations','updated_at','bigint','NO'),
      ('v2_content_translations','updated_by','text','NO'),
      ('v2_content_translations','approved_at','bigint','YES'),
      ('v2_content_translations','approved_by','text','YES'),
      ('v2_content_translation_history','id','text','NO'),
      ('v2_content_translation_history','entity_kind','text','NO'),
      ('v2_content_translation_history','entity_id','text','NO'),
      ('v2_content_translation_history','field_path','text','NO'),
      ('v2_content_translation_history','language','text','NO'),
      ('v2_content_translation_history','source_hash','text','NO'),
      ('v2_content_translation_history','translated_text','text','NO'),
      ('v2_content_translation_history','action','text','NO'),
      ('v2_content_translation_history','actor_id','text','NO'),
      ('v2_content_translation_history','created_at','bigint','NO')
    ) AS required(table_name,column_name,data_type,is_nullable)
    LEFT JOIN information_schema.columns c
      ON c.table_schema=current_schema()
     AND c.table_name=required.table_name
     AND c.column_name=required.column_name
    WHERE c.column_name IS NULL OR c.data_type<>required.data_type
      OR c.is_nullable<>required.is_nullable
  ) THEN
    RAISE EXCEPTION 'i18n blocked: unexpected translation column shape';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema()
      AND t.relname='v2_content_translations' AND c.contype='p'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema()
      AND t.relname='v2_content_translation_history' AND c.contype='p'
  ) THEN
    RAISE EXCEPTION 'i18n blocked: translation primary key missing';
  END IF;
END $postcheck$;
COMMIT;
