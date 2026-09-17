with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('APT: Couch Stretch', 'mobility', 'mobility_stretch', array['hip'], 'Static hip-flexor stretching alone produces short-term extension gains via stretch tolerance; the active glute squeeze is what keeps it from dumping into lumbar extension.', 'C', array[]::text[], 1, '60s', true, true),
    ('APT: Single-Leg Glute Bridge', 'hinge', 'strength', array['hip', 'lumbar_spine'], 'Loaded hip strengthening through full range builds range and control simultaneously.', 'B', array[]::text[], 1, '12 reps', true, true),
    ('APT: Dead Bug', 'core', 'strength', array['lumbar_spine'], 'Motor-control exercise for anterior core; effective versus minimal intervention for low-back pain, low back pressed to the floor throughout.', 'B', array[]::text[], 3, '8 reps each side', true, false),
    ('APT: Modified Curl-Up', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- endurance-biased, spine-sparing anterior-core work.', 'B', array[]::text[], 3, '8s holds', false, false),
    ('APT: Romanian Deadlift', 'hinge', 'strength', array['hip', 'hamstring'], 'Loaded lengthening; builds range and strength at once and is the base-layer mobility work per the book''s central thesis.', 'A', array['dumbbell'], 3, '8 reps', false, false),
    ('APT: Bulgarian Split Squat', 'squat', 'strength', array['hip'], 'Probably the single best hip mobility-and-strength exercise available; deep, controlled, slight forward lean to bias the glute.', 'A', array['dumbbell'], 3, '8-10 reps', true, false),
    ('APT: Side Plank', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- anti-lateral-flexion trunk endurance.', 'B', array[]::text[], 3, '20-30s', true, false),
    ('APT: Bird Dog', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- spine-sparing, well tolerated by both flexion- and extension-intolerant back patterns.', 'B', array[]::text[], 3, '8 reps each side', true, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'anterior_pelvic_tilt', 1, 'apt-hip-flexor-stretch', id, 1, 1, '60s' from new_exercises where name = 'APT: Couch Stretch'
union all select 'anterior_pelvic_tilt', 1, 'apt-glute-bridge', id, 1, 1, '12 reps' from new_exercises where name = 'APT: Single-Leg Glute Bridge'
union all select 'anterior_pelvic_tilt', 1, 'apt-anterior-core', id, 1, 3, '8 reps each side' from new_exercises where name = 'APT: Dead Bug'
union all select 'anterior_pelvic_tilt', 1, 'apt-anterior-core', id, 2, 3, '8s holds' from new_exercises where name = 'APT: Modified Curl-Up'
union all select 'anterior_pelvic_tilt', 2, 'apt-loaded-hip-hinge', id, 1, 3, '8 reps' from new_exercises where name = 'APT: Romanian Deadlift'
union all select 'anterior_pelvic_tilt', 2, 'apt-split-squat', id, 1, 3, '8-10 reps' from new_exercises where name = 'APT: Bulgarian Split Squat'
union all select 'anterior_pelvic_tilt', 2, 'apt-mcgill-big-three', id, 1, 3, '20-30s' from new_exercises where name = 'APT: Side Plank'
union all select 'anterior_pelvic_tilt', 2, 'apt-mcgill-big-three', id, 2, 3, '8 reps each side' from new_exercises where name = 'APT: Bird Dog';

insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration) values
  ('anterior_pelvic_tilt', 1, 'apt-deep-squat-hold', (select id from exercises where name = 'Ankle: Deep Squat Hold'), 1, 2, '60s'),
  ('anterior_pelvic_tilt', 2, 'apt-loaded-carry', (select id from exercises where name = 'Neck: Farmer''s Carry'), 1, 3, '40m');

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'anterior_pelvic_tilt', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('apt-hip-flexor-stretch', 1), ('apt-glute-bridge', 2), ('apt-deep-squat-hold', 3), ('apt-anterior-core', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('anterior_pelvic_tilt', 2, 'apt-loaded-hip-hinge', 2, 5),
  ('anterior_pelvic_tilt', 3, 'apt-split-squat', 2, 5),
  ('anterior_pelvic_tilt', 5, 'apt-loaded-carry', 2, 5),
  ('anterior_pelvic_tilt', 6, 'apt-mcgill-big-three', 2, 5),
  ('anterior_pelvic_tilt', 8, 'apt-loaded-hip-hinge', 2, 5),
  ('anterior_pelvic_tilt', 9, 'apt-split-squat', 2, 5),
  ('anterior_pelvic_tilt', 11, 'apt-loaded-carry', 2, 5),
  ('anterior_pelvic_tilt', 12, 'apt-mcgill-big-three', 2, 5),
  ('anterior_pelvic_tilt', 14, 'apt-loaded-hip-hinge', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('anterior_pelvic_tilt', 'thomas_test', 'Thomas Test (Hip Extension)', 'Sit at the edge of a table or bed, pull one knee to your chest and roll back to lying. Let the other leg hang free. Note the angle of the hanging thigh relative to horizontal.', 'degrees from horizontal', 'The hanging thigh should rest at or below horizontal. Above horizontal indicates a hip-flexor restriction that contributes to anterior pelvic tilt.', 'lower', true, false, 1),
  ('anterior_pelvic_tilt', 'standing_pelvic_tilt', 'Standing Lateral Pelvic Tilt', 'Have someone photograph you from the side in a relaxed standing posture, or use a level app against your front and back pelvic landmarks (ASIS and PSIS), to estimate the forward tilt angle.', 'degrees', 'A neutral pelvis reads close to 0; several protocols cite roughly 7-15 degrees of anterior tilt as a common non-pathological range, so track your own trend rather than chasing a universal zero.', 'lower', false, true, 2),
  ('anterior_pelvic_tilt', 'anterior_core_endurance', 'Anterior Core Endurance', 'Hold a modified curl-up or a front plank with a flat low back for as long as you can maintain the position without your low back arching.', 'seconds', 'No universal norm -- track your own trend.', 'higher', false, true, 3),
  ('anterior_pelvic_tilt', 'glute_bridge_hold', 'Single-Leg Glute Bridge Hold', 'Bridge on one leg, hold at the top with hips level. Time until cramping or the pelvis drops.', 'seconds', '30s each side without cramping in the hamstring or dropping the pelvis.', 'higher', true, false, 4);
