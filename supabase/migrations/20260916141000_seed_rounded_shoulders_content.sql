with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Shoulder: Thoracic Extension Over Foam Roller', 'mobility', 'mobility_stretch', array['shoulder', 'thoracic_spine'], 'Overhead elevation requires thoracic extension; restoring it usually adds available shoulder range immediately.', 'B', array['foam_roller'], 1, '10 reps', false, true),
    ('Shoulder: Wall Slide', 'balance', 'strength', array['shoulder'], 'Trains coordinated scapular upward rotation through the overhead range.', 'A', array[]::text[], 1, '12 reps', false, true),
    ('Shoulder: Band Pull-Apart', 'pull', 'strength', array['shoulder'], 'Builds capacity and coordinated pulling to reduce the pull-into-flexion posture load without treating posture itself as the target.', 'A', array['resistance_band'], 1, '20 reps', false, false),
    ('Shoulder: Passive Hang', 'balance', 'mobility_stretch', array['shoulder'], 'Loaded end-range shoulder position with a stability demand -- builds overhead tolerance efficiently.', 'B', array['pull_up_bar'], 1, '30s', false, false),
    ('Shoulder: Active Scapular Hang', 'balance', 'strength', array['shoulder'], 'Progression of the passive hang, pulling the shoulder blades down to add a strength component.', 'B', array['pull_up_bar'], 1, '20s', false, false),
    ('Shoulder: Full-Range Dumbbell Overhead Press', 'push', 'strength', array['shoulder'], 'Builds range and capacity together; loaded full-range work beats isolated band exercises for a trained population.', 'A', array['dumbbell'], 3, '8 reps', false, false),
    ('Shoulder: Prone Y Raise', 'pull', 'strength', array['shoulder'], 'One of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Prone T Raise', 'pull', 'strength', array['shoulder'], 'Second of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Prone W Raise', 'pull', 'strength', array['shoulder'], 'Third of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Banded External Rotation at 90 Abduction', 'pull', 'strength', array['shoulder'], 'The specific joint position where throwing and overhead-smash loads occur.', 'A', array['resistance_band'], 3, '12 reps', true, false),
    ('Shoulder: Face Pull', 'pull', 'strength', array['shoulder'], 'High-elbow external rotation at the end position; upper back strength meaningfully offloads the shoulder and neck.', 'B', array['resistance_band'], 3, '15 reps', false, false),
    ('Shoulder: Bottoms-Up Kettlebell Carry', 'core', 'strength', array['shoulder'], 'Enormous stability demand at low absolute load -- excellent for rotator-cuff coordination.', 'B', array['kettlebell'], 3, '20s', true, false),
    ('Shoulder: Bottoms-Up Kettlebell Press', 'push', 'strength', array['shoulder'], 'Same stability demand as the carry variant, applied through a pressing pattern.', 'B', array['kettlebell'], 3, '6 reps', true, false),
    ('Shoulder: Serratus Wall Slide with Band', 'balance', 'strength', array['shoulder'], 'Targets scapular upward rotation specifically, the motion overhead elevation depends on most.', 'B', array['resistance_band'], 3, '12 reps', false, true)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'rounded_shoulders', 1, 'shoulder-thoracic-extension', id, 1, 1, '10 reps' from new_exercises where name = 'Shoulder: Thoracic Extension Over Foam Roller'
