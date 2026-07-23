-- Data migration: move existing localized titles/descriptions out of
-- learning_programs.metadata, lessons.metadata, and chapters.title (JSONB) into
-- the translations table (one row per entity/locale/field). See doc 12 §6.
-- Idempotent: ON CONFLICT DO NOTHING, and the source values are cleared after,
-- so re-running is a no-op. jsonb_each_text unrolls { "ar": "...", "en": "..." }.

-- Programs: metadata.title / metadata.description
INSERT INTO "translations" ("entity_type", "entity_id", "locale", "field", "value")
SELECT 'learning_program', lp."id", t.key, 'title', t.value
FROM "learning_programs" lp,
     LATERAL jsonb_each_text(lp."metadata" -> 'title') AS t(key, value)
WHERE jsonb_typeof(lp."metadata" -> 'title') = 'object' AND t.value <> ''
ON CONFLICT ("entity_type", "entity_id", "locale", "field") DO NOTHING;
--> statement-breakpoint
INSERT INTO "translations" ("entity_type", "entity_id", "locale", "field", "value")
SELECT 'learning_program', lp."id", t.key, 'description', t.value
FROM "learning_programs" lp,
     LATERAL jsonb_each_text(lp."metadata" -> 'description') AS t(key, value)
WHERE jsonb_typeof(lp."metadata" -> 'description') = 'object' AND t.value <> ''
ON CONFLICT ("entity_type", "entity_id", "locale", "field") DO NOTHING;
--> statement-breakpoint

-- Lessons: metadata.title / metadata.description
INSERT INTO "translations" ("entity_type", "entity_id", "locale", "field", "value")
SELECT 'lesson', l."id", t.key, 'title', t.value
FROM "lessons" l,
     LATERAL jsonb_each_text(l."metadata" -> 'title') AS t(key, value)
WHERE jsonb_typeof(l."metadata" -> 'title') = 'object' AND t.value <> ''
ON CONFLICT ("entity_type", "entity_id", "locale", "field") DO NOTHING;
--> statement-breakpoint
INSERT INTO "translations" ("entity_type", "entity_id", "locale", "field", "value")
SELECT 'lesson', l."id", t.key, 'description', t.value
FROM "lessons" l,
     LATERAL jsonb_each_text(l."metadata" -> 'description') AS t(key, value)
WHERE jsonb_typeof(l."metadata" -> 'description') = 'object' AND t.value <> ''
ON CONFLICT ("entity_type", "entity_id", "locale", "field") DO NOTHING;
--> statement-breakpoint

-- Chapters: the dedicated title JSONB column
INSERT INTO "translations" ("entity_type", "entity_id", "locale", "field", "value")
SELECT 'chapter', c."id", t.key, 'title', t.value
FROM "chapters" c,
     LATERAL jsonb_each_text(c."title") AS t(key, value)
WHERE jsonb_typeof(c."title") = 'object' AND t.value <> ''
ON CONFLICT ("entity_type", "entity_id", "locale", "field") DO NOTHING;
--> statement-breakpoint

-- Clear the migrated source values so there is a single source of truth. The
-- read path already ignores these; this just removes the now-stale duplicates.
UPDATE "learning_programs" SET "metadata" = "metadata" - 'title' - 'description'
WHERE "metadata" ?| ARRAY['title', 'description'];
--> statement-breakpoint
UPDATE "lessons" SET "metadata" = "metadata" - 'title' - 'description'
WHERE "metadata" ?| ARRAY['title', 'description'];
--> statement-breakpoint
UPDATE "chapters" SET "title" = NULL WHERE "title" IS NOT NULL;
