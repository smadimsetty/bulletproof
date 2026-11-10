-- Logger polish + sprints, task C3: three new sprints (Full Body, Total Mobility, Knees),
-- a bodyweight option for every sprint slot that lacked one, and human-voice
-- taglines/descriptions for all pain points. Runs after 20261109150000 (cue, tagline, normalized body_parts).

insert into pain_points (id, display_name, description, tagline, sort_order) values
  ('full_body', 'Full Body', 'Stiffness that shows up everywhere usually comes from sitting too long. This sprint gives your spine, hips, shoulders and neck a little movement every day. It is built for people who spend most of the day at a desk.', 'For desk workers with stiffness everywhere', 5),
  ('total_mobility', 'Total Mobility', 'You already train, and this sprint adds the mobility and recovery work that training usually skips. It covers your hips, upper back, shoulders and wrists in short daily sessions. Expect to move better and feel looser between workouts.', 'Feel-good mobility and recovery for people who already train', 6),
  ('knees', 'Knees', 'Healthy knees depend on the hips and ankles above and below them. This sprint builds quad, hamstring and hip strength, plus ankle range, so your knees handle stairs, squats and running. It is meant for knees that work well now and that you want to keep that way.', 'Pain-free, resilient knees', 7);

update pain_points set tagline = 'Steadier ankles that hold up when you move fast', description = 'Ankles that have been sprained stay stiff and wobbly unless you train them. This sprint works on how far your ankle bends, how well you balance, and how strong your calves and outer ankle are.' where id = 'ankle';
update pain_points set tagline = 'Open up your chest and strengthen your upper back', description = 'Hours of sitting pull your shoulders forward and tighten your chest. This sprint opens up your chest and builds the upper back muscles that hold your shoulders back, so overhead and behind-the-back movement feels easier.' where id = 'rounded_shoulders';
update pain_points set tagline = 'Ease neck strain from long hours at a screen', description = 'When your head drifts forward, your neck works hard all day. This sprint strengthens the small muscles at the front of your neck and the upper back, and loosens the muscles that get tight from looking at screens.' where id = 'nerd_neck';
update pain_points set tagline = 'Balance tight hips with a stronger core and glutes', description = 'Tight hip flexors and sleepy glutes can tip your pelvis forward and strain your lower back. This sprint stretches the front of your hips and builds your abs and glutes to hold your pelvis level.' where id = 'anterior_pelvic_tilt';

insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective, cue, description) values
  ('Ankle: Slow Single-Leg Calf Raise on Step', 'push', 'strength', array['ankles'], 'Slow, bodyweight calf loading builds the same capacity as the weighted version and is where most people should start before adding load.', 'A', array['step'], 3, '10 reps', true, false, 'Stand on one foot on the edge of a step. Rise up for 2 seconds, then lower for 3 seconds, all the way down.', 'A slow calf raise on one leg, with no weight. It builds calf strength and ankle control with nothing but a step.'),
  ('Ankle: Outer-Edge Foot Walk', 'balance', 'strength', array['ankles', 'feet'], 'Walking on the outsides of the feet loads the peroneal muscles that resist the inversion sprain mechanism, with no equipment.', 'C', array[]::text[], 2, '20 steps', false, false, 'Roll onto the outer edges of both feet and walk slowly, keeping your toes curled in a little.', 'A slow walk on the outside edges of your feet. It works the muscles on the outside of the ankle that protect you from rolling it.'),
  ('Shoulder: Prone Scapular Retraction Hold', 'pull', 'strength', array['shoulders', 'thoracic_spine'], 'Isometric scapular retraction trains the mid-back muscles that band pull-aparts target, without any equipment.', 'C', array[]::text[], 3, '5s holds', false, false, 'Lie face down with your arms by your sides. Squeeze your shoulder blades together and hold for 5 seconds.', 'A face-down squeeze of the shoulder blades. It trains the muscles between your shoulder blades that hold your shoulders back.'),
  ('Shoulder: Pike Push-Up', 'push', 'strength', array['shoulders'], 'Bodyweight vertical pressing loads the shoulder through overhead range and is a standard progression toward handstand work.', 'B', array['bodyweight'], 3, '6-10 reps', false, false, 'Start in a downward dog shape with your hips high. Bend your elbows to lower your head toward the floor, then press back up.', 'A push-up with your hips raised, so you press up and down through your shoulders. It builds overhead strength without weights.'),
  ('Shoulder: Wall Overhead Hip-Hinge Stretch', 'mobility', 'mobility_stretch', array['shoulders', 'thoracic_spine'], 'Passive overhead lat and shoulder-flexion stretch that replaces a bar hang when no bar is available.', 'C', array['wall'], 2, '30s', false, false, 'Put your hands on a wall at chest height and walk your feet back. Push your chest toward the floor until you feel a stretch under your arms.', 'A stretch with your hands on a wall and your chest sinking down. It opens up the sides of your back and your shoulders.'),
  ('Neck: Forearm Plank, Shoulders Pushed Away', 'core', 'strength', array['neck', 'shoulders'], 'Plank with active serratus protraction gives the scapular and neck-stabilizer endurance demand of a loaded carry without a weight.', 'C', array[]::text[], 3, '30s', false, false, 'Hold a forearm plank and push the floor away so your upper back rounds up slightly. Keep your head in line with your spine.', 'A forearm plank where you keep pushing the floor away. It builds endurance in the muscles that hold your shoulders and neck steady.'),
  ('Neck: Towel Doorway Row', 'pull', 'strength', array['shoulders', 'thoracic_spine'], 'Bodyweight horizontal row using a towel anchored in a door provides pulling volume for the mid-back without weights.', 'C', array['towel', 'doorway'], 3, '10 reps', false, false, 'Loop a towel around both sides of a closed door''s handle and hold the ends. Lean back with straight arms, then pull your chest toward the door.', 'A row where you lean back and pull yourself toward a closed door with a towel. It works the upper back muscles that keep your head over your shoulders.'),
  ('Full Body: Standing Side Bend Reach', 'mobility', 'mobility_stretch', array['thoracic_spine', 'lower_back', 'shoulders'], 'Lateral spinal and shoulder-line mobility is rarely moved in seated work; slow end-range side bends restore it.', 'C', array['none'], 2, '8 each side', true, false, 'Stand tall and reach one arm overhead. Lean sideways slowly until you feel a stretch along your side, then switch.', 'A slow side bend with one arm reaching overhead. It loosens the sides of your torso, which stay still when you sit all day.'),
  ('Full Body: Wall Hip Hinge', 'hinge', 'strength', array['hips', 'hamstrings', 'lower_back'], 'Learning to hinge at the hip instead of the lower back reduces lumbar load in daily bending; the wall gives immediate feedback.', 'B', array['wall'], 2, '10 reps', false, false, 'Stand with your back to a wall, feet a short step out. Push your hips back to touch the wall with a flat back, then stand up.', 'A hip hinge where your bottom taps a wall behind you. It teaches you to bend from the hips instead of your lower back.'),
  ('Full Body: Glute Bridge', 'hinge', 'strength', array['hips', 'lower_back'], 'Sitting inhibits the glutes; bridges re-activate them and are low-risk for the lower back.', 'B', array[]::text[], 2, '12 reps', false, true, 'Lie on your back with your knees bent. Push through your heels to lift your hips until your body makes a straight line, then lower.', 'A lift of your hips from the floor with your knees bent. It wakes up the glute muscles that go quiet when you sit.'),
  ('Mobility: Open Book Thoracic Rotation', 'mobility', 'mobility_stretch', array['thoracic_spine', 'shoulders'], 'Side-lying thoracic rotation is a well-supported drill for upper-back rotation and does not need equipment.', 'B', array[]::text[], 2, '8 each side', true, true, 'Lie on your side with your knees bent and stacked. Open your top arm out and back like a book, follow your hand with your eyes, then return.', 'A rotation of your upper back while lying on your side. It adds the twisting range that lifting and desk work take away.'),
  ('Mobility: Cossack Squat Flow', 'squat', 'mobility_stretch', array['hips', 'ankles', 'knees'], 'Lateral loaded hip and adductor range is under-trained in sagittal-plane lifting programs.', 'C', array['bodyweight'], 2, '6 each side', true, false, 'Stand wide with your toes turned out slightly. Shift your weight to one side and sit down into that hip, keeping the other leg straight, then switch.', 'A wide side-to-side squat where you sit into one hip at a time. It opens your inner thighs and hips, which barbell lifts rarely cover.'),
  ('Mobility: Wrist Prayer Stretch', 'mobility', 'mobility_stretch', array['wrists', 'elbows'], 'Wrist extension range is routinely limited in people who press and grip heavily; simple end-range holds are a low-risk way to maintain it.', 'C', array[]::text[], 2, '30s', false, false, 'Press your palms together in front of your chest. Lower your hands toward your belly while keeping your palms touching.', 'A stretch with your palms pressed together and lowered toward your waist. It loosens wrists that get tight from gripping and pressing.'),
  ('Mobility: Diaphragmatic Breathing, Legs Elevated', 'mobility', 'mobility_stretch', array['lower_back', 'hips'], 'Slow nasal breathing with a long exhale shifts the body toward parasympathetic activity and is a common recovery downshift after training.', 'C', array['none'], 1, '2 min', false, false, 'Lie on your back with your calves on a chair or couch. Breathe in through your nose for 4 seconds and out slowly for 6.', 'Slow belly breathing while lying down with your legs up. It settles your body after training and gives your lower back a rest.'),
  ('Knees: Slow Eccentric Step-Down', 'squat', 'strength', array['knees', 'hips'], 'Eccentric step-downs are a standard loading exercise for patellofemoral and patellar tendon problems and train knee control on stairs.', 'B', array['step'], 3, '8 reps', true, true, 'Stand on a step on one foot. Slowly lower the other heel toward the floor over 3 seconds without letting your knee cave in, then stand back up.', 'A slow step down from a stair on one leg. It builds the knee control you need for stairs and landing.'),
  ('Knees: Wall Sit', 'squat', 'strength', array['knees', 'hips'], 'Isometric quad holds load the knee without joint movement and are widely used when knees are sensitive to repeated bending.', 'C', array['wall'], 3, '30s', false, false, 'Lean your back on a wall and slide down until your knees are bent to about 90 degrees. Hold and breathe.', 'A seated position against a wall with nothing under you. It builds quad endurance with very little stress on the knee joint.'),
  ('Knees: Tempo Split Squat', 'squat', 'strength', array['knees', 'hips', 'ankles'], 'Slow split squats train the knee over the toes under control, which is the pattern most knee-resilience programs build toward.', 'B', array['none'], 3, '8 each side', true, true, 'Take a long stance with one foot forward. Lower down for 3 seconds with your front heel flat, then push back up.', 'A lunge position where you sink down slowly and stand back up. It builds strength in the front of your thigh and hip with your knee tracking over your foot.'),
  ('Knees: Single-Leg Sit-to-Stand', 'squat', 'strength', array['knees', 'hips'], 'A functional single-leg strength task that doubles as a common field test for knee control.', 'C', array['bodyweight'], 3, '6 each side', true, false, 'Sit on a chair with one foot on the floor and the other held out. Stand up on that one leg and sit back down slowly.', 'Standing up from a chair on one leg. It tests and builds the strength your knee needs for everyday movement.'),
  ('Knees: Single-Leg Mini Squat', 'squat', 'balance', array['knees', 'ankles', 'hips'], 'Small single-leg knee bends train dynamic knee alignment and are used in knee pain and ACL prevention programs.', 'B', array['none'], 3, '8 each side', true, true, 'Stand on one leg, hands on your hips. Bend your knee a short way, keep it pointing over your toes, then stand up.', 'A shallow squat on one leg. It trains your knee to stay lined up over your foot.'),
  ('Knees: Slider Hamstring Curl', 'hinge', 'strength', array['knees', 'hamstrings'], 'Eccentric hamstring work protects the knee, since the hamstrings share load with the ACL.', 'B', array['towel'], 3, '8 reps', false, false, 'Lie on your back with your heels on a towel on a smooth floor and your hips lifted. Slide your heels away slowly, then pull them back in.', 'A bridge where you slide your heels out and back on a towel. It strengthens the back of your thigh, which supports the knee.');