union all select 'rounded_shoulders', 1, 'shoulder-wall-slides', id, 1, 1, '12 reps' from new_exercises where name = 'Shoulder: Wall Slide'
union all select 'rounded_shoulders', 1, 'shoulder-band-pull-aparts', id, 1, 1, '20 reps' from new_exercises where name = 'Shoulder: Band Pull-Apart'
union all select 'rounded_shoulders', 1, 'shoulder-passive-hang', id, 1, 1, '30s' from new_exercises where name = 'Shoulder: Passive Hang'
union all select 'rounded_shoulders', 1, 'shoulder-passive-hang', id, 2, 1, '20s' from new_exercises where name = 'Shoulder: Active Scapular Hang'
union all select 'rounded_shoulders', 2, 'shoulder-overhead-press-full-range', id, 1, 3, '8 reps' from new_exercises where name = 'Shoulder: Full-Range Dumbbell Overhead Press'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 1, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone Y Raise'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 2, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone T Raise'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 3, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone W Raise'
union all select 'rounded_shoulders', 2, 'shoulder-external-rotation-90', id, 1, 3, '12 reps' from new_exercises where name = 'Shoulder: Banded External Rotation at 90 Abduction'
union all select 'rounded_shoulders', 2, 'shoulder-face-pulls', id, 1, 3, '15 reps' from new_exercises where name = 'Shoulder: Face Pull'
union all select 'rounded_shoulders', 2, 'shoulder-bottoms-up-carry-press', id, 1, 3, '20s' from new_exercises where name = 'Shoulder: Bottoms-Up Kettlebell Carry'
union all select 'rounded_shoulders', 2, 'shoulder-bottoms-up-carry-press', id, 2, 3, '6 reps' from new_exercises where name = 'Shoulder: Bottoms-Up Kettlebell Press'
union all select 'rounded_shoulders', 2, 'shoulder-serratus-wall-slides', id, 1, 3, '12 reps' from new_exercises where name = 'Shoulder: Serratus Wall Slide with Band';

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'rounded_shoulders', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('shoulder-thoracic-extension', 1), ('shoulder-wall-slides', 2), ('shoulder-band-pull-aparts', 3), ('shoulder-passive-hang', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('rounded_shoulders', 2, 'shoulder-overhead-press-full-range', 2, 5),
  ('rounded_shoulders', 3, 'shoulder-scapular-raises', 2, 5),
  ('rounded_shoulders', 5, 'shoulder-external-rotation-90', 2, 5),
  ('rounded_shoulders', 6, 'shoulder-face-pulls', 2, 5),
  ('rounded_shoulders', 8, 'shoulder-bottoms-up-carry-press', 2, 5),
  ('rounded_shoulders', 9, 'shoulder-serratus-wall-slides', 2, 5),
  ('rounded_shoulders', 11, 'shoulder-overhead-press-full-range', 2, 5),
  ('rounded_shoulders', 12, 'shoulder-scapular-raises', 2, 5),
  ('rounded_shoulders', 14, 'shoulder-face-pulls', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('rounded_shoulders', 'wall_overhead_reach', 'Wall Slide / Overhead Reach', 'Back to a wall, heels a few inches out, low back flattened against the wall. Raise both arms overhead, trying to keep wrists, elbows, and low back in contact.', 'pass/fail', 'Arms reach overhead without the low back arching off the wall.', 'higher', false, false, 1),
  ('rounded_shoulders', 'apley_scratch', 'Apley Scratch', 'Reach one hand over the shoulder down the back, the other up the back from below. Measure the gap between fingertips.', 'cm', 'Asymmetry greater than a few centimetres points to a rotational restriction on one side.', 'symmetry', true, false, 2),
  ('rounded_shoulders', 'supine_external_rotation', 'Supine External Rotation at 90', 'Lying down, shoulder abducted 90, elbow bent 90, rotate the forearm back toward the floor.', 'degrees', 'Roughly 90 to the floor.', 'symmetry', true, false, 3),
  ('rounded_shoulders', 'sleeper_stretch_ir', 'Sleeper Stretch Position (Internal Rotation)', 'Side-lying on the shoulder being tested, arm at 90, gently rotate the forearm toward the floor.', 'degrees', 'A deficit greater than ~20 compared with the other side is worth addressing.', 'symmetry', true, false, 4),
  ('rounded_shoulders', 'pushup_plus_control', 'Push-Up Plus / Scapular Control', 'In a push-up position, protract the shoulder blades at the top and retract at the bottom, slowly.', 'pass/fail', 'No winging or shrugging.', 'higher', false, false, 5);
