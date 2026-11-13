# Adaptive sprint engine — design

*2026-11-12. Replaces the static sprint exercise picker. Status: approved by Sohan 2026-11-12.*

## 1. Intent

Today a sprint's 14 days are generated once, right after the baseline test, by a least-recently-used picker over hand-seeded tables (`sprint_day_template`, `sprint_exercise_pool`, `lib/sprintExercisePicker.ts`, `activateSprintAfterBaseline` in `lib/sprintLifecycle.ts`). The result is static and the same for everyone:
- On a first sprint, every slot gets its rank-1 exercise on all 14 days. Nothing is "completed" while the days are being generated, so the LRU rule never rotates.
- There's no progression: day 14's prescription equals day 1's.
- Baseline results are only used for the before/after summary.
- Daily feedback and logged sets change nothing.
- Left/right gaps are ignored.

Sohan wants a sprint to be **a living plan that's personal to the user**:
- Each day's routine is rebuilt from the user's assessment, their feedback and what they actually logged.
- Work goes directly at what the assessment shows is weak, including the weaker side.
- Difficulty progresses as the user earns it.

His test: *"I'd wince if my friend got the exact same stuff as me."*

It has to stand on sports-physical-therapy practice, not vibes (research summary in §9).

## 2. Goals, non-goals, anti-goals

**Goals**
1. **Assessment-driven.** Baseline tests set priorities. The tests furthest from their target get the most work.
2. **Left/right aware.** When a one-sided test shows a side gap bigger than that test's measurement noise, the weaker side gets extra volume and goes first.
3. **Progressive.** Every slot has a difficulty ladder. You move up when you meet the criteria, not on a calendar.
4. **Adapts every day.** Each day is built when the user reaches it, from the latest feedback and logs.
5. **Daily time budget.** The user picks how many minutes a day they'll commit, and the day is fitted to it.
6. **Fast feedback.** The post-workout check (effort + pain) stays under 20 seconds.
7. **Retest recommendation.** After the retest, the app recommends staying on this focus for another sprint (continuing from where you left off) or switching focus, and says why.
8. **Cheap AI on top of rules.** Claude adds personal judgment at a few points per sprint. Claude Haiku 5.5 for now, swappable by config. The app must fully work if the AI call fails.

**Non-goals (this project)**
- Sports or other lifestyle context (pickleball, desk job). Deferred by Sohan.
- Payments and paywalls. Sohan expects to charge eventually, and that's why the model choice must be a one-line config change later.
- Machine learning trained on user data.
- Changing the 7 pain points or their assessment tests. Recording two extra numbers per test is in scope; changing the tests isn't.
- Demo videos and other content beyond what the ladders need.

**Anti-goals: a failure even if it technically works**
- Two people with different tests and feedback get the same plan.
- The AI makes safety decisions. Pain limits and step sizes are rules and can't be overridden.
- A jump in difficulty that ignores pain, or keeps progressing while pain trends up.
- Feedback that takes more than ~20 s, or a day that won't load without the AI.
- Before/after claims of progress that sit inside the test's measurement noise.

## 3. Constraints
- **Existing stack:** Expo/React Native app, Supabase Postgres with RLS, and Edge Functions (Deno/TS).
  - Every new personal table is owner-scoped. Child tables need the parent-ownership `WITH CHECK` (see the 2026-11-07 FK-bypasses-RLS lesson in CLAUDE.md).
  - Re-run the live RLS smoke suites after migrations, and push migrations manually (`npx supabase migration list --linked` first).
- **Secrets:** the Anthropic API key lives only server-side, as an Edge Function secret. Never in the app bundle.
- **Speed:** a day must appear quickly. The rules path is fast and local to the request. AI calls happen at the three trigger points in §5.3 only, never on every app open.
- **Cost:** about 3–5 Haiku calls per sprint, roughly 0.2¢ each, so well under 1¢ per user per sprint.
- **Existing sprints:** in-flight sprints must keep working (§7).

## 4. Inputs the engine uses

