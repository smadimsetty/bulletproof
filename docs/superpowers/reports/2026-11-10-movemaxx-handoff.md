# Handoff (2026-11-10): MoveMaxx, v1.3.0

## Install it first
Open **TestFlight**. The app now shows as **MoveMaxx**; install **1.3.0 (24)**. Uploaded 2026-11-10 (EAS build `630bd44c-f7de-4835-b132-f34b9084a804`); Apple takes about 10 min to process it. It's the same app record as before, so your data, sign-in and TestFlight history carry over.

## The rename
**Now called MoveMaxx:**
- the app name on your home screen, the sign-in wordmark and the share card
- timer notifications and the Apple Health permission text
- the website, at https://smadimsetty.github.io/movemaxx/
- the GitHub repo (`smadimsetty/movemaxx`; old links redirect)

**Still says "bulletproof" behind the scenes, on purpose:**
- the bundle ID `com.sohan.bulletproof` and the App Store Connect record. A new bundle ID would mean a brand-new App Store app and you'd lose TestFlight history and testers.
- the Sign in with Apple service ID, the EAS project and the Supabase project
- a few on-device storage keys
- your local folder `c:\Dev\Bulletproof`. Rename it yourself whenever you like; nothing depends on it.

None of these are ever shown to users.

**The App Store listing name** is set in App Store Connect and can't be changed from code. When you create the listing, call it MoveMaxx.

## Website
- **`/`** is now a MoveMaxx landing page: dark, volt lime, the 7 sprints and the test/train/retest loop. It's ready to use as the App Store "Marketing URL".
- **`/privacy`, `/terms`, `/support`** are live, and the app's Settings links now point at them; before, they pointed at a placeholder. Use these URLs in App Store Connect too.
- **`/dashboard`** is where the old Oura recommendation dashboard moved.
- **Fixed:** the support page's link to the privacy policy would have 404'd on the live site.

## Logger leftovers (all fixed)
- **Swipe-delete right after tapping ✓** now deletes. Before, the row sprang back with no explanation.
- **Change focus → Start a new sprint** is now all-or-nothing. If starting the new sprint fails, your old sprint stays.
- **Changing your equipment tier now updates your running sprint.** It swaps any upcoming, not-done exercise your new tier rules out for one that fits, and tells you how many it changed. Today stays as is if you've already started its routine.
  - This also means the one-time equipment sheet now updates your current sprint, which was built before tiers existed.
- **Nordic hamstring curl** (needs a bench or partner) is now Intermediate, not Basic. Every sprint slot still has a bodyweight option (checked against the live database).
- **No late beep.** If the phone was locked when a timer ended, the notification sounds on time and the app no longer beeps again when you come back.

## On-device checklist (about 5 min)
1. The home-screen name says **MoveMaxx**. Sign in still works with Apple.
2. **Settings → Terms / Privacy / Support** open the real pages.
3. **Settings → Equipment:** switch to Basic. If your sprint has gym exercises coming up, you should see "Updated N exercises…". Then check an upcoming day.
4. Swipe-delete a set immediately after ticking it. It should disappear.
5. Start a 30 s hold, lock the phone, and wait for the notification. When you unlock, there should be no second beep.

## Still open, needs you
- **Support email:** the legal pages still say `support@example.com`. Tell me the address you want and I'll swap it in. A free address on your future domain is ideal.
- **Domain:** once you register one (movemaxx.app / .com?), I'll point the site at it.
- Not touched, per "later this week":
  - progressions
  - your own or AI-generated demo videos
  - rethinking the original 4 sprints' tests
  - beta testers
- **Remaining launch blockers:** SMTP plus email templates, the Apple key secrets, Supabase Pro, and the App Store listing.
- **Content note:** one exercise can still appear in several slots across a sprint (never twice on the same day).
