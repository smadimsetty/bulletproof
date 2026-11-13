-- Adaptive sprint engine content coverage. Run live after 20261112130000_adaptive_engine_content.sql:
--   npx supabase db query --linked -f supabase/tests/check_ladder_coverage.sql
-- Expected: zero rows. Each row names one broken rule.
-- The Basic equipment set mirrors BASIC in apps/mobile/lib/equipmentTiers.ts.
with basic_keys as (
  select array['none','bodyweight','wall','wall_or_couch','doorway','towel','step',
               'floor_markers','cone_or_marker','cones','cones_or_floor_markers'] as keys
),
template_slots as (
  select distinct pain_point_id, slot_key from sprint_day_template
),
ladder as (
  select l.*, coalesce(e.equipment_needed, '{}') <@ (select keys from basic_keys) as is_basic
  from slot_ladder l join exercises e on e.id = l.exercise_id
)
-- 1. a template slot with no sprint_slots row
select 'template slot has no sprint_slots row' as issue, t.pain_point_id, t.slot_key as key, null::text as detail
from template_slots t
where not exists (select 1 from sprint_slots s where s.pain_point_id = t.pain_point_id and s.slot_key = t.slot_key)

-- 2. a slot with no ladder rows
union all
select 'slot has no ladder rows', s.pain_point_id, s.slot_key, null
from sprint_slots s
where not exists (select 1 from slot_ladder l where l.pain_point_id = s.pain_point_id and l.slot_key = s.slot_key)

-- 3. a (slot, level) with no exercise allowed at Basic tier
union all
select 'level has no Basic-tier exercise', pain_point_id, slot_key, 'level ' || level
from ladder
group by pain_point_id, slot_key, level
having not bool_or(is_basic)

-- 4. a test with null target_value or noise_threshold
union all
select 'test missing target_value or noise_threshold', pain_point_id, test_key, null
from assessment_definitions
where target_value is null or noise_threshold is null

-- 5. a symmetry test with null raw_direction
union all
select 'symmetry test missing raw_direction', pain_point_id, test_key, null
from assessment_definitions
where better_direction = 'symmetry' and raw_direction is null

-- 6. a test with no link
union all
select 'test has no slot link', d.pain_point_id, d.test_key, null
from assessment_definitions d
where not exists (select 1 from assessment_slot_links k where k.pain_point_id = d.pain_point_id and k.test_key = d.test_key)

-- 7. a slot with no link
union all
select 'slot has no test link', s.pain_point_id, s.slot_key, null
from sprint_slots s
where not exists (select 1 from assessment_slot_links k where k.pain_point_id = s.pain_point_id and k.slot_key = s.slot_key)

-- Extra authoring rules (spec section 6 / task brief), cheap to check here too.
-- 8. a link or ladder row that points at a slot or test that doesn't exist (typo guard)
union all
select 'link points at unknown slot or test', k.pain_point_id, k.test_key || ' -> ' || k.slot_key, null
from assessment_slot_links k
where not exists (select 1 from sprint_slots s where s.pain_point_id = k.pain_point_id and s.slot_key = k.slot_key)
   or not exists (select 1 from assessment_definitions d where d.pain_point_id = k.pain_point_id and d.test_key = k.test_key)
union all
select 'ladder row points at unknown slot', l.pain_point_id, l.slot_key, null
from (select distinct pain_point_id, slot_key from slot_ladder) l
where not exists (select 1 from sprint_slots s where s.pain_point_id = l.pain_point_id and s.slot_key = l.slot_key)

-- 8b. a link weight outside 0.5-2
union all
select 'link weight outside 0.5-2', pain_point_id, test_key || ' -> ' || slot_key, weight::text
from assessment_slot_links
where weight not between 0.5 and 2

-- 9. a slot with fewer than 2 or more than 4 levels
union all
select 'slot level count outside 2-4', pain_point_id, slot_key, count(distinct level)::text
from slot_ladder
group by pain_point_id, slot_key
having count(distinct level) not between 2 and 4

-- 10. a (level, exercise) with fewer than 2 or more than 3 steps
union all
select 'exercise step count outside 2-3', pain_point_id, slot_key, 'level ' || level || ' exercise ' || exercise_id
from slot_ladder
group by pain_point_id, slot_key, level, exercise_id
having count(*) not between 2 and 3

-- 11. an existing pool row whose exercise is missing from that slot's ladder
union all
select 'pool exercise missing from ladder', p.pain_point_id, p.slot_key, p.exercise_id::text
from sprint_exercise_pool p
where not exists (select 1 from slot_ladder l
                  where l.pain_point_id = p.pain_point_id and l.slot_key = p.slot_key and l.exercise_id = p.exercise_id)

-- 12. a stretch-slot step whose hold time (sets x seconds) exceeds 240 s
union all
select 'stretch step over 240 s', l.pain_point_id, l.slot_key, 'level ' || l.level || ' step ' || l.step || ': ' || l.sets || ' x ' || l.reps_or_duration
from slot_ladder l join sprint_slots s on s.pain_point_id = l.pain_point_id and s.slot_key = l.slot_key
where s.is_stretch
  and l.reps_or_duration ~ '^[0-9]+s$'
  and l.sets * left(l.reps_or_duration, -1)::int > 240

order by 1, 2, 3;
