# Autonomous build pipeline — procedure reference

This is the mechanical reference for the autonomous pipeline described in
`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`.
The orchestrating session (whoever is executing
`2026-06-22-autonomous-build-pipeline.md`) reads this file at the start of
every phase and follows it exactly. It exists as a standalone file (not
just inline in the plan) so it survives a context compaction mid-run.

## Per-phase mechanics

### 1. Create the worktree

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-<phase-slug> -b pipeline/<phase-slug> master
```

`<phase-slug>` is a short kebab-case name (e.g. `engine-productionization`,
`healthkit-sync`). All Developer/Tester/Critic dispatches for this phase do
their work inside `c:\Dev\Bulletproof-<phase-slug>` — pass that absolute
path explicitly in every dispatch prompt. The main checkout at
`c:\Dev\Bulletproof` stays on `master` the entire time; never `git checkout`
inside it mid-phase.

### 2. Planner dispatch (only if the phase has no spec/plan yet)

**Token-optimization note (extended during Phase 7/Trends, 2026-06-25):**
the same logic from the per-task-loop note below applies here. An
attached/interactive orchestrator that will also implement the phase
itself doesn't need a separate Planner subagent producing a giant
implementation plan with verbatim code in every step — that level of
detail exists to let a *different*, context-free Developer agent execute
without re-deriving the design. When the orchestrator is both planner and
implementer, write a short decisions note directly instead (just the
non-obvious calls — library choices, ambiguous-spec resolutions, data-
shape decisions — not a restatement of the design spec, and no verbatim
code) and track the task breakdown in the orchestrator's own todo list.
Phase 7 did this with a single ~90-line decisions doc instead of a
multi-thousand-line plan. Fall back to a full Planner dispatch only when
a detached/unattended run will hand the plan to separate Developer
subagents.

Dispatch via the Agent tool, `subagent_type: "general-purpose"` (**not**
`"Plan"` -- the `Plan` subagent type is read-only by design, with no
Write/Edit/Bash-write access, so it cannot actually create or commit the
spec/plan files it produces. Discovered the hard way on the engine
productionization phase: the Plan dispatch did the design thinking
correctly but could only hand back file content as text for the
orchestrator to write itself. Use `general-purpose` so the same agent can
write and commit directly), with this prompt (fill in the bracketed
parts):

```
You are the Planning agent for the Bulletproof project's autonomous build
pipeline, working in the worktree at [worktree absolute path] on branch
pipeline/[phase-slug].

Read CLAUDE.md at the repo root for full project context. Read
docs/superpowers/specs/2026-06-22-mobile-interface-design.md and
docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md.

This phase's goal: [phase-specific goal, copied from the phase's Task
description in 2026-06-22-autonomous-build-pipeline.md].

Your job:
1. Write a design spec to
   docs/superpowers/specs/2026-06-22-[phase-slug]-design.md, following the
   structure of the existing specs in that directory (Background, Goals,
   Non-goals, Decisions/Approach, out of scope). You will NOT get to ask
   the user clarifying questions -- make the most reasonable decision
   yourself for anything ambiguous, and document the assumption explicitly
   in a "Decisions" section instead of leaving it open.
2. Write an implementation plan to
   docs/superpowers/plans/2026-06-22-[phase-slug].md following the
   superpowers:writing-plans format exactly (header, Global Constraints,
   Task N sections with Files/Interfaces/Steps, complete code in every
   code step, no placeholders, TDD steps).
3. Commit both files in this worktree.
4. Reply with the two file paths, the number of tasks in the plan, and a
   one-paragraph summary of the key decisions you made.
