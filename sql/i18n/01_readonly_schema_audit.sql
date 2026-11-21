-- READ-ONLY diagnosis to run in an authorized INTERNAL database session.
-- Returns only metadata and aggregated counts, never patient or clinical text.
-- Do not change database IP allowlists or share credentials.

-- 1. Existing objects, including schema drift/partially deployed translations:
SELECT x.table_name, to_regclass(x.table_name) IS NOT NULL AS exists
FROM (VALUES
 ('users'),('v2_food_library'),('v2_dish_library'),
 ('v2_recipe_library'),('v2_recipe_categories'),
 ('v2_supplement_library'),('v2_food_plan_editor_publications'),
 ('v2_content_translations'),('v2_content_translation_history'),
 ('v2_player_language_preferences')
) AS x(table_name) ORDER BY x.table_name;

-- 2. Column structure only:
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name IN
 ('users','v2_food_library','v2_dish_library','v2_content_translations',
  'v2_content_translation_history','v2_player_language_preferences')
ORDER BY table_name,ordinal_position;

-- 3. Only run after confirming v2_food_library and v2_dish_library exist:
-- Existing name_en values are *proposals*, NOT automatically approved.
SELECT 'active_foods' AS metric,COUNT(*)::bigint AS count
  FROM v2_food_library WHERE active=1
UNION ALL
SELECT 'foods_with_notes',COUNT(*)::bigint
  FROM v2_food_library WHERE active=1 AND length(trim(notes))>0
UNION ALL
SELECT 'active_dishes',COUNT(*)::bigint
  FROM v2_dish_library WHERE active=1
UNION ALL
SELECT 'legacy_dish_english_candidates',COUNT(*)::bigint
  FROM v2_dish_library WHERE active=1 AND name_en IS NOT NULL AND length(trim(name_en))>0;