| Input | Source | Status |
|---|---|---|
| Baseline and retest values, left/right/single | `sprint_assessment_results` | exists |
| Test target and better direction | `assessment_definitions` | exists. **Add** a numeric `target_value` (the existing `target_description` is free text) and `noise_threshold`: the smallest change or side gap that counts as real. Example: knee-to-wall about 1.5 cm. |
| Which slots train which test | **new** `assessment_slot_links (pain_point_id, test_key, slot_key, weight)` | to author |
| Difficulty ladder per slot | **new**, see §5.2 | to author |
| Exercise time estimate | **new** column or derived: seconds per set from reps (~3 s/rep) or hold, plus rest; ×2 for one-sided | rule |
| Daily time budget | **add** `user_settings.daily_time_range`: one of `5-10`, `10-20` or `20-30` minutes. Null means not asked yet and is treated as `10-20`. | new |
| Equipment tier | `user_settings.equipment_tier` | exists; keep `filterCandidatesByTier` semantics |
| Effort + pain feedback | **replace** `sprint_day_feedback.reaction` (good/neutral/hurt) with `effort` (`easy`/`right`/`hard`), `pain` (0–10) and an optional `pain_area` (one of the pain point's areas, or "other"). Keep `note`. | change |
| What was actually done | `workout_sets` linked via `workout_exercises.sprint_day_exercise_id` | exists |
| State carried from a previous sprint on the same pain point | **new** per-slot state (§5.2) | new |

## 5. How it works

### 5.1 Priorities from the assessment (rules)
For each test, from the latest assessment (the baseline, or the previous sprint's retest when continuing):
- **Deficit:** how far the result is from `target_value`, as a fraction of the target, clamped to 0–1, in the test's better direction. For one-sided tests, use the weaker side's value.
- **Side gap:** flagged when |left − right| > `noise_threshold`. The weaker side is the worse of the two in the better direction.
- A **slot's priority** is the sum over linked tests of `weight × (floor + deficit)`. The floor keeps maintenance work alive for tests already at target; its value is the builder's call, around 0.2.

### 5.2 Ladders and per-slot state (rules)
- **Ladder:** each slot has an ordered list of **levels**. A level is one exercise (with optional same-difficulty alternates for variety) plus its prescription: sets and reps/hold.
- **Steps within a level:** a level has 2–4 **steps** that raise volume or hold time before moving to the next exercise. Example: 2×20s → 3×20s → 3×30s → next level.
- **Stretch slots:** `mobility_stretch` slots stop adding hold time once about 4 minutes per area per session is reached, which is where the research says gains plateau. After that, the ladder moves on to loaded or active end-range variants.
- **Content:** the existing pool rows become the first ladder levels. New levels are authored where a slot has only one rung.
- **Per-slot state:** each sprint stores `current_level`, `current_step`, a streak of "right" sessions, and the last date done. A continuing sprint starts from the previous sprint's end state. A first sprint starts at level 1 step 1, or step 2 when that test's deficit is small (my call).

**Daily progression rule.** Applied to every slot done in the last workout, using that workout's feedback plus what was logged for that slot.

| Signal | Action |
|---|---|
| Pain > 5, or `pain_area` matches this slot's area with pain ≥ 4 | Step back one step (level floor 1). Mark "pain flag", which triggers the Claude adjust call (§5.3). |
| Pain 3–5 | Hold. |
| Pain higher than the same weekday a week earlier for 2 consecutive sessions | Hold everything, no progression (pain-monitoring model: pain must not trend up). |
| Logged less than ~80% of the prescribed reps/hold | Hold. |
| Effort `hard` | Hold. Two `hard` in a row on the same slot → step back. |
| Effort `right` | Hold. Two `right` in a row → step up. |
| Effort `easy`, pain ≤ 2, prescription completed | Step up. |
| Missed days: gap 3–6 days | Hold. |
| Missed days: gap ≥ 7 days | Step back one. |

One step per slot per day, maximum.

### 5.3 Building a day (rules, every day)
When the user opens a sprint day that hasn't been built yet:
1. Apply the progression rule to update slot state.
2. **Pick slots:**
   - The template keeps its role as rhythm: core slots run daily and strength slots alternate.
   - The template's day-N slot list becomes the *candidate* set for the day.
   - Rank the candidates by priority.
   - Fit them into the user's range: fill up to the upper bound, then drop the lowest priority first. A day may fall below the lower bound only when the day's candidate slots run out.
   - The top-priority slot is never dropped.
   - If time remains, add the next-highest-priority off-rhythm slot, but not the same strength slot on consecutive days.
3. **Pick the exercise:**
   - Use the slot's current level, filtered by equipment tier.
   - Among alternates, pick the least recently done, counting this sprint's earlier days too. That fixes today's no-rotation bug.
   - Never repeat an exercise within one day (existing rule).
4. **Side bias:** for one-sided exercises in a slot linked to a test with a flagged side gap:
   - The weaker side goes first.
   - The weaker side gets +1 set (the "double volume on the weaker side" evidence), time permitting.
   - Stored on the day's exercise row (e.g. `extra_side`).
5. **"Why today" line:** write a short reason the user sees, built from a rules template. Example: "Left ankle first, plus one extra set: your knee-to-wall gap is 4 cm."

**Where the code runs:** a new Edge Function (e.g. `plan-sprint-day`), so that rules and Claude share one server-side path and the key stays server-side.
- Keep the pure rules (priority, progression, slot fitting, picking) in a dependency-free module with unit tests. It's the builder's call whether that lives in `supabase/functions/_shared/` with Deno tests or is shared with the app.
- **Idempotent:** a day that's already built is never rebuilt by a later call. The existing swap and tier-refit flows still work on built days.

### 5.4 Where Claude comes in (Haiku 5.5, structured JSON output)
There are three trigger points. Each call gets a compact, cache-friendly prompt:
- **Stable part, cached:** the rules summary, the pain point's tests with targets, its ladders and allowed exercise ids.
- **Changing part:** this user's results, state and recent feedback.

| Trigger | Claude decides (inside rule limits) | Rules fallback if the call fails |
|---|---|---|
| **Sprint start** (after baseline, or after the retest when continuing) | Per-slot priority adjustment (±1 tier of emphasis), starting level per slot (within ±1 of the rules default), alternates to prefer or avoid, and a 2–3 sentence "your plan" summary shown on the sprint screen. | Rules priorities and defaults; a generic summary template. |
| **Pain flag** (§5.2) | A regression or substitute for the affected slot(s), chosen from the allowed lower levels or alternates, plus a one-line note. | Step back one level. |
| **Retest** | Stay or switch, with 2–3 sentences of reasoning. If switching, which pain point to suggest, based on the other tests' data if the user has any. | **Stay** if any key test is still short of target by more than its noise threshold, or a side gap remains. Otherwise **switch**, and show the pain-point list. |

- **Validation:** every AI output is checked against the allowed ids and ranges. Anything outside them is clamped or dropped, and the rules fill the gap. The AI never sets pain limits, step sizes or volume beyond the ladder.
- **Configuration:** the model is a config value (e.g. an Edge Function secret `SPRINT_ENGINE_MODEL`), defaulting to `claude-haiku-5-5`.
- **Logging:** log each call's model, token usage, trigger and outcome to an owner-scoped log table, so cost per user is measurable before pricing decisions.
- **Haiku refusals:** Haiku 5.5 has no server-side refusal fallback, so treat a refusal like any other failure and use the rules fallback.

### 5.5 What the user sees
- **Time budget:** "How much time a day?" with three choices: 5–10, 10–20 and 20–30 min (**Sohan's call**).
  - Asked once during onboarding, and changeable later in Settings.
  - Existing users who finished onboarding before this ships get the question once, the same way the one-time equipment sheet works.
  - A change applies from the next day that hasn't been built yet.
- **Finish sheet:** the 3-way reaction becomes:
  - effort: Easy / About right / Too hard
  - pain: a 0–10 quick picker defaulting to 0
  - if pain ≥ 3, an optional "where?" chip row
  - the existing optional note
  Target: under 20 s.
- **Sprint day screen:** the "why today" line. A small level/step indicator per exercise is the builder's call. The weaker side is labelled when it has an extra set.
- **Sprint screen:** Claude's "your plan" summary.
- **Retest summary:**
  - The before/after only calls a change real when it exceeds the test's noise threshold; anything smaller reads as "no clear change".
  - The stay/switch recommendation card, with a one-tap action for each choice.
- **Logger:** for a one-sided exercise with an extra side set, the weaker side's sets come first and it has one more set.
  - This is a change from today's left-first rule (CLAUDE.md non-negotiable "unilateral starting with the LEFT side"). The weaker side now wins when a gap is flagged, and left-first stays the default otherwise.

## 6. Content authoring (part of this project)
For all 7 pain points, Claude drafts the following from published PT protocols. **Sohan's call:** the drafts ship straight to TestFlight, and he reviews them on-device while using them. Review doesn't block the release. Every content default is labelled in the source notes so he can find it.
- `target_value` and `noise_threshold` per test.
- `assessment_slot_links` with weights.
- Ladders: levels, steps and alternates for every slot. Every level must keep a Basic-tier option, extending the existing `check_basic_coverage.sql` guarantee to every ladder level.

Where the evidence gives no number, use a sensible clinical default and label it as such in the source notes, following the pattern in `docs/superpowers/content/2026-11-09/`.

## 7. Migration of existing sprints
- New sprints use the new engine.
- For in-flight sprints:
  - Keep days that are completed or started.
  - Delete the exercise rows for future days that haven't been started, so they get built lazily by the new engine.
  - Create per-slot state at level 1 step 1, or derive it from what has been logged so far (builder's call).
- Existing `reaction` values map to effort/pain: good → easy/0, neutral → right/0, hurt → right/6.

## 8. Decisions and who made them
**Sohan's:**
- The plan changes daily from feedback.
- Effort + pain check under 20 s.
- Time budget chosen by the user.
- Stay-or-switch recommendation at retest.
- Personal enough that two people never get the same plan.
- Hybrid rules + AI, with Haiku for now and room to upgrade.
- Science-backed.

**My calls, flagged for review:**
- Rules own safety and daily progression; AI only at the 3 trigger points.
- The engine runs in an Edge Function.
- The specific progression thresholds in §5.2.
- Weaker side first plus one extra set (approved by Sohan 2026-11-12).
- Missed-day handling.
- The migration approach.

**Left to the builder:**
- Exact table and column names.
- Where the pure module lives and its test runner.
- The time-estimate formula.
- The level-indicator UI.
- The prompt wording.

## 8a. Settled after the builder review (my calls unless marked)

1. **"Symmetry" tests** (e.g. 4 of the 6 ankle tests) are scored on both their raw value and their balance:
   - Add a `raw_direction` (`higher`/`lower`) and a numeric `target_value` where the evidence gives one. For example, knee-to-wall at about 10 cm.
   - Deficit = the larger of:
     - the raw-value deficit, measured on the weaker side
     - the symmetry shortfall: (90% − weaker/stronger), divided by 90%, clamped to 0–1. If raw is lower-better, use stronger/weaker.
   - The weaker side is the worse one by `raw_direction`.
   - Tests that are only higher/lower are unchanged.
2. **Continuing ("Stay") skips the baseline:**
   - The retest becomes the new sprint's baseline (copied into its baseline assessment), and the sprint starts `active` with slot state carried over.
   - Coming back to a pain point through the normal picker also carries state over, with the §5.2 missed-day rule applied once per week of gap, up to 3 steps back.
   - After 28+ days away, a fresh baseline is required. Slot state still carries over, stepped back.
   - This needs a new RPC alongside `switch_sprint`.
3. **Missing feedback means hold:**
   - If effort or pain wasn't answered, every slot done that day holds.
   - The pain picker has no preselected value; "0" is one tap.
   - Logs alone never step a slot up.
4. **The AI never blocks a day:**
   - The pain flag is detected when the workout is finished, and the Claude adjust call runs right then in the background. Its result is applied to the next day before that day is built.
   - If the call hasn't returned or has failed by the time the next day is built, the rules fallback applies.
   - The sprint-start summary is filled in after activation. The sprint screen shows the rules-template summary until it arrives.
5. **Swaps and tier refits stay within the slot's current level:**
   - Swaps choose among same-level alternates.
   - An explicit "easier version" option steps the slot down one step, and that counts as a step back in its state.
   - A tier refit picks a same-level alternate the tier allows. If there isn't one, it drops to the nearest lower level that has one.
   - Swapped exercises feed the 80% check and the "right" streak like any other exercise.
6. **Pain areas** are authored content:
   - Each slot gets an `area` key from `lib/bodyParts.ts` (e.g. `ankle`, `hip`, `neck`).
   - The "where?" chips show the distinct areas of the current pain point's slots, plus "Other".
   - A slot matches when its `area` equals the chosen chip.

## 9. Evidence behind the rules
- **Impairment-based progressive rehab:** a 4-week trial in chronic ankle instability improved function, and its authors recommend the model ([J Athl Train](https://nata.kglmeridian.com/downloadpdf/view/journals/attr/51/3/article-p233.pdf)). Matching exercise type to the dominant deficit: [J Foot Ankle Res 2026](https://link.springer.com/article/10.1186/s13102-025-01404-y). Exact dosage has no consensus, so the numbers here are clinical defaults.
- **Pain-monitoring model:**
  - 0–2 safe, 3–5 acceptable if it settles by the next morning, above 5 back off.
  - Pain must not rise week to week ([JOSPT FITE-OA](https://www.scribd.com/document/718543943/jospt-2016-6908-1); [Scand J Pain](https://www.degruyterbrill.com/document/doi/10.1515/sjpain-2024-0072/html)).
- **Weaker-side double volume reduced hop asymmetry** ([IJSPP](https://mdx-repository.prod-uk.cayuse.com/download/45bc5f3c13d0fbc763d5ebaab5d668927fd20d577412a78421eba388f7d9c10e/1404302/Manuscript%20%28IJSPP%29.pdf)). The 90% symmetry target is a convention, not a validated safety line ([summary](https://www.physiotutors.com/fi/research/safe-rts-following-acl-reconstruction/)).
- **Stretching plateaus** at about 4 min per muscle group per session and about 10 min per week ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).
- **Measurement noise:** knee-to-wall minimal detectable change is about 1.4–1.9 cm ([Physiopedia](https://www.physio-pedia.com/Weight-bearing_Lunge_Test); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3362988)).
- **14-day timescale:** early gains are mostly neural, and tissue change takes 6+ weeks. That's why continuing sprints carry their state forward instead of resetting.