```

### 3. Per-task loop (Developer → Tester → Critic → revise)

**Token-optimization note (added during Phase 6 resumption, 2026-06-25):**
the dispatch pattern below was designed for a fully detached/unattended
run, where each subagent spawn pays the cost of re-deriving context the
orchestrator doesn't otherwise have. When the orchestrating session is
itself attached and interactive (i.e. it already holds full context on the
codebase, the plan, and CLAUDE.md from the conversation so far — the normal
case for a resumed/interactive run like this one), spawning fresh
Developer/Tester/Critic subagents per task just pays that re-derivation
cost three times per task for no benefit. In that case, **skip subagent
dispatch for individual tasks entirely**: the orchestrator implements each
task directly (same TDD discipline — failing test first, minimal
implementation, full suite + `tsc` run, commit) and self-verifies as the
Tester/Critic steps describe (independently re-run the suite, manually
exercise the behavior, check at least one edge case, check against
CLAUDE.md conventions) before committing. Reserve actual subagent dispatch
for the one part of this procedure that genuinely benefits from a fresh,
independent set of eyes: the whole-branch Critic pass (step 5), still
dispatched once per phase, not once per task. The Reporter (step 7) does
not need independence — it's a synthesis of what the orchestrator already
knows firsthand, so an attached orchestrator should write the build-log
entry directly rather than paying to have a fresh agent reconstruct the
phase's history from commits/progress notes. This cuts subagent dispatches
for an N-task phase from up to `3N` (worst case with revision rounds) down
to 1 total. Fall back to the full per-task dispatch loop below only for a
genuinely detached/unattended run where no orchestrator session holds
context between tasks.

For each task in the active plan (the existing mobile bootstrap plan for
Phase 1, or the Planner's freshly written plan for Phases 2-6), track a
`round` counter starting at 1.

**Developer dispatch** (`subagent_type: "general-purpose"`):

```
You are the Developer agent for Task [N] of [plan file path], working in
the worktree at [worktree absolute path] on branch pipeline/[phase-slug].
This is revision round [round] of 3.

Read the full text of Task [N] in that plan file. Read CLAUDE.md and any
files that task's Interfaces section references.

[if round > 1: "Previous round's Tester/Critic feedback to address:
<feedback text>"]

Implement exactly this task, following its steps. Use TDD: write the
failing test first, run it to confirm it fails, implement the minimal
change to pass, run it again to confirm it passes. Follow this repo's
existing conventions (small focused files, no speculative abstraction, no
unrequested refactoring). Run the project's full existing test suite for
the area you touched, not just your new test, to confirm nothing else
broke.

You will not get to ask the user questions. If you hit a genuine ambiguity
the task doesn't resolve, make the most reasonable call yourself and state
it as one sentence in your reply.

Commit your work in the worktree with a descriptive message. Reply with:
the files you changed, the exact test command you ran and its output, and
any assumption you documented.
```

**Tester dispatch** (`subagent_type: "general-purpose"`):

```
You are the Testing agent reviewing the Developer's work on Task [N] of
[plan file path], in the worktree at [worktree absolute path] on branch
pipeline/[phase-slug].

Do not trust the Developer's self-report. Independently:
1. Run the full relevant test suite yourself from a clean state.
2. Read Task [N]'s stated deliverable and manually verify the actual
   behavior works -- not just "tests pass." If it's a function/module,
   call it directly with real inputs. If it's a script, run it. If it's a
   data pipeline, inspect the actual output rows.
3. Try at least one edge case or failure path the Developer's own tests
   might not cover.

Reply with exactly "PASS" or "FAIL: <reason>". If FAIL, be specific enough
that a Developer agent with no other context than your reply could fix it
-- exact command, exact output, exact expected-vs-actual.
```

If Tester replies FAIL and `round < 3`: increment round, re-dispatch
Developer with the Tester's feedback folded in, repeat. If `round == 3` and
still FAIL: see "Skip mechanics" below.

**Critic dispatch, per-task** (`subagent_type: "general-purpose"`, only
runs after Tester PASSes):

```
You are the Critique agent reviewing Task [N] of [plan file path] on
branch pipeline/[phase-slug], in the worktree at [worktree absolute path],
after Testing has PASSed it.

Run: git -C [worktree absolute path] diff [base-commit-sha-before-this-task]
to see this task's diff only. Check:
- Does this match CLAUDE.md's conventions (no over-engineering, compound
  evidence-based framing where relevant to product behavior, small focused
  files, DRY)?
