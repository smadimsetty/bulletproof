# Morning handoff (2026-11-10): build 23, v1.2.0

Spec: `docs/superpowers/specs/2026-11-09-logger-polish-and-sprints-design.md`. Plan: `docs/superpowers/plans/2026-11-09-logger-polish-and-sprints.md`.

## Install it first
Open **TestFlight**, then Bulletproof, then install **1.2.0 (23)**. It's a new version number, so it shows up as its own entry, and it may not install automatically.

## What changed

**Workout (logger)**
- ✓ and swipe-to-delete respond instantly. Before, they waited on two network round trips and a full reload. Now the screen updates first and the save happens behind it. If a save fails, the row goes back and a red toast appears.
- Raw font sizes and system alert pop-ups were removed. The logger now uses the same type and toasts as the rest of the app.
- **Sounds:** a double beep plays when a hold, switch-sides or rest timer ends. It plays even with the phone on silent, and your music dips briefly instead of stopping. If the phone is locked, you get a notification with a sound instead.
- **Lock screen / Dynamic Island:** the black box is fixed. The cause was the widget code reading two color constants defined outside it; the widget runs isolated, so those didn't exist and nothing rendered. It now shows the workout title, a live elapsed timer, the current exercise, and a countdown during holds and rests. It disappears when you finish or discard the workout.

**Exercises**
- The eye icon shows a one-line instruction in the voice you approved. There are 163 of them, all human-written in style, with no "why".
- Tapping an exercise name opens the full page: the video plays inside the app, then "How to do it", then "Why it helps". There's also an "Open in YouTube" link.
- Videos are verified YouTube demos. 122 were newly found and every one was checked to exist and to have a matching title. The 38 links that were already there were re-checked. Only one sprint exercise has no video ("Ankle: Outer-Edge Foot Walk"); it shows "Video coming soon".
- Body areas read normally now ("Lower back", "Upper back"). The duplicate keys in the data were merged.

**Equipment tiers**
- **Basic** is bodyweight only, **Intermediate** is a bench, light dumbbells, bands and a pull-up bar, and **Advanced** is a full gym.
- New users are asked during onboarding. Existing users (you) get a one-time sheet on the Workout tab. You can change it in Settings → Equipment.
- Sprint routines only pick exercises your tier allows. Every slot in all 7 sprints has a bodyweight option, checked against the live database.
- **Your current sprint was built before tiers existed, so it won't change.** New sprints and one-off workouts use your tier.

**Sprints**
- **Three new sprints:**
  - **Full Body**: desk workers with stiffness everywhere.
  - **Total Mobility**: feel-good mobility and recovery for people who already train.
  - **Knees**.
- Each new sprint has 4 easy tests, with no equipment beyond a wall, a tape measure and a timer.
- The sprint picker shows a tagline under each sprint, plus a "More" toggle for the description. All 7 descriptions were rewritten in plain words.
- **Change today's focus** (on the sprint card) first warns you that you're going off-plan. Then you pick another area and choose "Just today" or "Start a new sprint".
  - **Just today** starts a normal workout called "<Area> (one-off)". Your sprint day stays open.
  - **Start a new sprint** ends the current one and starts the new one's baseline test.

## On-device checklist (about 10 min)
1. **Lock screen during a workout:** start one and lock the phone. You should see a ticking timer and the current exercise, not a black box. Finish the workout, and it should disappear.
2. **Sound:** start a 30 s hold with the phone on silent and music playing. You should hear the beep and the music should dip. Do it again with the phone locked: you should get a notification with a sound.
3. **✓ and swipe-delete** should feel instant.
4. **Eye icon** shows a one-liner. **Tap an exercise name**, and the video should play inside the app. If it shows "Error 153" or a black player, tell me. That's the one fix I couldn't confirm off-device. "Open in YouTube" always works.
5. **Equipment sheet** appears once on the Workout tab. Pick a tier, then check that Settings shows it.
6. **Sprint picker:** you should see 7 sprints with taglines, and "More" expands each one.
7. **Change today's focus → Just today:** finish that workout, and your sprint day should still be open.

## Decisions I made that you should check
- Sounds play on silent and dip your music.
- Until an existing user picks a tier, the picker treats them as Advanced (today's behaviour).
- The exercise page shows the video first, then how-to, then why.
- During a hold or rest, the Dynamic Island shows the countdown. Otherwise it shows elapsed time.
- New tests: Toe Touch and Back Scratch measure the gap and use 0 for touching, because the iOS number keypad has no minus key. Lower is better.
- "Knees: Single-Leg Sit-to-Stand" needs a chair but counts as bodyweight.
- One-off workouts are saved like empty workouts; the "(one-off)" title is what marks them.

## Still open (later this week, per you)
- Progressions (making an exercise harder).
- Our own or AI-generated videos.
- Rethinking the original four sprints' tests to make them as easy as the new ones.
- Small logger leftovers:
  - A swipe-delete during a pending tick springs back without saying why.
  - Changing your tier doesn't rebuild an existing sprint.
  - "Start a new sprint" isn't atomic: if starting the new sprint fails, the old one is already ended.
  - `partner_or_bench` counts as Basic.
- Public launch items (SMTP, Apple key, Supabase Pro, website/domain, listing). Beta testers come first.
