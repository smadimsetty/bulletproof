// Generates supabase/migrations/20261112130000_adaptive_engine_content.sql and the per-pain-point
// source notes in this folder from the data below, and validates the content first:
//   node docs/superpowers/content/2026-11-12-engine/gen_engine_content.mjs
// Validation (fails loudly): every referenced exercise name exists exactly once among global
// seed inserts or is new here; every (slot, level) has a Basic-tier exercise; 2-4 levels per slot;
// 2-3 steps per (level, exercise); stretch steps <= 240 s; every existing pool row is in its slot\'s
// ladder; every template slot has a slot row; every test and slot has a link; weights 0.5-2.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const OUT_SQL = join(MIG_DIR, '20261112130000_adaptive_engine_content.sql');

// Mirrors BASIC in apps/mobile/lib/equipmentTiers.ts.
const BASIC = new Set(['none', 'bodyweight', 'wall', 'wall_or_couch', 'doorway', 'towel', 'step',
  'floor_markers', 'cone_or_marker', 'cones', 'cones_or_floor_markers']);
const AREAS = new Set(['ankles', 'feet', 'knees', 'hips', 'hamstrings', 'lower_back', 'thoracic_spine',
  'neck', 'shoulders', 'elbows', 'wrists']);
const DEFAULT = 'DEFAULT — clinical judgment';

// ------------------------------------------------------------------ sources reused from the spec (section 9)
const SRC = {
  ktwMdc: '[Physiopedia WBLT](https://www.physio-pedia.com/Weight-bearing_Lunge_Test); [PMC3362988](https://pmc.ncbi.nlm.nih.gov/articles/PMC3362988) (MDC ~1.4–1.9 cm)',
  painModel: '[JOSPT pain-monitoring model](https://www.scribd.com/document/718543943/jospt-2016-6908-1) (0–2 safe)',
  stretchCap: '[Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)',
};