- Any obvious simplification, duplication, or dead code?
- Anything a careful human reviewer would flag on naming/clarity?

Reply with exactly "PASS" or a specific list of requested changes (file +
line + what to change).
```

If Critic requests changes and `round < 3`: increment round, re-dispatch
Developer with the Critic's feedback folded in (same as a Tester FAIL),
repeat. If `round == 3` and still not PASS: see "Skip mechanics" below.

### 4. Skip mechanics (3 rounds exhausted)

```bash
git -C ../bulletproof-<phase-slug> checkout -- .
git -C ../bulletproof-<phase-slug> clean -fd
```

This discards the failing task's uncommitted changes, returning the
worktree to the last good commit (the previous task's). The branch never
contains a task that didn't pass. Record in this phase's running notes
(append to `.superpowers/sdd/<phase-slug>-progress.md`, creating it if
needed, matching the existing `progress.md` style from Phase 0/1 and Phase
2): which task number was skipped, the final Tester/Critic feedback, and
that it was abandoned after 3 rounds. Move to the next task in the plan.

### 5. Whole-branch Critic pass (after all tasks attempted)

```
You are the Critique agent doing the final whole-branch review for
[phase name] on branch pipeline/[phase-slug], in the worktree at
[worktree absolute path], before it merges to master.

Run: git -C [worktree absolute path] diff master...pipeline/[phase-slug]
Read .superpowers/sdd/progress.md for the format/tone of prior final
reviews (Phase 0/1 and Phase 2 both went through this same step) and match
it.

Check: overall coherence across tasks, anything inconsistent between tasks
done at different times, security issues (especially RLS policies, secrets,
API keys -- this is a public repo), and anything per-task review might have
missed because it only ever saw one task's diff at a time.

Reply with "Ready to merge", or "Ready to merge with fixes" (listing them
as a numbered list), or specific blocking issues. Write your findings to
.superpowers/sdd/<phase-slug>-final-review.md.
```

If "Ready to merge with fixes": dispatch one more Developer round to apply
the listed fixes directly (no need for a fresh Tester/Critic pass on a pure
fix-up — re-run the existing test suite yourself as the orchestrator to
confirm nothing broke, then proceed to merge). If blocking issues that
fixes can't resolve in one round: merge anyway per the "skip and continue,
never block" rule from the spec, but make sure the Reporter (step 7) calls
this out prominently rather than burying it.

### 6. Merge

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/<phase-slug> -m "merge: <phase name>"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-<phase-slug>
```

The main checkout was never switched off `master`, so this is a plain
fast-merge-in-place. This is the point where the user's working directory
content actually changes (new files/code appear) — expected, since
push/merge to master was explicitly approved to run with no checkpoint.

### 7. Reporter dispatch (`subagent_type: "general-purpose"`)

```
You are the Reporting agent for [phase name], which just [merged to
master / merged to master with N tasks skipped].

Read .superpowers/sdd/progress.md, .superpowers/sdd/<phase-slug>-progress.md
(if it exists), and .superpowers/sdd/<phase-slug>-final-review.md for this
phase's full history.

Write a plain-language summary for Sohan -- he's a data analyst, not
necessarily reading every commit, so describe what got built in terms of
what it does for him, not implementation details. Cover: what shipped,
what was skipped or is still broken and why, what's next in the backlog.

Append this as a new dated section (## YYYY-MM-DD — <phase name>) to
docs/superpowers/reports/autonomous-build-log.md (create the file with a
top-level "# Autonomous build log" heading first if it doesn't exist yet).
Keep it under 300 words. Commit the file.
```

After this dispatch returns, post its summary to the user in chat as well
— don't make them go read the file to find out what happened.

## Money-spend gate

If at any point a step would trigger a charge (starting a paid EAS build
beyond the free tier, changing a Supabase plan, enrolling in any other paid
service), stop everything and ask the user before proceeding. This is the
one and only pause point in the entire pipeline.
