# Task C3 report

Migration: supabase/migrations/20261109150500_new_sprints_and_basic_alternatives.sql

## New sprints
Migration: `supabase/migrations/20261109150500_new_sprints_and_basic_alternatives.sql`.

**Full Body** (desk workers). Daily: spine mobility, hip opener, chest/shoulder opener. Tier 2 (9 days): hamstring/calf, squat hold, neck release, glute wake-up, full-body flow, ankle/wrist. Assessments: toe touch, deep squat hold, wall angels, overall stiffness 1-10.

**Total Mobility** (gym-goers). Daily: hip flow, upper back rotation, squat/ankles. Tier 2: hamstring, hip flexor/quad, chest/shoulder, glute activation, wrist/forearm, recovery breathing. Assessments: toe touch, deep squat hold, back-scratch reach (both sides), how you feel after training 1-10.

**Knees**. Daily: ankle dorsiflexion, quad capacity (eccentric step-down, reverse Nordic, wall sit), hip strength. Tier 2: split squat, single-leg control, hamstring (Nordic/slider), calf/tibialis, quad length. Reasoning: hip and quad loading plus eccentric hamstrings follow patellofemoral and ACL-prevention programs; ankle range sits upstream of the knee. Assessments: single-leg sit-to-stand, knee-to-wall, wall sit, knee pain on stairs 0-10.

20 new exercises (all with cue + description), 3 pain_points rows, 4 pain_points updates, 12 assessments.

## Existing slots given a bodyweight option
- ankle:
  - ankle-mobilization <- Half-Kneeling Ankle Mobilization
  - ankle-eversion-strength <- Ankle: Outer-Edge Foot Walk
  - ankle-inversion-dorsiflexion-strength <- Ankle: Toe and Heel Walks
  - ankle-calf-strength-loaded <- Ankle: Slow Single-Leg Calf Raise on Step
  - ankle-balance-unstable <- Single-Leg Deadlift Reach to Cone
- rounded_shoulders:
  - shoulder-band-pull-aparts <- Shoulder: Prone Scapular Retraction Hold
  - shoulder-bottoms-up-carry-press <- Plank with Shoulder Taps
  - shoulder-external-rotation-90 <- Wall Slide with External Rotation
  - shoulder-face-pulls <- Shoulder: Prone W Raise
  - shoulder-overhead-press-full-range <- Shoulder: Pike Push-Up
  - shoulder-passive-hang <- Shoulder: Wall Overhead Hip-Hinge Stretch
  - shoulder-serratus-wall-slides <- Scapular Wall Slides
  - shoulder-thoracic-extension <- Neck: Thoracic Extension Over Chair Back
- anterior_pelvic_tilt:
  - apt-loaded-carry <- Plank with Shoulder Taps
  - apt-loaded-hip-hinge <- Single-Leg Deadlift Reach to Cone
  - apt-split-squat <- Knees: Tempo Split Squat
- nerd_neck:
  - neck-face-pulls-pullaparts <- Shoulder: Prone Scapular Retraction Hold
  - neck-farmers-carry <- Neck: Forearm Plank, Shoulders Pushed Away
  - neck-rows <- Neck: Towel Doorway Row

## Self-check output
```
sprints/slots: 63 total slots; ankle=10 rounded_shoulders=10 nerd_neck=9 anterior_pelvic_tilt=8 full_body=9 total_mobility=9 knees=8
no-basic-slots: 0  bodyweight options added: 19  new exercises: 20
statements 16; statements with unbalanced quotes: 0
full_body: tier1 slots=3, tier2 days=9, tier2 slots=6
total_mobility: tier1 slots=3, tier2 days=9, tier2 slots=6
knees: tier1 slots=3, tier2 days=9, tier2 slots=5
```
