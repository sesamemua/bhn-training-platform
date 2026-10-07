-- Approval is final. Retire only the known Training Week reconfirmation
-- fields and workflow nodes; retain submissions, seats and voluntary withdrawal.
-- v1 is frozen historical copy and deliberately excluded from form updates.
BEGIN;

INSERT INTO "PlatformSetting" ("id", "key", "value", "updatedAt")
SELECT 'backup-workshop-reconfirmation-20261028',
       'backup.trainingWeek.reconfirmation.20261028',
       jsonb_build_object(
         'forms', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'fields', fields)), '[]'::jsonb)
                   FROM "EventForm" WHERE slug ~ '^training-week-registration-2026-v[0-9]+$'),
         'flowchart', (SELECT data FROM "FlowChart" WHERE slug = 'training-week-registration')
       )::text,
       CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;

UPDATE "EventForm" AS f
SET fields = jsonb_set(jsonb_set(f.fields, '{fields}', (
      SELECT COALESCE(jsonb_agg(field ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(f.fields->'fields') WITH ORDINALITY AS q(field, ord)
      WHERE field->>'key' IS DISTINCT FROM 'confirmed'
    )), '{steps}', (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN step->>'id' = 'w_seat' THEN step || jsonb_build_object(
          'next', 'w_attends',
          'label', 'Place approved, attendance confirmed, info pack emailed',
          'note', 'No reply or further confirmation is required. The registrant can release their seat using the cancellation link if they can no longer attend.'
        ) ELSE step END ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(f.fields->'steps') WITH ORDINALITY AS s(step, ord)
      WHERE step->>'id' NOT IN ('w_hold', 'w_ask', 'w_stillcoming', 'w_released')
    )), "updatedAt" = CURRENT_TIMESTAMP
WHERE f.slug ~ '^training-week-registration-2026-v[0-9]+$'
  AND jsonb_typeof(f.fields->'fields') = 'array'
  AND jsonb_typeof(f.fields->'steps') = 'array'
  AND f.fields->'steps' @> '[{"id":"w_seat"},{"id":"w_attends"}]'::jsonb;

UPDATE "FlowChart" AS c
SET data = jsonb_set(jsonb_set(c.data, '{nodes}', (
      SELECT COALESCE(jsonb_agg(node ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(c.data->'nodes') WITH ORDINALITY AS n(node, ord)
      WHERE node->>'id' NOT IN ('n14', 'n15')
    )), '{edges}', (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN edge->>'from' = 'n13' AND edge->>'to' = 'n14'
          THEN (edge - 'when') || '{"to":"n16","label":"no further confirmation needed"}'::jsonb
          ELSE edge END ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(c.data->'edges') WITH ORDINALITY AS e(edge, ord)
      WHERE edge->>'from' NOT IN ('n14', 'n15')
        AND (edge->>'to' NOT IN ('n14', 'n15') OR (edge->>'from' = 'n13' AND edge->>'to' = 'n14'))
    )), "updatedAt" = CURRENT_TIMESTAMP
WHERE c.slug = 'training-week-registration'
  AND c.data->'nodes' @> '[{"id":"n14","field":{"key":"confirmed"}},{"id":"n16"}]'::jsonb;

COMMIT;
