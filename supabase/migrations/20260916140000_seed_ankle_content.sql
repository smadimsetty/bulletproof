with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Ankle: Banded Knee-to-Wall Mobilization', 'balance', 'mobility_stretch', array['ankle'], 'Self-administered mobilization-with-movement; trials show meaningful dorsiflexion gains persisting at least two days, with effects that appear mechanical rather than analgesic.', 'B', array['resistance_band'], 1, '20 reps', true, true),
    ('Ankle: Single-Leg Balance, Eyes Closed (Floor)', 'balance', 'balance', array['ankle'], 'Grade A for chronic ankle instability. The proprioceptive deficit after a lateral sprain is bilateral and does not resolve without specific balance training.', 'A', array[]::text[], 3, '30s', true, true),
    ('Ankle: Single-Leg Balance, Eyes Closed (Foam Pad)', 'balance', 'balance', array['ankle'], 'Progression of the floor variant once 30s is easy -- removing a stable surface drives further proprioceptive adaptation.', 'A', array['foam_pad'], 3, '30s', true, true),
    ('Ankle: Single-Leg Balance with Head Turns', 'balance', 'balance', array['ankle'], 'Further progression adding a vestibular/visual distraction on top of the unstable surface.', 'A', array['foam_pad'], 3, '30s', true, true),
    ('Ankle: Single-Leg Heel Raises', 'push', 'strength', array['ankle'], 'Standing heel-raise capacity is the most under-trained quality after an ankle sprain; most unrehabilitated ankles score in the teens against a 25-rep healthy threshold.', 'A', array[]::text[], 2, '15 reps', true, false),
    ('Ankle: Toe and Heel Walks', 'balance', 'balance', array['ankle'], 'Cheap tibialis-anterior and calf endurance work with a gait-pattern carryover.', 'C', array[]::text[], 1, '20m', true, false),
    ('Ankle: Banded Eversion', 'balance', 'strength', array['ankle'], 'The peroneals are the direct antagonist to the inversion sprain mechanism and are almost universally left untrained during self-managed recovery.', 'A', array['resistance_band'], 3, '15 reps', true, true),
    ('Ankle: Banded Inversion and Dorsiflexion', 'balance', 'strength', array['ankle'], 'Balances the eversion work; tibialis anterior and posterior matter for the whole kinetic chain.', 'B', array['resistance_band'], 3, '15 reps', true, false),
    ('Ankle: Weighted Single-Leg Calf Raise (Straight-Knee)', 'push', 'strength', array['ankle'], 'Heavy-slow-resistance principle applied to the gastrocnemius; progressive overload here is the single highest-value exercise for a post-sprain ankle.', 'A', array['dumbbell', 'step'], 4, '8-12 reps', true, false),
    ('Ankle: Weighted Single-Leg Calf Raise (Bent-Knee)', 'push', 'strength', array['ankle'], 'Bent-knee variant biases the soleus, which absorbs the majority of running load and is usually the weaker link.', 'A', array['dumbbell', 'step'], 4, '8-12 reps', true, false),
    ('Ankle: Wall Tibialis Raise', 'balance', 'strength', array['ankle'], 'Anterior tibialis capacity supports deceleration -- the dominant demand of lateral-movement sports.', 'B', array[]::text[], 3, '20 reps', false, false),
    ('Ankle: Wobble Board Balance', 'balance', 'balance', array['ankle'], 'Wobble-board protocols showed among the largest percentage improvements in a systematic review of chronic ankle instability rehab.', 'A', array['wobble_board'], 3, '45s', true, true),
    ('Ankle: Side-Lying Hip Abduction', 'core', 'strength', array['hip', 'ankle'], 'Hip strengthening is second only to balance work in ankle-instability rehab reviews -- the hip determines where the foot lands.', 'B', array[]::text[], 3, '12-15 reps', true, true),
    ('Ankle: Banded Lateral Walk', 'core', 'strength', array['hip', 'ankle'], 'Banded lateral walks train hip-abductor and ankle-stabilizer endurance together.', 'B', array['resistance_band'], 3, '20 steps', true, true),
    ('Ankle: Deep Squat Hold', 'squat', 'mobility_stretch', array['ankle', 'hip'], 'Loaded dorsiflexion at end range with a bodyweight stimulus.', 'A', array[]::text[], 2, '60s', false, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'ankle', 1, 'ankle-mobilization', id, 1, 1, '20 reps' from new_exercises where name = 'Ankle: Banded Knee-to-Wall Mobilization'
union all select 'ankle', 1, 'ankle-balance', id, 1, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance, Eyes Closed (Floor)'
union all select 'ankle', 1, 'ankle-balance', id, 2, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance, Eyes Closed (Foam Pad)'
union all select 'ankle', 1, 'ankle-balance', id, 3, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance with Head Turns'
union all select 'ankle', 1, 'ankle-calf-endurance', id, 1, 2, '15 reps' from new_exercises where name = 'Ankle: Single-Leg Heel Raises'
union all select 'ankle', 1, 'ankle-calf-endurance', id, 2, 1, '20m' from new_exercises where name = 'Ankle: Toe and Heel Walks'
union all select 'ankle', 2, 'ankle-eversion-strength', id, 1, 3, '15 reps' from new_exercises where name = 'Ankle: Banded Eversion'
union all select 'ankle', 2, 'ankle-inversion-dorsiflexion-strength', id, 1, 3, '15 reps' from new_exercises where name = 'Ankle: Banded Inversion and Dorsiflexion'
union all select 'ankle', 2, 'ankle-calf-strength-loaded', id, 1, 4, '8-12 reps' from new_exercises where name = 'Ankle: Weighted Single-Leg Calf Raise (Straight-Knee)'
union all select 'ankle', 2, 'ankle-calf-strength-loaded', id, 2, 4, '8-12 reps' from new_exercises where name = 'Ankle: Weighted Single-Leg Calf Raise (Bent-Knee)'
union all select 'ankle', 2, 'ankle-tibialis-strength', id, 1, 3, '20 reps' from new_exercises where name = 'Ankle: Wall Tibialis Raise'
union all select 'ankle', 2, 'ankle-balance-unstable', id, 1, 3, '45s' from new_exercises where name = 'Ankle: Wobble Board Balance'
union all select 'ankle', 2, 'ankle-hip-strength', id, 1, 3, '12-15 reps' from new_exercises where name = 'Ankle: Side-Lying Hip Abduction'
union all select 'ankle', 2, 'ankle-hip-strength', id, 2, 3, '20 steps' from new_exercises where name = 'Ankle: Banded Lateral Walk'
union all select 'ankle', 2, 'ankle-squat-hold', id, 1, 2, '60s' from new_exercises where name = 'Ankle: Deep Squat Hold';

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'ankle', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('ankle-mobilization', 1), ('ankle-balance', 2), ('ankle-calf-endurance', 3)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('ankle', 2, 'ankle-eversion-strength', 2, 4),
  ('ankle', 3, 'ankle-calf-strength-loaded', 2, 4),
  ('ankle', 5, 'ankle-inversion-dorsiflexion-strength', 2, 4),
  ('ankle', 6, 'ankle-tibialis-strength', 2, 4),
  ('ankle', 8, 'ankle-balance-unstable', 2, 4),
  ('ankle', 9, 'ankle-hip-strength', 2, 4),
  ('ankle', 11, 'ankle-squat-hold', 2, 4),
  ('ankle', 12, 'ankle-eversion-strength', 2, 4),
  ('ankle', 14, 'ankle-calf-strength-loaded', 2, 4);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('ankle', 'knee_to_wall', 'Weight-Bearing Lunge (Knee-to-Wall)', 'Barefoot, second toe pointed at the wall. Lunge forward keeping the heel flat until the knee touches the wall. Slide the foot back until you find the maximum distance at which the knee still touches with the heel down. Measure big toe to wall, in cm.', 'cm', 'Roughly 9-12cm is a common healthy range. Asymmetry beyond ~1.5cm vs. the other side is the meaningful signal.', 'symmetry', true, false, 1),
  ('ankle', 'heel_raise_capacity', 'Single-Leg Heel Raise Capacity', 'Standing on one leg, fingertips on a wall for balance only. Full-height heel raises at a metronome pace of one every two seconds. Count until you can no longer reach full height.', 'reps', '25+ repetitions is the widely used normative threshold.', 'higher', true, false, 2),
  ('ankle', 'balance_eyes_closed', 'Single-Leg Balance, Eyes Closed', 'Shoes off, hands on hips, non-stance foot off the ground. Time until you touch down, hop, or your hands leave your hips.', 'seconds', '30s is a reasonable target for a trained adult under 40.', 'higher', true, false, 3),
  ('ankle', 'y_balance_anterior', 'Y-Balance, Anterior Reach', 'Stand on one leg behind a line. Reach the other foot as far forward as possible, tap lightly, return without losing balance. Best of three, measured in cm.', 'cm', 'Asymmetry beyond ~4cm in the anterior direction is an established injury-risk marker.', 'symmetry', true, false, 4),
  ('ankle', 'side_hop', 'Side Hop Test (10 round trips)', 'Two lines 30cm apart. Hop laterally back and forth on one leg, 10 round trips, timed.', 'seconds', 'Within 10% side to side.', 'symmetry', true, false, 5),
  ('ankle', 'hop_for_distance', 'Single-Leg Hop for Distance', 'Hop as far as possible on one leg and stick the landing. Best of three.', 'cm', 'Limb Symmetry Index of 90% or better (injured / uninjured x 100).', 'symmetry', true, false, 6);