-- Bodyweight options for existing sprint slots that had none
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'ankle', 1, 'ankle-mobilization', (select id from exercises where name = 'Half-Kneeling Ankle Mobilization' and owner_id is null), 2, 1, '15 reps'
union all select 'ankle', 2, 'ankle-eversion-strength', (select id from exercises where name = 'Ankle: Outer-Edge Foot Walk' and owner_id is null), 2, 2, '20 steps'
union all select 'ankle', 2, 'ankle-inversion-dorsiflexion-strength', (select id from exercises where name = 'Ankle: Toe and Heel Walks' and owner_id is null), 2, 1, '20m'
union all select 'ankle', 2, 'ankle-calf-strength-loaded', (select id from exercises where name = 'Ankle: Slow Single-Leg Calf Raise on Step' and owner_id is null), 3, 3, '10 reps'
union all select 'ankle', 2, 'ankle-balance-unstable', (select id from exercises where name = 'Single-Leg Deadlift Reach to Cone' and owner_id is null), 2, 3, '8 reps'
union all select 'rounded_shoulders', 2, 'shoulder-band-pull-aparts', (select id from exercises where name = 'Shoulder: Prone Scapular Retraction Hold' and owner_id is null), 2, 3, '5s holds'
union all select 'rounded_shoulders', 2, 'shoulder-bottoms-up-carry-press', (select id from exercises where name = 'Plank with Shoulder Taps' and owner_id is null), 3, 3, '10 each side'
union all select 'rounded_shoulders', 2, 'shoulder-external-rotation-90', (select id from exercises where name = 'Wall Slide with External Rotation' and owner_id is null), 2, 2, '10 reps'
union all select 'rounded_shoulders', 2, 'shoulder-face-pulls', (select id from exercises where name = 'Shoulder: Prone W Raise' and owner_id is null), 2, 3, '10 reps'
union all select 'rounded_shoulders', 2, 'shoulder-overhead-press-full-range', (select id from exercises where name = 'Shoulder: Pike Push-Up' and owner_id is null), 2, 3, '6-10 reps'
union all select 'rounded_shoulders', 2, 'shoulder-passive-hang', (select id from exercises where name = 'Shoulder: Wall Overhead Hip-Hinge Stretch' and owner_id is null), 3, 2, '30s'
union all select 'rounded_shoulders', 2, 'shoulder-serratus-wall-slides', (select id from exercises where name = 'Scapular Wall Slides' and owner_id is null), 2, 2, '10 reps'
union all select 'rounded_shoulders', 2, 'shoulder-thoracic-extension', (select id from exercises where name = 'Neck: Thoracic Extension Over Chair Back' and owner_id is null), 2, 2, '10 reps'
union all select 'anterior_pelvic_tilt', 2, 'apt-loaded-carry', (select id from exercises where name = 'Plank with Shoulder Taps' and owner_id is null), 2, 3, '10 each side'
union all select 'anterior_pelvic_tilt', 2, 'apt-loaded-hip-hinge', (select id from exercises where name = 'Single-Leg Deadlift Reach to Cone' and owner_id is null), 2, 3, '8 reps'
union all select 'anterior_pelvic_tilt', 2, 'apt-split-squat', (select id from exercises where name = 'Knees: Tempo Split Squat' and owner_id is null), 2, 3, '8 each side'
union all select 'nerd_neck', 2, 'neck-face-pulls-pullaparts', (select id from exercises where name = 'Shoulder: Prone Scapular Retraction Hold' and owner_id is null), 3, 3, '5s holds'
union all select 'nerd_neck', 2, 'neck-farmers-carry', (select id from exercises where name = 'Neck: Forearm Plank, Shoulders Pushed Away' and owner_id is null), 2, 3, '30s'
union all select 'nerd_neck', 2, 'neck-rows', (select id from exercises where name = 'Neck: Towel Doorway Row' and owner_id is null), 2, 3, '10 reps';