// ------------------------------------------------------------------ new exercises
// [name, movement_pattern, exercise_type, body_parts, evidence_rationale, grade, equipment, sets, rep_range, unilateral, is_corrective, cue, description]
const NEW_EXERCISES = [
  ['Ankle: Standing Knee-to-Wall Rock with Hold', 'mobility', 'mobility_stretch', ['ankles'], 'Full-bodyweight version of the knee-to-wall mobilization. A 5-second end-range pause under load builds on the half-kneeling drill, and weight-bearing dorsiflexion is exactly what the knee-to-wall test measures.', 'B', ['wall'], 2, '10 reps', true, true,
    'Face a wall in a split stance and drive your front knee to the wall with the heel down, holding 5 seconds each time.',
    'Stand facing a wall with one foot forward, toes a hand\'s width from it. Push your front knee toward the wall while keeping the heel flat, and hold the end position for 5 seconds. Come back and repeat. Move your foot back a little as it gets easy. Keep your knee tracking over your middle toes. Then switch feet.'],
  ['Ankle: Single-Leg Balance on Folded Towel, Eyes Closed', 'balance', 'balance', ['ankles'], 'A thickly folded towel gives an unstable surface like a foam pad, so the eyes-closed progression needs no equipment. Balance training is the best-supported treatment for chronic ankle instability.', 'A', ['towel'], 3, '30s', true, true,
    'Stand on one foot on a thickly folded towel, close your eyes, and stay still.',
    'Fold a bath towel into a thick square on the floor. Stand on it barefoot on one leg with a soft knee and your hands on your hips. Find your balance, then close your eyes. Let your foot make small corrections. If you touch down, open your eyes and start again. Then switch legs.'],
  ['Ankle: Lateral Hop to Stick', 'balance', 'plyometric', ['ankles'], 'Hop-to-stabilization drills train the fast outer-ankle response that resists the inversion sprain, and they carry over directly to the side hop test.', 'B', [], 3, '6 reps', true, true,
    'Hop sideways off one foot onto the same foot and freeze the landing for 2 seconds.',
    'Stand on one leg. Hop about a foot to the side and land on the same foot with a soft knee. Hold the landing still for 2 seconds, then hop back. Keep your knee over your toes and don\'t let the ankle roll out. Start with small hops. Then switch legs.'],
  ['Ankle: Heel Walk, Toes Turned In', 'balance', 'strength', ['ankles', 'feet'], 'Walking on the heels with the toes turned in loads the muscles at the front and inside of the shin together, the inversion and dorsiflexion strength the banded drill trains, with no equipment.', 'C', [], 2, '20m', false, false,
    'Lift your toes, turn them in slightly, and walk slowly on your heels.',
    'Stand tall and lift the front of both feet off the floor. Turn your toes in a little so you feel the inside of your shins working. Walk forward on your heels in short steps. Keep your knees soft and your hips level. Stop and reset if your toes touch down.'],
  ['Ankle: Single-Leg Pogo Hops', 'balance', 'plyometric', ['ankles'], 'Short, stiff-ankle hops train the calf and Achilles spring. Reactive work is the usual next step after slow heavy calf strength and is the quality the hop tests depend on.', 'B', [], 3, '10 reps', true, false,
    'Bounce on one foot in small, quick hops, landing on the ball of the foot.',
    'Stand on one foot with a light touch on a wall if you need it. Bounce in small, quick hops, staying on the ball of your foot. Keep your knee almost straight so the ankle does the work. Land quietly. Stop the set if the hops get sloppy. Then switch feet.'],
  ['Ankle: Single-Leg Wall Tibialis Raise', 'balance', 'strength', ['ankles'], 'Doing the wall tibialis raise on one leg doubles the load on the muscle at the front of the shin, the progression once the two-leg version passes 20 easy reps.', 'B', ['wall'], 3, '10 reps', true, false,
    'Lean on a wall with your feet out front, lift one foot, and pull the toes of the other toward your shin.',
    'Lean your back on a wall with your feet about a foot and a half out. Lift one foot off the floor. Pull the toes of the standing foot up as high as you can, then lower slowly. Keep that leg straight so the movement comes from the ankle. Then switch legs.'],
  ['Ankle: Side Plank with Leg Lift', 'core', 'strength', ['hips', 'lower_back'], 'Lifting the top leg in a side plank loads the hip abductors at body weight with the trunk braced, a step up from side-lying abduction. Hip strength ranks second only to balance work in ankle-instability rehab.', 'B', [], 3, '6 reps', true, true,
    'Hold a side plank on your forearm and lift your top leg up and down slowly.',
    'Lie on your side with your elbow under your shoulder and your legs stacked. Lift your hips into a straight line. Raise your top leg a foot or so, then lower it with control. Keep your hips high and facing forward. Drop to your bottom knee if you can\'t hold the line. Then switch sides.'],
  ['Shoulder: Wall Slide with Lift-Off', 'pull', 'strength', ['shoulders'], 'Lifting the hands off the wall at the top of the slide makes the lower trapezius work at full elevation, the active end-range step after plain wall slides.', 'B', ['wall'], 3, '8 reps', false, true,
    'Slide your forearms up the wall, then lift your hands an inch off it for 2 seconds at the top.',
    'Stand facing a wall with your forearms on it at shoulder height, elbows bent. Slide your arms up as high as you can without shrugging. At the top, lift your hands an inch off the wall and hold for 2 seconds. Lower back down slowly. Keep your ribs down and don\'t arch your lower back.'],
  ['Shoulder: Prone Swimmer', 'pull', 'strength', ['shoulders', 'thoracic_spine'], 'Sweeping the arms from overhead to the lower back while lying face down works the lower trapezius and rotator cuff through the whole arc, a harder bodyweight step than pull-aparts.', 'B', [], 3, '8 reps', false, false,
    'Lie face down with your arms overhead and lifted, then sweep them around to your lower back and back again.',
    'Lie face down with your arms straight overhead and your forehead on a folded towel. Lift your arms off the floor. Sweep them out to the sides and down until your hands reach your lower back, turning your palms up. Reverse the path back overhead. Keep your arms off the floor the whole time and don\'t lift your head.'],
  ['Shoulder: Wall-Facing Overhead Lift-Off', 'pull', 'strength', ['shoulders'], 'Holding full overhead reach with no support turns passive range from hangs and stretches into active range, which the overhead reach test needs.', 'B', ['wall'], 3, '8 reps', false, true,
    'Face a wall with your hands overhead on it, then lift both hands off and hold for 2 seconds.',
    'Stand facing a wall, toes a few inches from it. Slide your hands up the wall as high as they go with straight arms. Lift both hands an inch off the wall and hold for 2 seconds. Put them back and repeat. Keep your ribs down and don\'t lean back to get higher.'],
  ['Shoulder: Elevated Pike Push-Up', 'push', 'strength', ['shoulders'], 'Raising the feet shifts more body weight onto the shoulders in the overhead pressing line, the standard next step after the floor pike push-up.', 'B', ['step'], 3, '6 reps', false, false,
    'Put your feet on a step with your hips high, and lower your head toward the floor between your hands.',
    'Place your feet on a step or low stair and walk your hands back until your hips are high and your body makes an upside-down V. Bend your elbows to lower the top of your head toward the floor. Press back up. Keep your elbows angled slightly forward, not flared out. End the set early if your form breaks.'],
  ['Shoulder: Prone 90/90 External Rotation', 'pull', 'strength', ['shoulders'], 'Rotating the forearm up against gravity with the arm at 90 degrees trains the rotator cuff in the exact position of the external rotation test, with no band.', 'B', [], 3, '10 reps', true, true,
    'Lie face down with one arm out at 90 degrees and the elbow bent, and rotate the back of your hand up toward the ceiling.',
    'Lie face down on the floor or near the edge of a bed with one arm out at shoulder height and the elbow bent to 90 degrees. Keep the upper arm still and rotate the forearm so the back of your hand rises toward the ceiling. Hold for a second, then lower slowly. Don\'t shrug or lift your chest. Then switch arms.'],
  ['Shoulder: Push-Up Plus', 'push', 'strength', ['shoulders'], 'The extra push at the top of a push-up is one of the strongest serratus anterior activators, and it trains the shoulder-blade control the push-up plus test checks.', 'B', [], 3, '10 reps', false, true,
    'At the top of a push-up, push the floor away so your upper back rounds slightly, then let it settle.',
    'Start in a push-up position with straight arms, or on your knees if needed. Do a push-up, and at the top keep pushing the floor away until your shoulder blades spread around your ribs. Let them come back together slowly, then do the next rep. Keep your head in line with your spine and don\'t let your hips sag.'],
  ['Neck: Chin Tuck Head Lift Hold', 'balance', 'strength', ['neck'], 'Lifting the tucked head just off the floor is the deep neck flexor endurance test position. Holding it is the loaded step after low-load craniocervical flexion.', 'B', [], 3, '10s', false, true,
    'Lie on your back, tuck your chin, and lift your head an inch off the floor. Hold.',
    'Lie on your back with your knees bent. Tuck your chin gently as if making a double chin. Keep the tuck and lift your head about an inch off the floor. Hold for the set time, then lower and rest. Stop the hold if your chin pokes forward or your head shakes.'],
  ['Neck: Contract-Relax Rotation Stretch', 'mobility', 'mobility_stretch', ['neck'], 'Contract-relax (PNF) stretching adds range faster than static holds. A gentle 5-second push into the hand before each new end range is the active step after slow rotations.', 'B', [], 1, '3 reps', true, false,
    'Turn your head as far as is comfortable, push gently into your hand for 5 seconds, relax, then turn a little further.',
    'Sit tall with your shoulders still. Turn your head to one side until you feel a gentle stretch. Place your hand on your cheek and push lightly into it for 5 seconds without moving. Relax, breathe out, and turn a little further. Hold for 10 seconds. That\'s one rep. Then do the other side.'],
  ['Neck: Contract-Relax Upper Trapezius Stretch', 'mobility', 'mobility_stretch', ['neck', 'shoulders'], 'The same contract-relax method applied to the side-bend stretch. A short push against the hand before each deeper hold is the active step after plain upper trap and levator holds.', 'C', [], 1, '3 reps', true, false,
    'Tilt your ear toward your shoulder, push your head gently into your hand for 5 seconds, relax, then tilt a little further.',
    'Sit tall and hold the edge of your seat with one hand to keep that shoulder down. Tilt your head away from that side. Put your other hand on the side of your head and push gently into it for 5 seconds without moving. Relax and let your head tilt a little further. Hold for 10 seconds. Then do the other side.'],
  ['Neck: Side-Lying Lateral Neck Raise', 'balance', 'strength', ['neck'], 'Lifting the head against gravity while lying on the side moves four-direction isometric work into strength through range. It belongs to the upper-quarter strengthening family with the best evidence for neck pain.', 'B', [], 3, '8 reps', true, false,
    'Lie on your side and slowly lift your head toward the ceiling, ear toward shoulder, then lower.',
    'Lie on your side with a pillow or folded towel under your head. Keep your chin slightly tucked. Lift your head slowly toward the ceiling, moving your ear toward your top shoulder. Lower it back under control. Don\'t turn your face up or down. Then switch sides.'],
  ['Neck: Prone Cobra with Chin Tuck', 'pull', 'strength', ['neck', 'thoracic_spine'], 'Lifting the head and chest together with the chin tucked loads the neck and upper-back extensors as one chain, the step after head-only prone extension.', 'B', [], 3, '6 reps', false, false,
    'Lie face down, tuck your chin, and lift your head and chest an inch while squeezing your shoulder blades. Hold 5 seconds.',
    'Lie face down with your arms by your sides, palms down, and your forehead on the floor. Tuck your chin slightly. Lift your head and chest an inch or two while squeezing your shoulder blades back and down, and turn your thumbs out. Hold for 5 seconds, then lower. Keep your eyes on the floor and don\'t tip your head back.'],
  ['Neck: Single-Arm Towel Doorway Row', 'pull', 'strength', ['shoulders', 'thoracic_spine'], 'Pulling with one arm doubles the load on each side of the upper back compared with the two-arm towel row, and adds an anti-rotation demand.', 'C', ['towel', 'doorway'], 3, '8 reps', true, false,
    'Hold a towel looped on a closed door\'s handle in one hand, lean back, and pull your chest to the door.',
    'Loop a towel around both sides of a closed door\'s handle and hold both ends in one hand. Stand with your feet near the door and lean back with a straight arm. Pull your chest toward the door, leading with the elbow, and squeeze your shoulder blade back. Lower slowly. Keep your body from twisting. Then switch arms.'],
  ['APT: Single-Leg Glute Bridge, Foot on Step', 'hinge', 'strength', ['hips', 'lower_back'], 'Putting the working heel on a step lengthens the range so the glutes work harder at full hip extension, the next step after the floor single-leg bridge.', 'B', ['step'], 3, '10 reps', true, true,
    'Lie down with one heel on a low step and the other leg up, and drive your hips up.',
    'Lie on your back with one heel on a low step and the knee bent. Lift the other leg straight up. Push through the heel on the step and lift your hips until your body is in a straight line. Pause for 2 seconds at the top, then lower slowly. Keep your hips level. Then switch legs.'],
  ['APT: Posterior-Tilt Plank', 'core', 'strength', ['lower_back', 'hips'], 'A front plank with the pelvis tucked under and the glutes squeezed is harder on the abdominals than a normal plank and trains the posterior tilt this sprint is after.', 'B', [], 3, '20s', false, true,
    'Hold a forearm plank, tuck your tailbone under, and squeeze your glutes and abs hard.',
    'Get into a forearm plank with your elbows under your shoulders. Tuck your tailbone under so your lower back flattens. Squeeze your glutes and brace your abs hard. Pull your elbows toward your toes without moving them. Hold for the set time. Keep breathing, and stop when your lower back starts to sag.'],
  ['APT: Front-Foot-Elevated Split Squat', 'squat', 'strength', ['hips', 'knees'], 'Raising the front foot lets the back knee sink lower, which takes the rear hip into a deeper loaded stretch of the hip flexors. Loaded lengthening builds range and strength together.', 'B', ['step'], 3, '8 reps', true, false,
    'Put your front foot on a step and your back foot on the floor, and sink straight down until your back knee almost touches.',
    'Put your front foot on a low step and take a long stride back with the other foot. Lower straight down until your back knee nearly touches the floor. Squeeze your back glute at the bottom so you feel a stretch at the front of that hip. Push through the front foot to stand. Keep your torso tall. Then switch legs.'],
  ['APT: Bear Crawl', 'core', 'strength', ['lower_back', 'shoulders'], 'Crawling with the knees just off the floor keeps the trunk braced against movement. It is a no-equipment substitute for a loaded carry that trains anti-extension core endurance.', 'C', [], 3, '10m', false, false,
    'On your hands and toes with your knees an inch off the floor, crawl forward in small steps with a flat back.',
    'Start on your hands and knees, then lift your knees an inch off the floor. Move one hand and the opposite foot forward a short step, then the other pair. Keep your back flat and your hips level, like a tray of water on your back. Go slowly. Crawl backward to return if you run out of room.'],
  ['Full Body: Bodyweight Jefferson Curl', 'hinge', 'mobility_stretch', ['hamstrings', 'lower_back'], 'A slow roll-down from a step loads the hamstrings and spine at end range with body weight only. Loaded end-range work is the step after static holds once stretch time plateaus.', 'C', ['step'], 2, '6 reps', false, false,
    'Stand on a step and roll down slowly one vertebra at a time, reaching past your toes, then roll back up.',
    'Stand on a step with your toes at the edge and your knees straight. Tuck your chin and roll down slowly, one segment of your spine at a time, letting your hands reach below the step. Pause at the bottom and breathe. Roll back up the same way, head last. Go slowly and stay within a gentle stretch.'],
  ['Full Body: 90/90 Back-Leg Lift-Off', 'mobility', 'mobility_stretch', ['hips'], 'Lifting the back shin off the floor from the 90/90 position works the hip rotators at end range, turning passive 90/90 range into range you can control.', 'C', [], 2, '5 reps', true, false,
    'Sit in 90/90, sit tall, and lift your back knee and foot off the floor, then lower.',
    'Sit on the floor with both knees bent to about 90 degrees, one leg in front and one to the side. Sit tall with your hands on the floor beside you. Lift the back knee and foot a little off the floor, hold for 2 seconds, then lower. Keep your chest up and don\'t lean away to cheat. Then switch sides.'],
  ['Full Body: Inchworm', 'mobility', 'mobility_stretch', ['hamstrings', 'shoulders', 'lower_back'], 'Walking the hands out to a plank and back stretches the hamstrings under load and moves the shoulders and trunk in one flow, a step up from standing whole-body stretches.', 'C', [], 2, '5 reps', false, false,
    'Fold down, walk your hands out to a plank, then walk your feet up to your hands.',
    'Stand tall, then fold forward and put your hands on the floor, bending your knees only as much as you need. Walk your hands out until you\'re in a plank. Pause, then walk your feet in toward your hands with your legs as straight as is comfortable. Stand up and repeat. Move slowly and keep your back long.'],
  ['Mobility: Quadruped Wrist Rocks', 'mobility', 'mobility_stretch', ['wrists', 'elbows'], 'Rocking body weight over the hands loads the wrists at end-range extension, the active step after unloaded wrist flows and prayer stretches.', 'C', [], 2, '10 reps', false, false,
    'On your hands and knees, rock your shoulders forward past your wrists and back with your palms flat.',
    'Get on your hands and knees with your hands under your shoulders and fingers pointing forward. Keep your palms flat and rock your shoulders slowly forward past your wrists, then back. Rock only as far as is comfortable. Then turn your fingers to point back toward your knees and rock gently again.'],
  ['Knees: Single-Leg Slider Hamstring Curl', 'hinge', 'strength', ['hamstrings', 'knees'], 'Doing the slider curl on one leg roughly doubles the eccentric hamstring load, a no-equipment bridge toward Nordic-curl intensity.', 'B', ['towel'], 3, '6 reps', true, false,
    'In a bridge with one heel on a towel and the other leg up, slide the heel out slowly and pull it back.',
    'Lie on your back with one heel on a towel on a smooth floor and the other leg lifted. Lift your hips into a bridge. Slide the heel away slowly over 3 seconds, keeping your hips up, then pull it back in. Lower your hips to reset if you need to. Then switch legs.'],
  ['Knees: Kneeling Quad Lean-Back', 'mobility', 'mobility_stretch', ['knees', 'hips'], 'Leaning back from tall kneeling lengthens the quads under body weight, an active version of the quad stretch and a regression of the reverse Nordic.', 'C', [], 2, '6 reps', false, false,
    'Kneel tall, squeeze your glutes, and lean your whole body back a few inches, then come up.',
    'Kneel on a soft surface with your knees hip-width apart and your body tall. Squeeze your glutes so your hips stay straight. Lean your whole body back a few inches in one line from knees to head, hold for 2 seconds, and come back up. Only go as far as you can control. Don\'t bend at the hips.'],
];

