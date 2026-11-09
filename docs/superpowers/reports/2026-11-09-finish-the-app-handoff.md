# Session handoff: finish the app (2026-11-08 → 09)

Spec: `docs/superpowers/specs/2026-11-08-finish-the-app-design.md`.
Visual spec: `docs/superpowers/specs/2026-11-08-visual-design.md`.
Plans: `docs/superpowers/plans/2026-11-08-stage{0..4}-*.md`.

## 1. What shipped

| Stage | What | Live checks |
|---|---|---|
| 0 Fixes | Hinted every `exercises` embed (the PGRST201 error came from old build 20); retries that really retry; eye-icon descriptions; prefilled assessments; "Last assessment" peek (sprint + logger); logger fixes (rest bar, un-tick race, per-exercise ROM unit, faster start, discard reverts sprint day, keyset history) | embed smoke |
| 1 Progress | Progress tab (streak + calendar, assessment trends, PRs, monthly recap + share card), PR toasts, PRs on summary, exercise detail, `user_settings` table | RLS smoke |
| 2 Routines | Folders, routines, start/save/update-from-workout, mobility-only library, custom exercises (private to owner) | 47-check RLS smoke |
| 3 Social + accounts | Email code sign-in, onboarding, profiles, follows, feed, likes, comments, photo posts, copy workout, inbox, push, report/block/hide, moderation (auto-hide at 3 reporters), new Settings, account deletion, Apple Health write, legal pages | 73-check social smoke, live delete-account test |
| 4 Redesign | Dark theme with a volt-lime accent, component library, every screen restyled, full-screen logger with minimise, app icon + splash, iPhone-only | offline bundle export |

## 2. Needs Sohan (blocking a public launch, not the TestFlight build)

1. **Custom SMTP** (e.g. Resend with a domain you own): set it in Supabase → Auth → SMTP. Then set both email templates (Magic Link and Confirm signup) to show `{{ .Token }}`. Supabase's free tier refuses template edits without custom SMTP, and the built-in sender only emails project team members. **Until then, email sign-in doesn't work; Sign in with Apple does.** Code length (6) and expiry (10 min) are already set.
2. **Sign in with Apple key** for token revocation (App Store 5.1.1(v)). In Apple Developer → Keys, create a key with Sign in with Apple enabled, then set these Edge Function secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the .p8 contents), `APPLE_CLIENT_ID=com.sohan.bulletproof`. Until then `apple-token-exchange` skips quietly. Apple sign-ins made before the key exists can't be revoked later; that's acceptable for the TestFlight phase.
3. **Supabase Pro** before public launch: free projects pause after about a week idle, and Storage is capped at 1 GB.
4. **Web hosting for legal pages**: deploy `apps/web` (privacy, terms, support), then set `WEB_BASE_URL` in `apps/mobile/lib/links.ts` and replace the `support@example.com` placeholders (`TODO(Sohan)`).
5. **App Store Connect listing**: screenshots, description, age rating (likely 12+ for user-generated content), privacy nutrition label (account info, photos, fitness data, user content, identifiers for push), and a demo account for App Review (needs email sign-in working, see 1).
6. **Make yourself moderator** after onboarding on device: `update profiles set is_moderator = true where id = '89ac801b-5515-4388-80a7-03662030c487';`
7. **The dormant engine's daily GitHub Actions cron** still runs. Decide whether to disable it.

## 3. Moderation runbook

- Each new report sends a push to moderators (`profiles.is_moderator`) and appears in their inbox. Moderators can open hidden or private reported workouts.
- Review in the Supabase dashboard: `select * from content_reports where status = 'open' order by created_at;`
- Act on a report: to hide content, `update workouts set hidden_by_moderation = true where id = …` (or `workout_comments`). To restore it, set the flag to false. Close a report with `update content_reports set status = 'actioned' | 'dismissed' where id = …`. To remove an abusive user, delete their account from Auth → Users. Tables that don't cascade need the delete-account function's order; it's easiest to run that function's table list as SQL first.
- Content reported by 3 distinct users is hidden automatically until a moderator clears it.

## 4. On-device checklist (TestFlight build)

**Accounts**
1. Sign in with Apple, then onboarding: handle availability, photo, units, goal, terms checkbox.
2. Sign out and back in. You should not be asked to onboard again.

**Logger**
3. Start an empty workout. The logger opens full screen; minimise it, check the banner, and tap the banner to reopen the same workout.
4. One-sided hold: left, then switch sides, then right, then the rest bar.
5. Tap ✓ during a hold; the set should complete once.
6. Beat an earlier hold and check for the PR toast with a trophy.
7. The keyboard doesn't cover the bottom sets.
8. Finish: visibility (sprint = Private), 1–2 photos, the summary hero, then back to the tabs.
9. Live Activity shows on the lock screen and is removed after saving.

**Sprint**
10. Assessment opens prefilled from your last ankle numbers, and "Clear all" works.
11. "Last assessment" sheet, from the sprint day and from the logger.
12. Eye icon toggles descriptions on the assessment, sprint day and logger cards.

**Progress**
13. Streak, calendar months, assessment trend charts, PRs list, monthly recap, and Share (check the image isn't blank; capture is from an offscreen view).

**Routines and library**
14. Create a folder and a routine, start it, change the set count, finish, and accept the "Update routine?" prompt.
15. Library search and filters (only mobility exercises plus your own), create a custom exercise, and add it from the picker.

**Social** (needs a second account; use a friend's phone or a second Apple ID)
16. Follow request and approve, then the friend sees your followers-only workout and photos.
17. Likes, comments, the inbox badge, and push notifications (tap one, also from a cold start).
18. Copy a friend's workout: start now, then save as a routine.
19. Report, block (both sides lose everything), hide from feed.

**Settings**
20. Units, weekly goal, default visibility, public profile switch, notification toggles.
21. Apple Health: denying permission should leave the switch off.
22. Delete account (on a test account!). It signs you out and everything is gone.

## 5. Known gaps (deliberate, from the redesign's `TODO(stage4)` notes)

- **Logger:** no rename-title tap, single-pick exercise picker, no auto-scroll to the next set.
- **Calendar:** you can't tap a day yet.
- **Feed:** no PR or visibility chips.
- **People search:** no follow button on result rows.
- **Profiles:** no share button.

All are listed in the stage 4 commits; none blocks the build.