-- New sprint pools
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'full_body', 1, 'fb-spine-mobility', (select id from exercises where name = 'Cat-Cow' and owner_id is null), 1, 1, '10 reps'
union all select 'full_body', 1, 'fb-spine-mobility', (select id from exercises where name = 'Thread the Needle' and owner_id is null), 2, 1, '6 each side'
union all select 'full_body', 1, 'fb-spine-mobility', (select id from exercises where name = 'Neck: Thoracic Extension Over Chair Back' and owner_id is null), 3, 1, '10 reps'
union all select 'full_body', 1, 'fb-hip-opener', (select id from exercises where name = '90/90 Hip Switch' and owner_id is null), 1, 1, '8 reps'
union all select 'full_body', 1, 'fb-hip-opener', (select id from exercises where name = 'Half-Kneeling Hip Flexor Stretch with Reach' and owner_id is null), 2, 1, '45s each side'
union all select 'full_body', 1, 'fb-hip-opener', (select id from exercises where name = 'Couch stretch' and owner_id is null), 3, 1, '45s each side'
union all select 'full_body', 1, 'fb-chest-shoulder-opener', (select id from exercises where name = 'Scapular Wall Slides' and owner_id is null), 1, 1, '10 reps'
union all select 'full_body', 1, 'fb-chest-shoulder-opener', (select id from exercises where name = 'Doorway Pec Stretch' and owner_id is null), 2, 1, '45s'
union all select 'full_body', 1, 'fb-chest-shoulder-opener', (select id from exercises where name = 'Shoulder CARs' and owner_id is null), 3, 1, '5 each direction'
union all select 'full_body', 2, 'fb-hamstring-calf', (select id from exercises where name = 'Standing Hamstring Stretch' and owner_id is null), 1, 1, '45s each side'
union all select 'full_body', 2, 'fb-hamstring-calf', (select id from exercises where name = 'Standing Toe Touch with Reach-Through' and owner_id is null), 2, 1, '8 reps'
union all select 'full_body', 2, 'fb-hamstring-calf', (select id from exercises where name = 'Full Body: Wall Hip Hinge' and owner_id is null), 3, 2, '10 reps'
union all select 'full_body', 2, 'fb-squat-hold', (select id from exercises where name = 'Deep squat hold' and owner_id is null), 1, 2, '45s'
union all select 'full_body', 2, 'fb-squat-hold', (select id from exercises where name = 'Asian Squat Hold' and owner_id is null), 2, 2, '45s'
union all select 'full_body', 2, 'fb-neck-release', (select id from exercises where name = 'Chin tucks' and owner_id is null), 1, 1, '10 reps'
union all select 'full_body', 2, 'fb-neck-release', (select id from exercises where name = 'Levator scapulae stretch' and owner_id is null), 2, 1, '30s each side'
union all select 'full_body', 2, 'fb-neck-release', (select id from exercises where name = 'Neck Rotation Stretch' and owner_id is null), 3, 1, '30s each side'
union all select 'full_body', 2, 'fb-glute-wakeup', (select id from exercises where name = 'Full Body: Glute Bridge' and owner_id is null), 1, 2, '12 reps'
union all select 'full_body', 2, 'fb-glute-wakeup', (select id from exercises where name = 'Fire Hydrant' and owner_id is null), 2, 2, '10 each side'
union all select 'full_body', 2, 'fb-full-body-flow', (select id from exercises where name = 'World''s Greatest Stretch' and owner_id is null), 1, 1, '5 each side'
union all select 'full_body', 2, 'fb-full-body-flow', (select id from exercises where name = 'Full Body: Standing Side Bend Reach' and owner_id is null), 2, 2, '8 each side'
union all select 'full_body', 2, 'fb-full-body-flow', (select id from exercises where name = 'Leg Swings' and owner_id is null), 3, 1, '10 each direction'
union all select 'full_body', 2, 'fb-ankle-wrist', (select id from exercises where name = 'Ankle Circles' and owner_id is null), 1, 1, '10 each direction'
union all select 'full_body', 2, 'fb-ankle-wrist', (select id from exercises where name = 'Wrist Mobility Flow (flexion/extension/circles)' and owner_id is null), 2, 1, '1 min'
union all select 'total_mobility', 1, 'tm-hip-flow', (select id from exercises where name = 'World''s Greatest Stretch' and owner_id is null), 1, 1, '5 each side'
union all select 'total_mobility', 1, 'tm-hip-flow', (select id from exercises where name = '90/90 Hip Switch' and owner_id is null), 2, 1, '8 reps'
union all select 'total_mobility', 1, 'tm-hip-flow', (select id from exercises where name = '90/90 hip stretch' and owner_id is null), 3, 1, '90s each side'
union all select 'total_mobility', 1, 'tm-upper-back', (select id from exercises where name = 'Mobility: Open Book Thoracic Rotation' and owner_id is null), 1, 1, '8 each side'
union all select 'total_mobility', 1, 'tm-upper-back', (select id from exercises where name = 'Thread the Needle' and owner_id is null), 2, 1, '6 each side'
union all select 'total_mobility', 1, 'tm-upper-back', (select id from exercises where name = 'Thoracic Rotation on Foam Roller' and owner_id is null), 3, 1, '8 each side'
union all select 'total_mobility', 1, 'tm-squat-ankles', (select id from exercises where name = 'Deep squat hold' and owner_id is null), 1, 2, '45s'
union all select 'total_mobility', 1, 'tm-squat-ankles', (select id from exercises where name = 'Mobility: Cossack Squat Flow' and owner_id is null), 2, 2, '6 each side'
union all select 'total_mobility', 1, 'tm-squat-ankles', (select id from exercises where name = 'Half-Kneeling Ankle Mobilization' and owner_id is null), 3, 1, '12 each side'
union all select 'total_mobility', 2, 'tm-hamstring', (select id from exercises where name = 'Standing Hamstring Stretch' and owner_id is null), 1, 1, '45s each side'
union all select 'total_mobility', 2, 'tm-hamstring', (select id from exercises where name = 'Standing Toe Touch with Reach-Through' and owner_id is null), 2, 1, '8 reps'
union all select 'total_mobility', 2, 'tm-hamstring', (select id from exercises where name = 'PNF hamstring stretch' and owner_id is null), 3, 1, '3 rounds'
union all select 'total_mobility', 2, 'tm-hip-flexor-quad', (select id from exercises where name = 'Couch stretch' and owner_id is null), 1, 1, '60s each side'
union all select 'total_mobility', 2, 'tm-hip-flexor-quad', (select id from exercises where name = 'Half-Kneeling Hip Flexor Stretch with Reach' and owner_id is null), 2, 1, '45s each side'
union all select 'total_mobility', 2, 'tm-hip-flexor-quad', (select id from exercises where name = 'Standing Quad Stretch' and owner_id is null), 3, 1, '30s each side'
union all select 'total_mobility', 2, 'tm-chest-shoulder', (select id from exercises where name = 'Doorway Pec Stretch' and owner_id is null), 1, 1, '45s'
union all select 'total_mobility', 2, 'tm-chest-shoulder', (select id from exercises where name = 'Shoulder CARs' and owner_id is null), 2, 1, '5 each direction'
union all select 'total_mobility', 2, 'tm-chest-shoulder', (select id from exercises where name = 'Towel Behind-Back Shoulder Stretch' and owner_id is null), 3, 1, '30s each side'
union all select 'total_mobility', 2, 'tm-glute-activation', (select id from exercises where name = 'Fire Hydrant' and owner_id is null), 1, 2, '10 each side'
union all select 'total_mobility', 2, 'tm-glute-activation', (select id from exercises where name = 'APT: Single-Leg Glute Bridge' and owner_id is null), 2, 2, '10 each side'
union all select 'total_mobility', 2, 'tm-wrist-forearm', (select id from exercises where name = 'Wrist Mobility Flow (flexion/extension/circles)' and owner_id is null), 1, 1, '1 min'
union all select 'total_mobility', 2, 'tm-wrist-forearm', (select id from exercises where name = 'Mobility: Wrist Prayer Stretch' and owner_id is null), 2, 2, '30s'
union all select 'total_mobility', 2, 'tm-recovery-breathing', (select id from exercises where name = 'Mobility: Diaphragmatic Breathing, Legs Elevated' and owner_id is null), 1, 1, '2 min'
union all select 'total_mobility', 2, 'tm-recovery-breathing', (select id from exercises where name = 'Knee-to-Chest Stretch' and owner_id is null), 2, 1, '45s each side'
union all select 'knees', 1, 'knees-ankle-dorsiflexion', (select id from exercises where name = 'Half-Kneeling Ankle Mobilization' and owner_id is null), 1, 1, '12 each side'
union all select 'knees', 1, 'knees-ankle-dorsiflexion', (select id from exercises where name = 'Ankle: Banded Knee-to-Wall Mobilization' and owner_id is null), 2, 1, '15 reps'
union all select 'knees', 1, 'knees-quad-capacity', (select id from exercises where name = 'Knees: Slow Eccentric Step-Down' and owner_id is null), 1, 3, '8 reps'
union all select 'knees', 1, 'knees-quad-capacity', (select id from exercises where name = 'Reverse Nordic Curl' and owner_id is null), 2, 2, '6 reps'
union all select 'knees', 1, 'knees-quad-capacity', (select id from exercises where name = 'Knees: Wall Sit' and owner_id is null), 3, 3, '30s'
union all select 'knees', 1, 'knees-hip-strength', (select id from exercises where name = 'Ankle: Side-Lying Hip Abduction' and owner_id is null), 1, 2, '12 each side'
union all select 'knees', 1, 'knees-hip-strength', (select id from exercises where name = 'Lateral Band Walk' and owner_id is null), 2, 2, '15 steps'
union all select 'knees', 1, 'knees-hip-strength', (select id from exercises where name = 'Fire Hydrant' and owner_id is null), 3, 2, '10 each side'
union all select 'knees', 2, 'knees-split-squat', (select id from exercises where name = 'Knees: Tempo Split Squat' and owner_id is null), 1, 3, '8 each side'
union all select 'knees', 2, 'knees-split-squat', (select id from exercises where name = 'Knees: Single-Leg Sit-to-Stand' and owner_id is null), 2, 3, '6 each side'
union all select 'knees', 2, 'knees-single-leg-control', (select id from exercises where name = 'Knees: Single-Leg Mini Squat' and owner_id is null), 1, 3, '8 each side'
union all select 'knees', 2, 'knees-single-leg-control', (select id from exercises where name = 'Y-Balance Reach' and owner_id is null), 2, 2, '5 each direction'
union all select 'knees', 2, 'knees-single-leg-control', (select id from exercises where name = 'Single-Leg Deadlift Reach to Cone' and owner_id is null), 3, 3, '8 reps'
union all select 'knees', 2, 'knees-hamstring', (select id from exercises where name = 'Nordic hamstring curl' and owner_id is null), 1, 3, '5 reps'
union all select 'knees', 2, 'knees-hamstring', (select id from exercises where name = 'Knees: Slider Hamstring Curl' and owner_id is null), 2, 3, '8 reps'
union all select 'knees', 2, 'knees-calf-tibialis', (select id from exercises where name = 'Ankle: Single-Leg Heel Raises' and owner_id is null), 1, 2, '15 reps'
union all select 'knees', 2, 'knees-calf-tibialis', (select id from exercises where name = 'Eccentric Heel Drop' and owner_id is null), 2, 2, '10 reps'
union all select 'knees', 2, 'knees-calf-tibialis', (select id from exercises where name = 'Ankle: Wall Tibialis Raise' and owner_id is null), 3, 2, '20 reps'
union all select 'knees', 2, 'knees-quad-length', (select id from exercises where name = 'Standing Quad Stretch' and owner_id is null), 1, 1, '30s each side'
union all select 'knees', 2, 'knees-quad-length', (select id from exercises where name = 'Couch stretch' and owner_id is null), 2, 1, '45s each side';

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'full_body', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('fb-spine-mobility', 1), ('fb-hip-opener', 2), ('fb-chest-shoulder-opener', 3)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('full_body', 2, 'fb-hamstring-calf', 2, 4),
  ('full_body', 3, 'fb-squat-hold', 2, 4),
  ('full_body', 5, 'fb-neck-release', 2, 4),
  ('full_body', 6, 'fb-glute-wakeup', 2, 4),
  ('full_body', 8, 'fb-full-body-flow', 2, 4),
  ('full_body', 9, 'fb-ankle-wrist', 2, 4),
  ('full_body', 11, 'fb-hamstring-calf', 2, 4),
  ('full_body', 12, 'fb-squat-hold', 2, 4),
  ('full_body', 14, 'fb-neck-release', 2, 4);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'total_mobility', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('tm-hip-flow', 1), ('tm-upper-back', 2), ('tm-squat-ankles', 3)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('total_mobility', 2, 'tm-hamstring', 2, 4),
  ('total_mobility', 3, 'tm-chest-shoulder', 2, 4),
  ('total_mobility', 5, 'tm-hip-flexor-quad', 2, 4),
  ('total_mobility', 6, 'tm-glute-activation', 2, 4),
  ('total_mobility', 8, 'tm-wrist-forearm', 2, 4),
  ('total_mobility', 9, 'tm-recovery-breathing', 2, 4),
  ('total_mobility', 11, 'tm-hamstring', 2, 4),
  ('total_mobility', 12, 'tm-chest-shoulder', 2, 4),
  ('total_mobility', 14, 'tm-recovery-breathing', 2, 4);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'knees', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('knees-ankle-dorsiflexion', 1), ('knees-quad-capacity', 2), ('knees-hip-strength', 3)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('knees', 2, 'knees-split-squat', 2, 4),
  ('knees', 3, 'knees-hamstring', 2, 4),
  ('knees', 5, 'knees-single-leg-control', 2, 4),
  ('knees', 6, 'knees-calf-tibialis', 2, 4),
  ('knees', 8, 'knees-quad-length', 2, 4),
  ('knees', 9, 'knees-split-squat', 2, 4),
  ('knees', 11, 'knees-single-leg-control', 2, 4),
  ('knees', 12, 'knees-hamstring', 2, 4),
  ('knees', 14, 'knees-calf-tibialis', 2, 4);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('full_body', 'toe_touch_reach', 'Standing Toe Touch', 'Stand with your feet together and reach down with straight knees. Measure the distance from your fingertips to the floor, in cm. Enter 0 if your fingers touch the floor.', 'cm', '0 cm, with your fingers touching the floor.', 'lower', false, false, 1),
  ('full_body', 'deep_squat_hold', 'Deep Squat Hold', 'Squat as low as you can with your heels down. Time how long you can stay there, up to 60 seconds.', 'seconds', '60 seconds with your heels flat.', 'higher', false, false, 2),
  ('full_body', 'wall_angel', 'Wall Angels', 'Stand with your back, head and hips on a wall and your arms bent like a goalpost. Slide your arms up and down and count the reps that keep your hands and elbows on the wall.', 'reps', '10 reps with your hands and elbows touching the wall.', 'higher', false, false, 3),
  ('full_body', 'overall_stiffness', 'Overall Stiffness', 'Rate how stiff you feel right now from 1 (loose) to 10 (very stiff).', 'score', 'A lower number than when you started.', 'lower', false, false, 4),
  ('total_mobility', 'toe_touch_reach', 'Standing Toe Touch', 'Stand with your feet together and reach down with straight knees. Measure the distance from your fingertips to the floor, in cm. Enter 0 if your fingers touch the floor.', 'cm', '0 cm, with your fingers touching the floor.', 'lower', false, false, 1),
  ('total_mobility', 'deep_squat_hold', 'Deep Squat Hold', 'Squat as low as you can with your heels down. Time how long you can stay there, up to 60 seconds.', 'seconds', '60 seconds with your heels flat.', 'higher', false, false, 2),
  ('total_mobility', 'back_scratch_reach', 'Back Scratch Reach', 'Reach one hand down your back from above and the other up your back from below. Measure the gap between your fingertips in cm. Enter 0 if they touch or overlap. Then swap sides.', 'cm', '0 cm on both sides, with your fingertips touching.', 'lower', true, false, 3),
  ('total_mobility', 'post_training_feel', 'How You Feel After Training', 'Rate how loose and ready to move you feel the day after your last workout, from 1 (sore and tight) to 10 (loose and fresh).', 'score', 'A higher number than when you started.', 'higher', false, false, 4),
  ('knees', 'single_leg_sit_to_stand', 'Single-Leg Sit-to-Stand', 'Sit on a chair with your arms crossed and one foot off the floor. Stand up and sit down on one leg as many times as you can in 30 seconds.', 'reps', '12 or more reps with a steady knee, and similar on both sides.', 'higher', true, false, 1),
  ('knees', 'knee_to_wall', 'Knee-to-Wall', 'Stand facing a wall with one foot back from it and your heel down. Bend your knee to touch the wall and move your foot back until you can just still touch it, then measure from big toe to wall in cm.', 'cm', 'About 9 to 12 cm, and similar on both sides.', 'symmetry', true, false, 2),
  ('knees', 'wall_sit', 'Wall Sit', 'Lean your back on a wall and slide down until your knees are bent to about 90 degrees. Time how long you can hold it.', 'seconds', '60 seconds or more.', 'higher', false, false, 3),
  ('knees', 'stair_knee_pain', 'Knee Pain on Stairs', 'Walk up and down a flight of stairs. Rate your knee pain from 0 (none) to 10 (worst).', 'score', '0 to 2.', 'lower', false, false, 4);