// ------------------------------------------------------------------ content per pain point
// tests: [test_key, target, noise, raw_direction|null, targetSource, noiseSource]
// slots: [slot_key, area, links {test_key: weight}, levels]
// level: [why, [[exercise name, 'SxN[r|s|m], ...'], ...]]   (r = reps, s = seconds, m = metres)
const PAIN_POINTS = {
  ankle: {
    title: 'Ankle',
    tests: [
      ['knee_to_wall', 10, 1.5, 'higher', 'target_description "9-12 cm" → 10', `target_description "~1.5 cm"; ${SRC.ktwMdc}`],
      ['heel_raise_capacity', 25, 3, null, 'target_description "25+ reps"', DEFAULT],
      ['balance_eyes_closed', 30, 5, null, 'target_description "30s"', DEFAULT],
      ['y_balance_anterior', 60, 4, 'higher', `${DEFAULT} (typical adult anterior reach)`, 'target_description "asymmetry beyond ~4 cm"'],
      ['side_hop', 10, 1, 'lower', `${DEFAULT} (same value the engine plan uses)`, DEFAULT],
      ['hop_for_distance', 120, 10, 'higher', `${DEFAULT} (typical adult single-leg hop)`, DEFAULT],
    ],
    slots: [
      ['ankle-mobilization', 'ankles', { knee_to_wall: 2, y_balance_anterior: 1 }, [
        ['Existing pool rows: the banded and half-kneeling mobilizations. Steps add sets.', [
          ['Ankle: Banded Knee-to-Wall Mobilization', '1x20r,2x20r,3x20r'],
          ['Half-Kneeling Ankle Mobilization', '1x15r,2x15r,3x15r']]],
        ['Full body weight on the ankle with an end-range hold, then a light plate for load.', [
          ['Ankle: Standing Knee-to-Wall Rock with Hold', '2x10r,3x10r'],
          ['Weighted Ankle Dorsiflexion Mobilization', '2x10r,3x10r']]],
      ]],
      ['ankle-balance', 'ankles', { balance_eyes_closed: 2 }, [
        ['Floor, eyes closed (pool rank 1). Sets, then hold time.', [
          ['Ankle: Single-Leg Balance, Eyes Closed (Floor)', '2x30s,3x30s,3x45s']]],
        ['Unstable surface: foam pad and head turns from the pool, a folded towel when there is no pad.', [
          ['Ankle: Single-Leg Balance, Eyes Closed (Foam Pad)', '2x30s,3x30s,3x45s'],
          ['Ankle: Single-Leg Balance with Head Turns', '2x30s,3x30s'],
          ['Ankle: Single-Leg Balance on Folded Towel, Eyes Closed', '2x30s,3x30s,3x45s']]],
      ]],
      ['ankle-calf-endurance', 'ankles', { heel_raise_capacity: 2 }, [
        ['Pool rows. Heel-raise reps climb toward the 25-rep target.', [
          ['Ankle: Single-Leg Heel Raises', '2x12r,2x15r,3x15r'],
          ['Ankle: Toe and Heel Walks', '1x20m,2x20m,3x20m']]],
        ['Full range off a step with eyes closed: more range and a balance demand on the same muscle.', [
          ['Calf Raise on Step (eyes closed)', '2x10r,3x10r,3x15r']]],
      ]],
      ['ankle-eversion-strength', 'ankles', { side_hop: 1.5 }, [
        ['Pool rows: banded eversion and the outer-edge walk.', [
          ['Ankle: Banded Eversion', '2x15r,3x15r,3x20r'],
          ['Ankle: Outer-Edge Foot Walk', '2x10m,3x10m,3x15m']]],
        ['Reactive eversion: hop and stick, the fast version of the same job.', [
          ['Ankle: Lateral Hop to Stick', '2x6r,3x6r,3x8r']]],
      ]],
      ['ankle-inversion-dorsiflexion-strength', 'ankles', { side_hop: 1 }, [
        ['Pool rows: banded inversion/dorsiflexion and toe-and-heel walks.', [
          ['Ankle: Banded Inversion and Dorsiflexion', '2x15r,3x15r,3x20r'],
          ['Ankle: Toe and Heel Walks', '1x20m,2x20m,3x20m']]],
        ['Heel walk with toes in: body-weight load on the same shin muscles for longer.', [
          ['Ankle: Heel Walk, Toes Turned In', '2x20m,3x20m,3x30m']]],
      ]],
      ['ankle-calf-strength-loaded', 'ankles', { heel_raise_capacity: 1.5, knee_to_wall: 0.5, side_hop: 1, hop_for_distance: 1 }, [
        ['Pool rows: weighted straight- and bent-knee raises, and the slow bodyweight raise on a step.', [
          ['Ankle: Weighted Single-Leg Calf Raise (Straight-Knee)', '3x8r,4x8r,4x12r'],
          ['Ankle: Weighted Single-Leg Calf Raise (Bent-Knee)', '3x8r,4x8r,4x12r'],
          ['Ankle: Slow Single-Leg Calf Raise on Step', '2x10r,3x10r,3x12r']]],
        ['Strength to spring: single-leg pogo hops.', [
          ['Ankle: Single-Leg Pogo Hops', '2x10r,3x10r,3x15r']]],
      ]],
      ['ankle-tibialis-strength', 'ankles', { heel_raise_capacity: 0.5 }, [
        ['Pool row: two-leg wall tibialis raise.', [
          ['Ankle: Wall Tibialis Raise', '2x15r,3x15r,3x20r']]],
        ['One leg at a time doubles the load.', [
          ['Ankle: Single-Leg Wall Tibialis Raise', '2x10r,3x10r,3x15r']]],
      ]],
      ['ankle-balance-unstable', 'ankles', { balance_eyes_closed: 1, y_balance_anterior: 1.5, hop_for_distance: 0.5 }, [
        ['Pool rows: wobble board and the single-leg reach to a cone.', [
          ['Ankle: Wobble Board Balance', '2x30s,3x30s,3x45s'],
          ['Single-Leg Deadlift Reach to Cone', '2x6r,3x6r,3x8r']]],
        ['Multi-direction reaching (the Y-balance pattern itself), or a loaded reach.', [
          ['Y-Balance Reach', '2x3r,3x3r,3x5r'],
          ['Single-Leg Romanian Deadlift Balance Reach', '2x8r,3x8r,3x10r']]],
      ]],
      ['ankle-hip-strength', 'hips', { y_balance_anterior: 1, hop_for_distance: 1 }, [
        ['Pool rows: side-lying abduction and the banded lateral walk.', [
          ['Ankle: Side-Lying Hip Abduction', '2x12r,3x12r,3x15r'],
          ['Ankle: Banded Lateral Walk', '2x10m,3x10m,3x15m']]],
        ['Abduction in a side plank (body weight), or the monster walk with a band.', [
          ['Ankle: Side Plank with Leg Lift', '2x6r,3x6r,3x8r'],
          ['Monster Walk', '2x10m,3x10m']]],
      ]],
      ['ankle-squat-hold', 'ankles', { knee_to_wall: 1 }, [
        ['Pool row: deep squat hold. Steps add sets then time, capped well under 240 s.', [
          ['Ankle: Deep Squat Hold', '2x45s,2x60s,3x60s']]],
        ['Active end range: the Cossack squat moves through the same deep ankle and hip angles.', [
          ['Mobility: Cossack Squat Flow', '2x6r,3x6r,3x8r']]],
      ]],
    ],
  },

  rounded_shoulders: {
    title: 'Rounded Shoulders',
    tests: [
      ['wall_overhead_reach', 1, 0.5, null, 'pass/fail stored 1/0; target = pass', 'pass/fail: any change is real'],
      ['apley_scratch', 0, 3, 'lower', `${DEFAULT} (fingertips touching)`, 'target_description "greater than a few centimetres" → 3'],
      ['supine_external_rotation', 90, 8, 'higher', 'target_description "~90"', `${DEFAULT} (goniometer error ~5–10°)`],
      ['sleeper_stretch_ir', 60, 10, 'higher', `${DEFAULT} (typical internal rotation at 90°)`, `${DEFAULT} (target_description flags a 20° deficit as clinically relevant)`],
      ['pushup_plus_control', 1, 0.5, null, 'pass/fail stored 1/0; target = pass', 'pass/fail: any change is real'],
    ],
    slots: [
      ['shoulder-thoracic-extension', 'thoracic_spine', { wall_overhead_reach: 2, apley_scratch: 0.5 }, [
        ['Pool rows: thoracic extension over a foam roller or a chair back. Steps add sets.', [
          ['Shoulder: Thoracic Extension Over Foam Roller', '1x10r,2x10r,3x10r'],
          ['Neck: Thoracic Extension Over Chair Back', '1x10r,2x10r,3x10r']]],
        ['Rotation added to extension: open book and thread the needle.', [
          ['Mobility: Open Book Thoracic Rotation', '1x8r,2x8r,2x10r'],
          ['Thread the Needle', '1x6r,2x6r,2x8r']]],
      ]],
      ['shoulder-wall-slides', 'shoulders', { wall_overhead_reach: 1.5 }, [
        ['Pool row: wall slide.', [
          ['Shoulder: Wall Slide', '1x12r,2x12r,3x12r']]],
        ['Lift-off at the top: active control at full elevation.', [
          ['Shoulder: Wall Slide with Lift-Off', '2x8r,3x8r,3x10r']]],
      ]],
      ['shoulder-band-pull-aparts', 'shoulders', { supine_external_rotation: 0.5, pushup_plus_control: 1 }, [
        ['Pool rows: band pull-apart, or the prone retraction hold without a band.', [
          ['Shoulder: Band Pull-Apart', '1x20r,2x20r,3x20r'],
          ['Shoulder: Prone Scapular Retraction Hold', '2x10s,3x10s,3x15s']]],
        ['Full-arc lower trapezius and cuff work: prone swimmers, or Y-T-W raises with dumbbells.', [
          ['Shoulder: Prone Swimmer', '2x8r,3x8r,3x10r'],
          ['Y-T-W Raises', '2x8r,3x8r,3x10r']]],
      ]],
      ['shoulder-passive-hang', 'shoulders', { wall_overhead_reach: 1.5, apley_scratch: 1 }, [
        ['Pool rows: passive hang, or the wall stretch without a bar. Hold capped well under 240 s.', [
          ['Shoulder: Passive Hang', '1x30s,2x30s,3x30s'],
          ['Shoulder: Wall Overhead Hip-Hinge Stretch', '1x30s,2x30s,2x45s']]],
        ['Active overhead range: the active scapular hang (pool rank 2), or the wall-facing lift-off.', [
          ['Shoulder: Active Scapular Hang', '2x20s,3x20s,3x30s'],
          ['Shoulder: Wall-Facing Overhead Lift-Off', '2x8r,3x8r,3x10r']]],
      ]],
      ['shoulder-overhead-press-full-range', 'shoulders', { wall_overhead_reach: 1 }, [
        ['Pool rows: full-range dumbbell press, or the pike push-up.', [
          ['Shoulder: Full-Range Dumbbell Overhead Press', '2x8r,3x8r,3x10r'],
          ['Shoulder: Pike Push-Up', '2x6r,3x6r,3x8r']]],
        ['Feet raised: more body weight through the overhead line.', [
          ['Shoulder: Elevated Pike Push-Up', '2x6r,3x6r,3x8r']]],
      ]],
      ['shoulder-scapular-raises', 'shoulders', { pushup_plus_control: 1 }, [
        ['Pool rows T and W: the shorter-lever raises come first.', [
          ['Shoulder: Prone T Raise', '2x10r,3x10r,3x12r'],
          ['Shoulder: Prone W Raise', '2x10r,3x10r,3x12r']]],
        ['Pool row Y: the longest lever and hardest of the three; dumbbell Y-T-W as the loaded alternate.', [
          ['Shoulder: Prone Y Raise', '2x8r,3x8r,3x10r'],
          ['Y-T-W Raises', '2x8r,3x8r']]],
      ]],
      ['shoulder-external-rotation-90', 'shoulders', { supine_external_rotation: 2, apley_scratch: 1, sleeper_stretch_ir: 1 }, [
        ['Pool rows: banded external rotation at 90°, or the wall slide with rotation.', [
          ['Shoulder: Banded External Rotation at 90 Abduction', '2x12r,3x12r,3x15r'],
          ['Wall Slide with External Rotation', '2x10r,3x10r,3x12r']]],
        ['Against gravity at 90/90, the test position.', [
          ['Shoulder: Prone 90/90 External Rotation', '2x10r,3x10r,3x12r']]],
      ]],
      ['shoulder-face-pulls', 'shoulders', { supine_external_rotation: 1 }, [
        ['Pool rows: band face pull, or the prone W raise.', [
          ['Shoulder: Face Pull', '2x15r,3x15r,3x20r'],
          ['Shoulder: Prone W Raise', '2x10r,3x10r,3x12r']]],
        ['Heavier pulling: cable face pull in a gym, or the towel doorway row at home.', [
          ['Face Pull', '2x12r,3x12r,3x15r'],
          ['Neck: Towel Doorway Row', '2x8r,3x8r,3x10r']]],
      ]],
      ['shoulder-bottoms-up-carry-press', 'shoulders', { pushup_plus_control: 1, sleeper_stretch_ir: 0.5 }, [
        ['Pool rows: bottoms-up carry, or shoulder taps in a plank.', [
          ['Shoulder: Bottoms-Up Kettlebell Carry', '2x20s,3x20s,3x30s'],
          ['Plank with Shoulder Taps', '2x8r,3x8r,3x10r']]],
        ['Pool row: bottoms-up press; push-up to single-arm reach as the bodyweight alternate.', [
          ['Shoulder: Bottoms-Up Kettlebell Press', '2x6r,3x6r,3x8r'],
          ['Push-Up to Single-Arm Reach', '2x5r,3x5r,3x6r']]],
      ]],
      ['shoulder-serratus-wall-slides', 'shoulders', { pushup_plus_control: 2, wall_overhead_reach: 1 }, [
        ['Pool rows: serratus wall slide with a band, or plain scapular wall slides.', [
          ['Shoulder: Serratus Wall Slide with Band', '2x12r,3x12r,3x15r'],
          ['Scapular Wall Slides', '2x10r,3x10r,3x12r']]],
        ['Push-up plus: serratus work under body weight, the test movement itself.', [
          ['Shoulder: Push-Up Plus', '2x8r,3x8r,3x10r']]],
      ]],
    ],
  },

  nerd_neck: {
    title: 'Nerd Neck',
    tests: [
      ['ccf_endurance_hold', 30, 5, null, `${DEFAULT} (target_description: most people start "well under 30s")`, DEFAULT],
      ['forward_head_wall_gap', 0, 1, null, `${DEFAULT} (back of head touching the wall)`, DEFAULT],
      ['cervical_rotation_rom', 80, 7, null, 'target_description "~80 degrees each side"', `${DEFAULT} (eyeballed/app angle error ~5–10°)`],
    ],
    slots: [
      ['neck-craniocervical-flexion', 'neck', { ccf_endurance_hold: 2, forward_head_wall_gap: 1 }, [
        ['Pool row: low-load craniocervical flexion; steps add holds up to the pool\'s 10. Wall chin tucks as the alternate.', [
          ['Neck: Craniocervical Flexion Hold', '6x10s,8x10s,10x10s'],
          ['Wall-Supported Chin Tuck', '2x10r,3x10r,3x12r']]],
        ['Head lifted: the deep neck flexor endurance test position.', [
          ['Neck: Chin Tuck Head Lift Hold', '3x10s,5x10s,5x15s']]],
      ]],
      ['neck-rotation-rom', 'neck', { cervical_rotation_rom: 2 }, [
        ['Pool row: slow full-range rotation; rotation stretch as the alternate.', [
          ['Neck: Cervical Rotation, Slow Full Range', '1x10r,2x10r,3x10r'],
          ['Neck Rotation Stretch', '1x8r,2x8r,2x10r']]],
        ['Contract-relax: active push before each new end range.', [
          ['Neck: Contract-Relax Rotation Stretch', '1x3r,2x3r,2x5r']]],
      ]],
      ['neck-upper-trap-levator-stretch', 'neck', { cervical_rotation_rom: 1.5 }, [
        ['Pool row: upper trap and levator stretch; the library levator stretch as the alternate. Hold capped well under 240 s.', [
          ['Neck: Upper Trapezius and Levator Stretch', '1x30s,2x30s,2x45s'],
          ['Levator scapulae stretch', '1x30s,2x30s,2x45s']]],
        ['Contract-relax version once static hold time stops paying off.', [
          ['Neck: Contract-Relax Upper Trapezius Stretch', '1x3r,2x3r,2x5r']]],
      ]],
      ['neck-thoracic-extension', 'thoracic_spine', { forward_head_wall_gap: 2, cervical_rotation_rom: 0.5 }, [
        ['Pool row: thoracic extension over a chair back; cat-cow as the alternate.', [
          ['Neck: Thoracic Extension Over Chair Back', '1x10r,2x10r,3x10r'],
          ['Cat-Cow', '1x10r,2x10r,2x12r']]],
        ['Extension against gravity with the chin tucked, or over a foam roller.', [
          ['Prone Neck Retraction with Extension', '2x8r,3x8r,3x10r'],
          ['Thoracic extension on foam roller', '1x10r,2x10r,3x10r']]],
      ]],
      ['neck-isometric-holds', 'neck', { ccf_endurance_hold: 1, cervical_rotation_rom: 0.5 }, [
        ['Pool row: four-direction isometric holds. Steps add rounds up to the pool\'s 5.', [
          ['Neck: Four-Direction Isometric Neck Hold', '3x10s,4x10s,5x10s']]],
        ['Strength through range: side-lying neck raises.', [
          ['Neck: Side-Lying Lateral Neck Raise', '2x8r,3x8r,3x10r']]],
      ]],
      ['neck-prone-extension', 'neck', { forward_head_wall_gap: 1, ccf_endurance_hold: 0.5 }, [
        ['Pool row: prone neck extension.', [
          ['Neck: Prone Neck Extension', '2x10r,3x10r,3x12r']]],
        ['Head and chest together: prone cobra with a chin tuck.', [
          ['Neck: Prone Cobra with Chin Tuck', '2x6r,3x6r,3x8r']]],
      ]],
      ['neck-face-pulls-pullaparts', 'shoulders', { forward_head_wall_gap: 1 }, [
        ['Pool rows: face pull, band pull-apart, or the prone retraction hold.', [
          ['Shoulder: Face Pull', '2x15r,3x15r,3x20r'],
          ['Shoulder: Band Pull-Apart', '1x20r,2x20r,3x20r'],
          ['Shoulder: Prone Scapular Retraction Hold', '2x10s,3x10s,3x15s']]],
        ['Longer lever: prone T raise, or dumbbell Y-T-W.', [
          ['Shoulder: Prone T Raise', '2x10r,3x10r,3x12r'],
          ['Y-T-W Raises', '2x8r,3x8r']]],
      ]],
      ['neck-farmers-carry', 'neck', { forward_head_wall_gap: 0.5 }, [
        ['Pool rows: farmer\'s carry, or the forearm plank pushing the floor away.', [
          ['Neck: Farmer\'s Carry', '2x30m,3x30m,3x40m'],
          ['Neck: Forearm Plank, Shoulders Pushed Away', '2x20s,3x20s,3x30s']]],
        ['Single-arm demand: shoulder taps, or the bottoms-up kettlebell carry.', [
          ['Plank with Shoulder Taps', '2x8r,3x8r,3x10r'],
          ['Shoulder: Bottoms-Up Kettlebell Carry', '2x20s,3x20s']]],
      ]],
      ['neck-rows', 'shoulders', { forward_head_wall_gap: 1 }, [
        ['Pool rows: dumbbell row, or the towel doorway row.', [
          ['Neck: Dumbbell Row', '2x10r,3x10r,3x12r'],
          ['Neck: Towel Doorway Row', '2x10r,3x10r,3x12r']]],
        ['One arm at a time on the towel row.', [
          ['Neck: Single-Arm Towel Doorway Row', '2x8r,3x8r,3x10r']]],
      ]],
    ],
  },

  anterior_pelvic_tilt: {
    title: 'Anterior Pelvic Tilt',
    tests: [
      ['thomas_test', 0, 5, null, 'target_description "at or below horizontal" → 0', `${DEFAULT} (eyeballed angle)`],
      ['standing_pelvic_tilt', 12, 3, null, `${DEFAULT} (inside the 7–15° range target_description cites)`, DEFAULT],
      ['anterior_core_endurance', 60, 10, null, `${DEFAULT} (target_description: "no universal norm")`, DEFAULT],
      ['glute_bridge_hold', 30, 5, null, 'target_description "30s each side"', DEFAULT],
    ],
    slots: [
      ['apt-hip-flexor-stretch', 'hips', { thomas_test: 2, standing_pelvic_tilt: 1 }, [
        ['Pool row: couch stretch; half-kneeling hip flexor stretch as the alternate. Hold capped well under 240 s.', [
          ['APT: Couch Stretch', '1x60s,2x60s,2x90s'],
          ['Half-Kneeling Hip Flexor Stretch with Reach', '1x45s,2x45s,2x60s']]],
        ['Active, moving end range once static hold time plateaus.', [
          ['World\'s Greatest Stretch', '1x5r,2x5r,2x6r']]],
      ]],
      ['apt-glute-bridge', 'hips', { glute_bridge_hold: 2, standing_pelvic_tilt: 1, thomas_test: 1 }, [
        ['Pool row: single-leg glute bridge.', [
          ['APT: Single-Leg Glute Bridge', '1x12r,2x12r,3x12r']]],
        ['Heel on a step: longer range at full hip extension.', [
          ['APT: Single-Leg Glute Bridge, Foot on Step', '2x10r,3x10r,3x12r']]],
      ]],
      ['apt-deep-squat-hold', 'hips', { thomas_test: 0.5 }, [
        ['Pool row: deep squat hold.', [
          ['Ankle: Deep Squat Hold', '2x45s,2x60s,3x60s']]],
        ['Cossack squat: active deep hip range.', [
          ['Mobility: Cossack Squat Flow', '2x6r,3x6r,3x8r']]],
      ]],
      ['apt-anterior-core', 'lower_back', { anterior_core_endurance: 2, standing_pelvic_tilt: 1.5 }, [
        ['Pool rows: dead bug and the modified curl-up (8-second holds).', [
          ['APT: Dead Bug', '2x8r,3x8r,3x10r'],
          ['APT: Modified Curl-Up', '3x8s,4x8s,5x10s']]],
        ['Posterior-tilt plank: the endurance test position with the tuck this sprint trains.', [
          ['APT: Posterior-Tilt Plank', '2x20s,3x20s,3x30s']]],
      ]],
      ['apt-loaded-hip-hinge', 'hamstrings', { glute_bridge_hold: 1, standing_pelvic_tilt: 0.5 }, [
        ['Pool rows: Romanian deadlift, or the single-leg reach to a cone.', [
          ['APT: Romanian Deadlift', '2x8r,3x8r,3x10r'],
          ['Single-Leg Deadlift Reach to Cone', '2x6r,3x6r,3x8r']]],
        ['Single-leg loaded hinge, or the slider hamstring curl at home.', [
          ['Single-Leg Romanian Deadlift Balance Reach', '2x8r,3x8r,3x10r'],
          ['Knees: Slider Hamstring Curl', '2x6r,3x6r,3x8r']]],
      ]],
      ['apt-split-squat', 'hips', { thomas_test: 1, glute_bridge_hold: 0.5 }, [
        ['Pool rows: Bulgarian split squat, or the tempo split squat.', [
          ['APT: Bulgarian Split Squat', '2x8r,3x8r,3x10r'],
          ['Knees: Tempo Split Squat', '2x8r,3x8r,3x10r']]],
        ['Front foot raised: a deeper loaded stretch of the back hip\'s flexors.', [
          ['APT: Front-Foot-Elevated Split Squat', '2x8r,3x8r,3x10r']]],
      ]],
      ['apt-loaded-carry', 'lower_back', { anterior_core_endurance: 1 }, [
        ['Pool rows: farmer\'s carry, or shoulder taps in a plank.', [
          ['Neck: Farmer\'s Carry', '2x30m,3x30m,3x40m'],
          ['Plank with Shoulder Taps', '2x8r,3x8r,3x10r']]],
        ['Bear crawl: a braced trunk while the limbs move.', [
          ['APT: Bear Crawl', '2x10m,3x10m,3x15m']]],
      ]],
      ['apt-mcgill-big-three', 'lower_back', { anterior_core_endurance: 1.5, standing_pelvic_tilt: 1 }, [
        ['Pool rows: side plank and bird dog.', [
          ['APT: Side Plank', '2x20s,3x20s,3x30s'],
          ['APT: Bird Dog', '2x8r,3x8r,3x10r']]],
        ['Side plank with a top-leg lift.', [
          ['Ankle: Side Plank with Leg Lift', '2x6r,3x6r,3x8r']]],
      ]],
    ],
  },

  full_body: {
    title: 'Full Body',
    tests: [
      ['toe_touch_reach', 0, 2, null, 'target_description "0 cm"', DEFAULT],
      ['deep_squat_hold', 60, 5, null, 'target_description "60 seconds"', DEFAULT],
      ['wall_angel', 10, 2, null, 'target_description "10 reps"', DEFAULT],
      ['overall_stiffness', 3, 2, null, `${DEFAULT} (target_description: "lower than when you started")`, `${DEFAULT} (about the usual 2-point change that matters on a 0–10 rating)`],
    ],
    slots: [
      ['fb-spine-mobility', 'thoracic_spine', { wall_angel: 1.5, toe_touch_reach: 0.5, overall_stiffness: 1 }, [
        ['Pool rows: cat-cow, thread the needle, thoracic extension over a chair.', [
          ['Cat-Cow', '1x10r,2x10r,2x12r'],
          ['Thread the Needle', '1x6r,2x6r,2x8r'],
          ['Neck: Thoracic Extension Over Chair Back', '1x10r,2x10r,3x10r']]],
        ['Bigger rotation: open book, or rotation over a foam roller.', [
          ['Mobility: Open Book Thoracic Rotation', '1x8r,2x8r,2x10r'],
          ['Thoracic Rotation on Foam Roller', '1x8r,2x8r,2x10r']]],
      ]],
      ['fb-hip-opener', 'hips', { deep_squat_hold: 1, overall_stiffness: 1 }, [
        ['Pool rows: 90/90 switch, half-kneeling hip flexor stretch, couch stretch.', [
          ['90/90 Hip Switch', '1x8r,2x8r,2x10r'],
          ['Half-Kneeling Hip Flexor Stretch with Reach', '1x45s,2x45s,2x60s'],
          ['Couch stretch', '1x45s,2x45s,2x60s']]],
        ['Active hip rotation at end range: 90/90 lift-offs.', [
          ['Full Body: 90/90 Back-Leg Lift-Off', '1x5r,2x5r,2x8r']]],
      ]],
      ['fb-chest-shoulder-opener', 'shoulders', { wall_angel: 2 }, [
        ['Pool rows: scapular wall slides, doorway pec stretch, shoulder CARs.', [
          ['Scapular Wall Slides', '1x10r,2x10r,2x12r'],
          ['Doorway Pec Stretch', '1x45s,2x45s,2x60s'],
          ['Shoulder CARs', '1x5r,2x5r,2x6r']]],
        ['Active overhead control: wall slides with lift-off, or band pass-throughs.', [
          ['Shoulder: Wall Slide with Lift-Off', '2x8r,3x8r,3x10r'],
          ['Resistance Band Shoulder Pass-Through', '1x10r,2x10r,2x12r']]],
      ]],
      ['fb-hamstring-calf', 'hamstrings', { toe_touch_reach: 2 }, [
        ['Pool rows: standing hamstring stretch, toe touch with reach-through, wall hip hinge.', [
          ['Standing Hamstring Stretch', '1x45s,2x45s,2x60s'],
          ['Standing Toe Touch with Reach-Through', '1x8r,2x8r,2x10r'],
          ['Full Body: Wall Hip Hinge', '2x10r,3x10r,3x12r']]],
        ['Loaded end range: Jefferson curl off a step, or with a light dumbbell.', [
          ['Full Body: Bodyweight Jefferson Curl', '1x6r,2x6r,2x8r'],
          ['Jefferson curl', '1x6r,2x6r,2x8r']]],
      ]],
      ['fb-squat-hold', 'hips', { deep_squat_hold: 2 }, [
        ['Pool rows: deep squat hold and Asian squat hold, building toward the 60-second test.', [
          ['Deep squat hold', '2x30s,2x45s,2x60s'],
          ['Asian Squat Hold', '2x30s,2x45s,2x60s']]],
        ['Cossack squat: moving through the deep squat range side to side.', [
          ['Mobility: Cossack Squat Flow', '2x6r,3x6r,3x8r']]],
      ]],
      ['fb-neck-release', 'neck', { wall_angel: 0.5, overall_stiffness: 1 }, [
        ['Pool rows: chin tucks, levator stretch, neck rotation stretch.', [
          ['Chin tucks', '1x10r,2x10r,3x10r'],
          ['Levator scapulae stretch', '1x30s,2x30s,2x45s'],
          ['Neck Rotation Stretch', '1x30s,2x30s,2x45s']]],
        ['Chin tucks against a wall, or prone retraction with extension (against gravity).', [
          ['Wall-Supported Chin Tuck', '2x10r,3x10r,3x12r'],
          ['Prone Neck Retraction with Extension', '2x8r,3x8r,3x10r']]],
      ]],
      ['fb-glute-wakeup', 'hips', { overall_stiffness: 1 }, [
        ['Pool rows: glute bridge and fire hydrant.', [
          ['Full Body: Glute Bridge', '2x12r,3x12r,3x15r'],
          ['Fire Hydrant', '2x10r,3x10r,3x12r']]],
        ['One leg at a time, or banded clamshells.', [
          ['APT: Single-Leg Glute Bridge', '2x10r,3x10r,3x12r'],
          ['Clamshell', '2x12r,3x12r,3x15r']]],
      ]],
      ['fb-full-body-flow', 'hips', { toe_touch_reach: 1, overall_stiffness: 1 }, [
        ['Pool rows: world\'s greatest stretch, standing side bend reach, leg swings.', [
          ['World\'s Greatest Stretch', '1x5r,2x5r,2x6r'],
          ['Full Body: Standing Side Bend Reach', '1x8r,2x8r,2x10r'],
          ['Leg Swings', '1x10r,2x10r,2x12r']]],
        ['Inchworm: hamstring stretch under load plus a plank.', [
          ['Full Body: Inchworm', '1x5r,2x5r,2x6r']]],
      ]],
      ['fb-ankle-wrist', 'ankles', { deep_squat_hold: 1 }, [
        ['Pool rows: ankle circles and the wrist mobility flow.', [
          ['Ankle Circles', '1x10r,2x10r,2x12r'],
          ['Wrist Mobility Flow (flexion/extension/circles)', '1x45s,2x45s,2x60s']]],
        ['Weight-bearing range: half-kneeling ankle mobilization, or the wrist prayer stretch.', [
          ['Half-Kneeling Ankle Mobilization', '1x10r,2x10r,2x12r'],
          ['Mobility: Wrist Prayer Stretch', '1x30s,2x30s,2x45s']]],
      ]],
    ],
  },

  total_mobility: {
    title: 'Total Mobility',
    tests: [
      ['toe_touch_reach', 0, 2, null, 'target_description "0 cm"', DEFAULT],
      ['deep_squat_hold', 60, 5, null, 'target_description "60 seconds"', DEFAULT],
      ['back_scratch_reach', 0, 2, null, 'target_description "0 cm on both sides"', DEFAULT],
      ['post_training_feel', 8, 2, null, `${DEFAULT} (target_description: "higher than when you started")`, `${DEFAULT} (about the usual 2-point change that matters on a 0–10 rating)`],
    ],
    slots: [
      ['tm-hip-flow', 'hips', { deep_squat_hold: 1, toe_touch_reach: 0.5, post_training_feel: 0.5 }, [
        ['Pool rows: world\'s greatest stretch, 90/90 switch, 90/90 stretch (hold capped well under 240 s).', [
          ['World\'s Greatest Stretch', '1x5r,2x5r,2x6r'],
          ['90/90 Hip Switch', '1x8r,2x8r,2x10r'],
          ['90/90 hip stretch', '1x60s,1x90s,2x90s']]],
        ['Active end range: 90/90 lift-offs, or pigeon pose on a mat.', [
          ['Full Body: 90/90 Back-Leg Lift-Off', '1x5r,2x5r,2x8r'],
          ['Pigeon Pose', '1x60s,2x60s']]],
      ]],
      ['tm-upper-back', 'thoracic_spine', { back_scratch_reach: 1.5 }, [
        ['Pool rows: open book, thread the needle, rotation over a foam roller.', [
          ['Mobility: Open Book Thoracic Rotation', '1x8r,2x8r,2x10r'],
          ['Thread the Needle', '1x6r,2x6r,2x8r'],
          ['Thoracic Rotation on Foam Roller', '1x8r,2x8r,2x10r']]],
        ['Extension over a fulcrum: chair back, or foam roller.', [
          ['Neck: Thoracic Extension Over Chair Back', '1x10r,2x10r,3x10r'],
          ['Shoulder: Thoracic Extension Over Foam Roller', '1x10r,2x10r,3x10r']]],
      ]],
      ['tm-squat-ankles', 'ankles', { deep_squat_hold: 2 }, [
        ['Pool rows: deep squat hold, Cossack squat, half-kneeling ankle mobilization.', [
          ['Deep squat hold', '2x30s,2x45s,2x60s'],
          ['Mobility: Cossack Squat Flow', '1x6r,2x6r,2x8r'],
          ['Half-Kneeling Ankle Mobilization', '1x12r,2x12r,2x15r']]],
        ['Full body weight on the ankle with an end-range hold, or a light plate.', [
          ['Ankle: Standing Knee-to-Wall Rock with Hold', '2x10r,3x10r'],
          ['Weighted Ankle Dorsiflexion Mobilization', '2x10r,3x10r']]],
      ]],
      ['tm-hamstring', 'hamstrings', { toe_touch_reach: 2 }, [
        ['Pool rows: standing hamstring stretch and toe touch with reach-through.', [
          ['Standing Hamstring Stretch', '1x45s,2x45s,2x60s'],
          ['Standing Toe Touch with Reach-Through', '1x8r,2x8r,2x10r']]],
        ['Pool row PNF (needs a strap), or the bodyweight Jefferson curl: contract-relax and loaded end range.', [
          ['PNF hamstring stretch', '1x3r,2x3r'],
          ['Full Body: Bodyweight Jefferson Curl', '1x6r,2x6r,2x8r']]],
      ]],
      ['tm-hip-flexor-quad', 'hips', { deep_squat_hold: 0.5, post_training_feel: 1 }, [
        ['Pool rows: couch stretch, half-kneeling hip flexor stretch, standing quad stretch.', [
          ['Couch stretch', '1x60s,2x60s,2x90s'],
          ['Half-Kneeling Hip Flexor Stretch with Reach', '1x45s,2x45s,2x60s'],
          ['Standing Quad Stretch', '1x30s,2x30s,2x45s']]],
        ['Loaded lengthening: front-foot-elevated split squat, or reverse Nordic.', [
          ['APT: Front-Foot-Elevated Split Squat', '2x8r,3x8r,3x10r'],
          ['Reverse Nordic Curl', '2x5r,3x5r,3x6r']]],
      ]],
      ['tm-chest-shoulder', 'shoulders', { back_scratch_reach: 2 }, [
        ['Pool rows: doorway pec stretch, shoulder CARs, towel behind-back stretch.', [
          ['Doorway Pec Stretch', '1x45s,2x45s,2x60s'],
          ['Shoulder CARs', '1x5r,2x5r,2x6r'],
          ['Towel Behind-Back Shoulder Stretch', '1x30s,2x30s,2x45s']]],
        ['Active overhead range: wall-facing lift-off, or band pass-throughs.', [
          ['Shoulder: Wall-Facing Overhead Lift-Off', '2x8r,3x8r,3x10r'],
          ['Resistance Band Shoulder Pass-Through', '1x10r,2x10r,2x12r']]],
      ]],
      ['tm-glute-activation', 'hips', { post_training_feel: 1 }, [
        ['Pool rows: fire hydrant and single-leg glute bridge.', [
          ['Fire Hydrant', '2x10r,3x10r,3x12r'],
          ['APT: Single-Leg Glute Bridge', '2x10r,3x10r,3x12r']]],
        ['Longer range on a step, or the banded lateral walk.', [
          ['APT: Single-Leg Glute Bridge, Foot on Step', '2x10r,3x10r,3x12r'],
          ['Lateral Band Walk', '2x10m,3x10m']]],
      ]],
      ['tm-wrist-forearm', 'wrists', { post_training_feel: 1 }, [
        ['Pool rows: wrist mobility flow and the prayer stretch.', [
          ['Wrist Mobility Flow (flexion/extension/circles)', '1x45s,2x45s,2x60s'],
          ['Mobility: Wrist Prayer Stretch', '1x30s,2x30s,2x45s']]],
        ['Loaded wrist range: quadruped rocks, or dumbbell reverse wrist curls.', [
          ['Mobility: Quadruped Wrist Rocks', '1x10r,2x10r,2x15r'],
          ['Reverse Wrist Curl', '2x12r,3x12r,3x15r']]],
      ]],
      ['tm-recovery-breathing', 'lower_back', { post_training_feel: 1.5, toe_touch_reach: 0.5 }, [
        ['Pool rows: legs-up breathing (time builds to the 240 s cap) and knee-to-chest.', [
          ['Mobility: Diaphragmatic Breathing, Legs Elevated', '1x120s,1x180s,1x240s'],
          ['Knee-to-Chest Stretch', '1x45s,2x45s,2x60s']]],
        ['Spinal movement: cat-cow, or child\'s pose on a mat.', [
          ['Cat-Cow', '1x10r,2x10r,2x12r'],
          ['Childs Pose', '1x60s,1x90s,2x90s']]],
      ]],
    ],
  },

  knees: {
    title: 'Knees',
    tests: [
      ['single_leg_sit_to_stand', 12, 2, null, 'target_description "12 or more reps"', DEFAULT],
      ['knee_to_wall', 10, 1.5, 'higher', 'target_description "about 9 to 12 cm" → 10', SRC.ktwMdc],
      ['wall_sit', 60, 10, null, 'target_description "60 seconds or more"', DEFAULT],
      ['stair_knee_pain', 2, 2, null, `target_description "0 to 2"; ${SRC.painModel}`, `${DEFAULT} (about the usual 2-point change that matters on a 0–10 rating)`],
    ],
    slots: [
      ['knees-ankle-dorsiflexion', 'ankles', { knee_to_wall: 2 }, [
        ['Pool rows: half-kneeling and banded ankle mobilizations.', [
          ['Half-Kneeling Ankle Mobilization', '1x12r,2x12r,2x15r'],
          ['Ankle: Banded Knee-to-Wall Mobilization', '1x15r,2x15r,2x20r']]],
        ['Full body weight on the ankle with an end-range hold, or a light plate.', [
          ['Ankle: Standing Knee-to-Wall Rock with Hold', '2x10r,3x10r'],
          ['Weighted Ankle Dorsiflexion Mobilization', '2x10r,3x10r']]],
      ]],
      ['knees-quad-capacity', 'knees', { single_leg_sit_to_stand: 1.5, wall_sit: 2, stair_knee_pain: 1 }, [
        ['Pool rows: eccentric step-down and wall sit.', [
          ['Knees: Slow Eccentric Step-Down', '2x8r,3x8r,3x10r'],
          ['Knees: Wall Sit', '2x30s,3x30s,3x45s']]],
        ['Pool row reverse Nordic: the quads at long length, the hardest of the three.', [
          ['Reverse Nordic Curl', '2x5r,3x5r,3x6r']]],
      ]],
      ['knees-hip-strength', 'hips', { single_leg_sit_to_stand: 1, stair_knee_pain: 1 }, [
        ['Pool rows: side-lying abduction, lateral band walk, fire hydrant.', [
          ['Ankle: Side-Lying Hip Abduction', '2x12r,3x12r,3x15r'],
          ['Lateral Band Walk', '2x10m,3x10m,3x15m'],
          ['Fire Hydrant', '2x10r,3x10r,3x12r']]],
        ['Abduction in a side plank, or the monster walk.', [
          ['Ankle: Side Plank with Leg Lift', '2x6r,3x6r,3x8r'],
          ['Monster Walk', '2x10m,3x10m']]],
      ]],
      ['knees-split-squat', 'knees', { single_leg_sit_to_stand: 2, wall_sit: 0.5 }, [
        ['Pool row: tempo split squat.', [
          ['Knees: Tempo Split Squat', '2x8r,3x8r,3x10r']]],
        ['Pool row single-leg sit-to-stand (the test movement), or the front-foot-elevated split squat.', [
          ['Knees: Single-Leg Sit-to-Stand', '2x6r,3x6r,3x8r'],
          ['APT: Front-Foot-Elevated Split Squat', '2x8r,3x8r,3x10r']]],
      ]],
      ['knees-single-leg-control', 'knees', { single_leg_sit_to_stand: 1, stair_knee_pain: 1 }, [
        ['Pool rows: single-leg mini squat and Y-balance reach.', [
          ['Knees: Single-Leg Mini Squat', '2x8r,3x8r,3x10r'],
          ['Y-Balance Reach', '2x3r,2x5r,3x5r']]],
        ['Pool row: the reach to a cone (a deeper hinge on one leg), or loaded with a dumbbell.', [
          ['Single-Leg Deadlift Reach to Cone', '2x6r,3x6r,3x8r'],
          ['Single-Leg Romanian Deadlift Balance Reach', '2x8r,3x8r']]],
      ]],
      ['knees-hamstring', 'hamstrings', { stair_knee_pain: 1 }, [
        ['Pool row: slider hamstring curl (the easier of the pool\'s two).', [
          ['Knees: Slider Hamstring Curl', '2x6r,3x6r,3x8r']]],
        ['Pool row Nordic curl (needs a bench or partner), or the single-leg slider curl.', [
          ['Nordic hamstring curl', '2x3r,3x3r,3x5r'],
          ['Knees: Single-Leg Slider Hamstring Curl', '2x5r,3x5r,3x6r']]],
      ]],
      ['knees-calf-tibialis', 'ankles', { knee_to_wall: 1 }, [
        ['Pool rows: single-leg heel raise, eccentric heel drop, wall tibialis raise.', [
          ['Ankle: Single-Leg Heel Raises', '2x12r,2x15r,3x15r'],
          ['Eccentric Heel Drop', '2x10r,3x10r,3x12r'],
          ['Ankle: Wall Tibialis Raise', '2x15r,2x20r,3x20r']]],
        ['Full range off a step, or the single-leg tibialis raise.', [
          ['Ankle: Slow Single-Leg Calf Raise on Step', '2x10r,3x10r,3x12r'],
          ['Ankle: Single-Leg Wall Tibialis Raise', '2x10r,3x10r']]],
      ]],
      ['knees-quad-length', 'knees', { wall_sit: 0.5, stair_knee_pain: 0.5 }, [
        ['Pool rows: standing quad stretch and couch stretch.', [
          ['Standing Quad Stretch', '1x30s,2x30s,2x45s'],
          ['Couch stretch', '1x45s,2x45s,2x60s']]],
        ['Active length under body weight: kneeling lean-back, or rolling on a foam roller.', [
          ['Knees: Kneeling Quad Lean-Back', '1x6r,2x6r,2x8r'],
          ['Foam Roll Quads', '1x60s,2x60s']]],
      ]],
    ],
  },
};

