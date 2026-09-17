with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Neck: Craniocervical Flexion Hold', 'balance', 'strength', array['neck'], 'Eight of nine trials in a systematic review supported specific low-load training of the deep cervical flexors, normalizing muscle behavior toward less superficial over-activity.', 'B', array[]::text[], 10, '10s holds', false, true),
    ('Neck: Cervical Rotation, Slow Full Range', 'mobility', 'mobility_stretch', array['neck'], 'General range-of-motion work; no forcing.', 'C', array[]::text[], 1, '10 reps each direction', false, false),
    ('Neck: Upper Trapezius and Levator Stretch', 'mobility', 'mobility_stretch', array['neck'], 'Comfort-layer stretch; local relief without a durable structural claim.', 'C', array[]::text[], 1, '30s', true, false),
    ('Neck: Thoracic Extension Over Chair Back', 'mobility', 'mobility_stretch', array['neck', 'thoracic_spine'], 'Most "neck tightness" is thoracic; thoracic mobility work is a well-replicated regional-interdependence effect on neck pain.', 'B', array[]::text[], 1, '10 reps', false, true),
    ('Neck: Four-Direction Isometric Neck Hold', 'balance', 'strength', array['neck'], 'Neck and upper-quarter strengthening is the most reliable intervention for chronic non-specific neck pain across reviews.', 'A', array[]::text[], 5, '10s holds, 4 directions', false, false),
    ('Neck: Prone Neck Extension', 'balance', 'strength', array['neck'], 'Part of the same upper-quarter-strengthening family; loaded only once bodyweight is easy.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Neck: Farmer''s Carry', 'core', 'strength', array['neck', 'shoulder'], 'Loads the entire upper quarter isometrically in an upright position; underrated for neck resilience.', 'B', array['dumbbell'], 3, '40m', false, false),
    ('Neck: Dumbbell Row', 'pull', 'strength', array['neck', 'shoulder'], 'Mid-back capacity is the foundation the neck sits on.', 'B', array['dumbbell'], 3, '10 reps', true, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'nerd_neck', 1, 'neck-craniocervical-flexion', id, 1, 10, '10s holds' from new_exercises where name = 'Neck: Craniocervical Flexion Hold'
union all select 'nerd_neck', 1, 'neck-rotation-rom', id, 1, 1, '10 reps each direction' from new_exercises where name = 'Neck: Cervical Rotation, Slow Full Range'
union all select 'nerd_neck', 1, 'neck-upper-trap-levator-stretch', id, 1, 1, '30s' from new_exercises where name = 'Neck: Upper Trapezius and Levator Stretch'
union all select 'nerd_neck', 1, 'neck-thoracic-extension', id, 1, 1, '10 reps' from new_exercises where name = 'Neck: Thoracic Extension Over Chair Back'
union all select 'nerd_neck', 2, 'neck-isometric-holds', id, 1, 5, '10s holds, 4 directions' from new_exercises where name = 'Neck: Four-Direction Isometric Neck Hold'
union all select 'nerd_neck', 2, 'neck-prone-extension', id, 1, 3, '10 reps' from new_exercises where name = 'Neck: Prone Neck Extension'
union all select 'nerd_neck', 2, 'neck-farmers-carry', id, 1, 3, '40m' from new_exercises where name = 'Neck: Farmer''s Carry'
union all select 'nerd_neck', 2, 'neck-rows', id, 1, 3, '10 reps' from new_exercises where name = 'Neck: Dumbbell Row';

insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration) values
  ('nerd_neck', 2, 'neck-face-pulls-pullaparts', (select id from exercises where name = 'Shoulder: Face Pull'), 1, 3, '15 reps'),
  ('nerd_neck', 2, 'neck-face-pulls-pullaparts', (select id from exercises where name = 'Shoulder: Band Pull-Apart'), 2, 1, '20 reps');

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'nerd_neck', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('neck-craniocervical-flexion', 1), ('neck-rotation-rom', 2), ('neck-upper-trap-levator-stretch', 3), ('neck-thoracic-extension', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('nerd_neck', 2, 'neck-isometric-holds', 2, 5),
  ('nerd_neck', 3, 'neck-prone-extension', 2, 5),
  ('nerd_neck', 5, 'neck-face-pulls-pullaparts', 2, 5),
  ('nerd_neck', 6, 'neck-farmers-carry', 2, 5),
  ('nerd_neck', 8, 'neck-rows', 2, 5),
  ('nerd_neck', 9, 'neck-isometric-holds', 2, 5),
  ('nerd_neck', 11, 'neck-prone-extension', 2, 5),
  ('nerd_neck', 12, 'neck-face-pulls-pullaparts', 2, 5),
  ('nerd_neck', 14, 'neck-farmers-carry', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('nerd_neck', 'ccf_endurance_hold', 'Craniocervical Flexion Endurance Hold', 'Lying on your back, gently nod as if saying yes, creating a slight double chin without lifting the head. Hold as long as you can maintain good form without the neck''s superficial muscles taking over.', 'seconds', 'No universal norm -- track your own trend; most untrained people fatigue well under 30s at first.', 'higher', false, true, 1),
  ('nerd_neck', 'forward_head_wall_gap', 'Forward-Head Wall/Occiput Gap', 'Stand with heels, hips, and shoulder blades against a wall. Without tipping your chin up, try to touch the back of your head to the wall. Measure the remaining gap in cm.', 'cm', 'Smaller gap generally indicates more available upper-cervical range; track trend, not an absolute target.', 'lower', false, true, 2),
  ('nerd_neck', 'cervical_rotation_rom', 'Cervical Rotation Range of Motion', 'Seated, rotate your head fully to one side without moving your shoulders, noting how far your chin travels relative to your shoulder. Repeat to the other side.', 'degrees', 'Roughly 80 degrees each side is a commonly cited normal range.', 'higher', true, true, 3);
