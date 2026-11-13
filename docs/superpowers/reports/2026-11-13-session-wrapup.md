# Session wrap-up, 2026-11-13: pick up from here

A long session. Everything below is committed to `master` and pushed, every migration is live on Supabase, and **TestFlight build 30 (1.4.0) is confirmed working on Sohan's phone ("everything works and it's all as intended")**.

## What got done today, in order

1. **Adaptive sprint engine finished** (v1.4.0, build 25). Days are built lazily, with a progression ladder, weaker side first, effort and pain feedback, and a noise-aware retest. See `2026-11-12-adaptive-engine-handoff.md`.
2. **Email sign-in works.** Gmail SMTP sends 6-digit codes from "MoveMaxx" (`GMAIL_APP_PASSWORD` in `.env`).
3. **External TestFlight beta.** Group "Beta", public link https://testflight.apple.com/join/c5VvAccF. Build 25 was submitted for Beta App Review and was still waiting when the session ended.
4. **Ops.**
   - A weekly Supabase usage email goes out Mondays at 8 AM ET (`.github/workflows/usage-report.yml`).
   - Sohan's sprint day 6 was reset so the new engine built it.
   - Sohan was already a moderator.
5. **Six quick UI fixes** (build 26/27).
   - The tab is now "Training", and the Recent list is gone from it.
   - Exercise names lost their "Ankle:" style prefixes, and the library dedupes duplicates.
   - "Why today" now names the assessment test.
   - Empty-state buttons are centred.
   - Sprint icons were redrawn as posture pictograms (round 2, approved).
6. **Dead hang timer** (Training tab). Free or interval hangs after a 3-2-1 countdown, stacking into a daily total, with best hang and a 7-day chart.
7. **Paid plan.**
   - $2.00/month or $10.00/year with a 2-week free trial.
   - Beta testers are founders with premium for life.
   - Our own receipt verification (no RevenueCat).
   - The AI coach is capped at 4 calls per user per day and is premium only.
8. **History merged into Progress**, with drop-downs for assessments per area and for workouts per month.
9. **Find friends from contacts**, with SMS-verified phone numbers and a privacy switch.
10. **Build 29 crashed at launch**, fixed in build 30. Expo's prebuilt expo-contacts links Apple's Testing.framework (expo/expo#50101). The fix is `buildFromSource: ["expo-contacts"]`, and every new build's `.ipa` is now scanned for that link before submitting.

## Decisions Sohan made (keep these)

- **Pricing:** $2/month, $10/year, deliberately cheap to start; it can rise later. The model stays Haiku 5.5, the cheapest.
- **Eventually no free users:** a 2-week free trial (Apple introductory offer), then pay.
- **Beta testers (friends and family) get premium for life.**
- **AI cap:** at most 4 coach calls per user per day. The worst-case budget is $0.20/day ($6/month); the real cost is about $0.15/month for a heavy user.
- **Contact sync uses SMS-verified phone numbers** (Twilio Verify, about 5¢ per verification).
- **Tab order:** Training stays on the left. History lives inside Progress.
- **Sprint icons:** the round-2 posture pictograms.

## Waiting on Sohan (nothing else is blocked)

| # | What | Why it matters | How |
|---|------|----------------|-----|
| 1 | **Paid Applications agreement + bank + tax** in App Store Connect | Subscriptions can't load (products show "Missing metadata"; the paywall says plans aren't available) | App Store Connect → Business → Agreements |
| 2 | **Twilio account** (Account SID, Auth Token, a Verify Service SID) | "Text me a code" doesn't send yet; nobody is findable by phone until it does | Put the three values in `.env`; Claude then switches on Supabase phone auth (provider: Twilio Verify) through the API |
| 3 | **`ANTHROPIC_API_KEY` decision** | Every coach call currently falls back to rules (the cap is already enforced) | Add it as a Supabase Edge Function secret |
| 4 | **Beta App Review for build 25** | Outside testers can't join through the public link until it clears; builds 27-30 then need submitting too (one build per version can be in review at a time) | Wait for Apple; then Claude submits the latest build |
| 5 | **Review content numbers marked DEFAULT** | Adaptive engine content defaults | `docs/superpowers/content/2026-11-12-engine/` |

## Before public launch (agreed to do after the features, in roughly this order)

1. **Terms of Use + Privacy Policy updates** for subscriptions, contacts/phone numbers and AI. These are the legal pages in `apps/web`; the App Store privacy labels must match them.
2. **App Store Server Notifications** endpoint, so renewals and refunds update instantly instead of on the next app open (backlog).
3. **Real paywall screenshot** to replace the rendered mock attached to both subscription products in App Store Connect.
4. **More territories** for the subscriptions (currently US only), if launching outside the US.
5. **App Store listing:** screenshots, description, privacy labels, age rating.
6. **Sign in with Apple revocation key** (required for account deletion) and the remaining launch blockers in CLAUDE.md.
7. **On launch day, one SQL line:** `update app_config set value = to_jsonb(now()) where key = 'founder_cutoff';` Without it, every new sign-up stays free forever.
8. Consider: a rate limit on `find_contacts`, and moving email from Gmail to Resend once there's a domain (Gmail caps at about 500 a day).

## Feature ideas mentioned but not started

- Changes to the Feed beyond centring "Find people" (nothing specific asked yet).
- Inviting contacts who aren't on MoveMaxx yet (share the TestFlight / App Store link).

## Key IDs and where things live

- **App Store Connect:**
  - app 6783128365
  - beta group `944164ba-d432-4a55-9ae7-a81d20f3afc5`
  - subscription group 22576807
  - products: monthly 6834527623 (`com.sohan.bulletproof.premium.monthly`), yearly 6834527798 (`com.sohan.bulletproof.premium.yearly`)
- **ASC API:** an ES256 JWT with key `72FC5AHX2C` (`apps/mobile/secrets/AuthKey_72FC5AHX2C.p8`), issuer `f69c055c-d862-48c8-8fa5-abf6d94743ee`. In Git Bash, set `MSYS_NO_PATHCONV=1` first. Each new build needs: add it to the beta group, PATCH the build's existing `betaBuildLocalizations` "whatsNew" (it already exists, so POST returns 409), and submit beta review for the first build of a new version.
- **Shipping a build:**
  1. `eas build --platform ios --profile production`
  2. Download the `.ipa` and grep the frameworks for `Testing.framework/Testing`.
  3. `eas submit --platform ios --profile preview --id <build>`
- **Live test suites** (run with `.env` loaded): `supabase/tests/rls_smoke_workouts.py` (88), `rls_smoke_social.py` (73), `embed_smoke.py` (11), `premium_smoke.py` (15), `contacts_smoke.py` (9). Jest: 526.
- **Today's handoffs:** `2026-11-13-features-handoff.md` (the four features, test checklist), `2026-11-12-adaptive-engine-handoff.md` (engine).
- **Backlog:** `docs/BACKLOG.md`.

## Suggested first step next session

Ask Sohan whether items 1 and 2 above are done. If they are, finish wiring Twilio Verify into Supabase and test a real sandbox subscription purchase end to end. Then start the pre-launch list at "Terms of Use + Privacy Policy".