// ------------------------------------------------------------------ catalog knowledge from earlier migrations
const migrationTexts = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql') && f < '20261112130000')
  .map((f) => readFileSync(join(MIG_DIR, f), 'utf8'));
const allSql = migrationTexts.join('\n');
const sqlLit = (s) => `'${s.replace(/'/g, "''")}'`;

// Equipment + type for every existing global exercise we may reference.
const library = JSON.parse(readFileSync(join(ROOT, 'docs/superpowers/content/2026-11-09/library_exercises.json'), 'utf8'));
const known = new Map(library.map((e) => [e.name, { equipment: e.equipment_needed ?? [], type: e.exercise_type }]));
// 20261109150500 inserts (C3) are newer than the library snapshot.
const c3 = readFileSync(join(MIG_DIR, '20261109150500_new_sprints_and_basic_alternatives.sql'), 'utf8');
const rowRe = /^\s+\('((?:[^']|'')+)', '\w+', '(\w+)', array\[[^\]]*\], '(?:[^']|'')*', '[A-D]', array\[([^\]]*)\]/gm;
for (const m of c3.matchAll(rowRe)) {
  const equipment = m[3].trim() ? m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [];
  known.set(m[1].replace(/''/g, "'"), { equipment, type: m[2] });
}
for (const e of NEW_EXERCISES) {
  if (known.has(e[0])) throw new Error(`new exercise name already exists: ${e[0]}`);
  // also guard against any earlier insert anywhere in the migrations
  if (allSql.includes(`(${sqlLit(e[0])},`)) throw new Error(`new exercise name already inserted earlier: ${e[0]}`);
  known.set(e[0], { equipment: e[6], type: e[2] });
}
// Existing pool rows: original seeds (snapshot) + C3 additions.
const pool = JSON.parse(readFileSync(join(ROOT, 'docs/superpowers/content/2026-11-09/sprint_pools.json'), 'utf8'))
  .map((r) => ({ pp: r.pain_point_id, slot: r.slot_key, name: r.name }));
const poolRe = /select '(\w+)', \d, '([\w-]+)', \(select id from exercises where name = '((?:[^']|'')+)' and owner_id is null\)/g;
for (const m of c3.matchAll(poolRe)) pool.push({ pp: m[1], slot: m[2], name: m[3].replace(/''/g, "'") });

