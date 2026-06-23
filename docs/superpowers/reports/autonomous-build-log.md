# Autonomous build log

## 2026-06-22 -- Mobile app bootstrap

**What shipped:** The first version of the Bulletproof mobile app exists and is in Apple's hands. This phase built the iPhone app shell (Expo/React Native), wired it to the same Supabase database the rest of the system uses, and added "Sign in with Apple" as the login method. Database access rules were tightened so the phone app can only read/write data a logged-in user is allowed to see. The build was packaged and submitted to TestFlight (Apple's beta-testing platform).

**Caught and fixed before it shipped:** Build #1 was missing a required Apple configuration flag for Sign-In with Apple. It wouldn't have errored -- the app would have built and installed fine, but tapping "Sign in with Apple" on a real phone would have silently failed. Caught in review before touching a device, and fixed. Separately, the first TestFlight submission was rejected for a duplicate build number; that's now set to auto-increment. Build #2, with both fixes, is the one currently with Apple.

**Still outstanding (the one open item):** proof that tap-to-sign-in actually works on a real phone hasn't happened yet. That needs two things outside this phase's control: Apple's processing email confirming build #2 is ready to test, and Sohan installing it via TestFlight and tapping sign-in himself. Until then, the entitlement fix is "should work," not "confirmed working."

**Also deferred (not blockers):** the production submit profile is still unconfigured (only preview/TestFlight is set up), and the Supabase client doesn't yet give a friendly error if environment variables are missing.

**Next up:** once sign-in is confirmed on-device, the backlog moves to Phase 3 -- turning the tuned scoring engine into the app's real recommendation logic.
