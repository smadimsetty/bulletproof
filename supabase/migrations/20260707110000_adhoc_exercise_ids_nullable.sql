-- The active-session banner (components/ActiveSessionBanner.tsx) needs to
-- tell an ad-hoc session (resumable at /logger/adhoc/[sessionId]) apart
-- from a block-based one (no dedicated resume route -- see
-- docs/superpowers/specs/2026-06-24-logger-design.md Decision 7) so it can
-- route a tap correctly. ad_hoc_exercise_ids' `not null default '{}'::uuid[]`
-- from 20260707100000 makes every session row -- block-based or ad-hoc --
-- read back as an empty array, so the column can't be used as that
-- discriminator as-is. Dropping the default/not-null lets a plain
-- startSession() insert (block-based; the column untouched) leave it NULL,
-- while the ad-hoc flow explicitly writes '{}' at creation -- making
-- "column is null" a reliable is-this-ad-hoc check going forward. Existing
-- open sessions from before this migration keep whatever '{}' the old
-- default already wrote; see the sessionLifecycle.ts isAdhoc comment for
-- why that one-time transitional inaccuracy is acceptable.
alter table sessions alter column ad_hoc_exercise_ids drop not null;
alter table sessions alter column ad_hoc_exercise_ids drop default;