// Template slots per pain point, parsed from the seed migrations.
const templateSlots = new Map();
const addTpl = (pp, slot) => { if (!templateSlots.has(pp)) templateSlots.set(pp, new Set()); templateSlots.get(pp).add(slot); };
for (const m of allSql.matchAll(/select '(\w+)', d, slot, 1, ord[\s\S]*?\(values ([^;]*?)\) as t\(slot, ord\)/g)) {
  for (const s of m[2].matchAll(/\('([\w-]+)', \d+\)/g)) addTpl(m[1], s[1]);
}
for (const m of allSql.matchAll(/\('(\w+)', \d+, '([\w-]+)', 2, \d+\)/g)) addTpl(m[1], m[2]);

// ------------------------------------------------------------------ validate + flatten
const errors = [];
const parseStep = (s) => {
  const m = /^(\d+)x(\d+)([rsm])$/.exec(s.trim());
  if (!m) throw new Error(`bad step ${s}`);
  const unit = { r: ' reps', s: 's', m: 'm' }[m[3]];
  return { sets: +m[1], dose: `${m[2]}${unit}`, n: +m[2], kind: m[3] };
};
const isBasic = (name) => known.get(name).equipment.every((k) => BASIC.has(k));

const slotRows = [], linkRows = [], ladderRows = [], testRows = [];
const usedNew = new Map();
for (const [pp, data] of Object.entries(PAIN_POINTS)) {
  const tplSlots = templateSlots.get(pp) ?? new Set();
  const slotKeys = new Set(data.slots.map((s) => s[0]));
  for (const t of tplSlots) if (!slotKeys.has(t)) errors.push(`${pp}: template slot ${t} has no content`);
  for (const k of slotKeys) if (!tplSlots.has(k)) errors.push(`${pp}: slot ${k} is not in the template`);
  const testKeys = new Set(data.tests.map((t) => t[0]));
  const linkedTests = new Set();
  for (const t of data.tests) testRows.push({ pp, key: t[0], target: t[1], noise: t[2], raw: t[3] });
  for (const [slot, area, links, levels] of data.slots) {
    if (!AREAS.has(area)) errors.push(`${pp}/${slot}: bad area ${area}`);
    if (levels.length < 2 || levels.length > 4) errors.push(`${pp}/${slot}: ${levels.length} levels`);
    if (!Object.keys(links).length) errors.push(`${pp}/${slot}: no links`);
    for (const [tk, w] of Object.entries(links)) {
      if (!testKeys.has(tk)) errors.push(`${pp}/${slot}: link to unknown test ${tk}`);
      if (w < 0.5 || w > 2) errors.push(`${pp}/${slot}: weight ${w}`);
      linkedTests.add(tk);
      linkRows.push({ pp, test: tk, slot, weight: w });
    }
    const firstName = levels[0][1][0][0];
    if (!known.has(firstName)) errors.push(`${pp}/${slot}: unknown exercise ${firstName}`);
    const isStretch = known.get(firstName)?.type === 'mobility_stretch';
    slotRows.push({ pp, slot, area, isStretch });
    const inLadder = new Set();
    levels.forEach(([, exercises], li) => {
      const level = li + 1;
      let basic = false;
      exercises.forEach(([name, steps], ai) => {
        if (!known.has(name)) { errors.push(`${pp}/${slot}: unknown exercise "${name}"`); return; }
        if (NEW_EXERCISES.some((e) => e[0] === name)) usedNew.set(name, (usedNew.get(name) ?? 0) + 1);
        if (isBasic(name)) basic = true;
        inLadder.add(name);
        const parsed = steps.split(',').map(parseStep);
        if (parsed.length < 2 || parsed.length > 3) errors.push(`${pp}/${slot} L${level} ${name}: ${parsed.length} steps`);
        parsed.forEach((p, si) => {
          if (isStretch && p.kind === 's' && p.sets * p.n > 240) errors.push(`${pp}/${slot} L${level} ${name}: ${p.sets}x${p.n}s > 240`);
          if (si > 0) {
            const q = parsed[si - 1];
            const up = p.sets > q.sets || (p.sets === q.sets && p.n > q.n);
            const down = p.sets < q.sets || p.n < q.n;
            if (!up || down) errors.push(`${pp}/${slot} L${level} ${name}: step ${si + 1} doesn't raise volume`);
          }
          ladderRows.push({ pp, slot, level, name, alt: ai + 1, step: si + 1, sets: p.sets, dose: p.dose });
        });
      });
      if (!basic) errors.push(`${pp}/${slot} L${level}: no Basic-tier exercise`);
    });
    for (const p of pool.filter((r) => r.pp === pp && r.slot === slot)) {
      if (!inLadder.has(p.name)) errors.push(`${pp}/${slot}: pool exercise "${p.name}" missing from ladder`);
    }
  }
  for (const t of testKeys) if (!linkedTests.has(t)) errors.push(`${pp}: test ${t} has no link`);
}
for (const p of pool) if (!PAIN_POINTS[p.pp]) errors.push(`pool row for unknown pain point ${p.pp}`);
for (const e of NEW_EXERCISES) if (!usedNew.has(e[0])) errors.push(`new exercise unused: ${e[0]}`);
// Existing names referenced must be inserted by exactly one earlier tuple (no duplicates, no typos).
for (const name of new Set(ladderRows.map((r) => r.name))) {
  if (NEW_EXERCISES.some((e) => e[0] === name)) continue;
  const lit = sqlLit(name);
  const n = (allSql.match(new RegExp(`\\(${lit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}, '`, 'g')) ?? []).length;
  if (n !== 1) errors.push(`existing exercise "${name}" inserted ${n} times in earlier migrations`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ------------------------------------------------------------------ SQL
const arr = (a) => (a.length ? `array[${a.map(sqlLit).join(', ')}]` : 'array[]::text[]');
const exId = (name) => `(select id from exercises where name = ${sqlLit(name)} and owner_id is null)`;
let sql = `-- GENERATED FILE. Do not edit by hand.
-- Generator: docs/superpowers/content/2026-11-12-engine/gen_engine_content.mjs
-- Source notes: docs/superpowers/content/2026-11-12-engine/<pain_point_id>.md
-- Adaptive sprint engine content for all 7 pain points: new exercises, test targets and noise
-- thresholds, one sprint_slots row per template slot, test-to-slot links, and the slot ladders.
-- Spec: docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md (sections 5.1, 5.2, 6, 8a).
-- Re-runnable: exercises insert only when the name is missing; content tables use on conflict do nothing.
-- Ladder rows look exercises up by name, so a missing name fails loudly on the not-null exercise_id.

-- ---------------------------------------------------------------- new exercises
insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective, cue, description)
select v.* from (values
${NEW_EXERCISES.map((e) => `  (${sqlLit(e[0])}, ${sqlLit(e[1])}, ${sqlLit(e[2])}, ${arr(e[3])}, ${sqlLit(e[4])}, ${sqlLit(e[5])}, ${arr(e[6])}, ${e[7]}, ${sqlLit(e[8])}, ${e[9]}, ${e[10]}, ${sqlLit(e[11])}, ${sqlLit(e[12])})`).join(',\n')}
) as v(name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective, cue, description)
where not exists (select 1 from exercises e where e.name = v.name and e.owner_id is null);

-- ---------------------------------------------------------------- test targets
`;
for (const t of testRows) {
  const raw = t.raw ? `, raw_direction = ${sqlLit(t.raw)}` : '';
  sql += `update assessment_definitions set target_value = ${t.target}, noise_threshold = ${t.noise}${raw} where pain_point_id = ${sqlLit(t.pp)} and test_key = ${sqlLit(t.key)};\n`;
}
sql += `
-- ---------------------------------------------------------------- slots
insert into sprint_slots (pain_point_id, slot_key, area, is_stretch) values
${slotRows.map((s) => `  (${sqlLit(s.pp)}, ${sqlLit(s.slot)}, ${sqlLit(s.area)}, ${s.isStretch})`).join(',\n')}
on conflict do nothing;

-- ---------------------------------------------------------------- test -> slot links
insert into assessment_slot_links (pain_point_id, test_key, slot_key, weight) values
${linkRows.map((l) => `  (${sqlLit(l.pp)}, ${sqlLit(l.test)}, ${sqlLit(l.slot)}, ${l.weight})`).join(',\n')}
on conflict do nothing;

-- ---------------------------------------------------------------- ladders
-- (pain_point_id, slot_key, level, exercise, alt_rank, step, sets, reps_or_duration)
insert into slot_ladder (pain_point_id, slot_key, level, exercise_id, alt_rank, step, sets, reps_or_duration) values
${ladderRows.map((r) => `  (${sqlLit(r.pp)}, ${sqlLit(r.slot)}, ${r.level}, ${exId(r.name)}, ${r.alt}, ${r.step}, ${r.sets}, ${sqlLit(r.dose)})`).join(',\n')}
on conflict do nothing;
`;
writeFileSync(OUT_SQL, sql);

// ------------------------------------------------------------------ notes
const fmtSteps = (steps) => steps.split(',').map((s) => { const p = parseStep(s); return `${p.sets}×${p.dose}`; }).join(' → ');
const tierOf = (name) => {
  const eq = known.get(name).equipment;
  return eq.every((k) => BASIC.has(k)) ? 'Basic' : 'Int/Adv';
};
const counts = {};
for (const [pp, data] of Object.entries(PAIN_POINTS)) {
  const newHere = new Set();
  let md = `# ${data.title} (\`${pp}\`) — engine content\n\n`;
  md += `Generated from \`gen_engine_content.mjs\` (edit the data there, then re-run). Migration: \`supabase/migrations/20261112130000_adaptive_engine_content.sql\`.\n`;
  md += `Every number without a source is marked **${DEFAULT}**. Stretch steps stay at or under 240 s of hold per side (${SRC.stretchCap}).\n\n`;
  md += `## Tests\n\n| Test | Target | Noise | Raw direction | Target source | Noise source |\n|---|---|---|---|---|---|\n`;
  for (const t of data.tests) md += `| \`${t[0]}\` | ${t[1]} | ${t[2]} | ${t[3] ?? '— (not symmetry)'} | ${t[4]} | ${t[5]} |\n`;
  md += `\n## Slots and links\n\n| Slot | Area | Stretch | Linked tests (weight) |\n|---|---|---|---|\n`;
  for (const [slot, area, links] of data.slots) {
    const s = slotRows.find((r) => r.pp === pp && r.slot === slot);
    md += `| \`${slot}\` | ${area} | ${s.isStretch ? 'yes' : 'no'} | ${Object.entries(links).map(([k, w]) => `${k} (${w})`).join(', ')} |\n`;
  }
  md += `\nLink weights are **${DEFAULT}**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.\n`;
  md += `\n## Ladders\n\nSteps raise sets first, then reps or hold. Step and dose numbers are **${DEFAULT}** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.\n\n`;
  md += `| Slot | Lvl | Exercise | Tier | Steps | Why this level |\n|---|---|---|---|---|---|\n`;
  let levelCount = 0;
  for (const [slot, , , levels] of data.slots) {
    levels.forEach(([why, exercises], li) => {
      levelCount++;
      exercises.forEach(([name, steps], ai) => {
        if (NEW_EXERCISES.some((e) => e[0] === name)) newHere.add(name);
        md += `| ${ai === 0 ? `\`${slot}\`` : ''} | ${ai === 0 ? li + 1 : ''} | ${name}${NEW_EXERCISES.some((e) => e[0] === name) ? ' *(new)*' : ''} | ${tierOf(name)} | ${fmtSteps(steps)} | ${ai === 0 ? why : ''} |\n`;
      });
    });
  }
  if (newHere.size) {
    md += `\n## New exercises used here\n\n`;
    for (const name of newHere) {
      const e = NEW_EXERCISES.find((x) => x[0] === name);
      md += `- **${name}** (${e[2]}, grade ${e[5]}, ${e[6].length ? e[6].join(', ') : 'no equipment'}): ${e[4]}\n`;
    }
  }
  writeFileSync(join(HERE, `${pp}.md`), md);
  counts[pp] = { slots: data.slots.length, levels: levelCount, ladderRows: ladderRows.filter((r) => r.pp === pp).length, newExercisesUsed: newHere.size, links: linkRows.filter((l) => l.pp === pp).length };
}
console.log(JSON.stringify({ newExercises: NEW_EXERCISES.length, slots: slotRows.length, links: linkRows.length, ladderRows: ladderRows.length, counts }, null, 1));
