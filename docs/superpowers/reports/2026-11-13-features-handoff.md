# 2026-11-13 features handoff

**Status: confirmed working on Sohan's phone in build 30 (2026-11-13). Build 29 crashed at launch because of Expo's prebuilt expo-contacts; build 30 fixes it.**

Four features shipped in order: the dead hang timer, the paid plan (with the AI coach cap), the History + Progress merge, and finding friends from contacts. All of them are on master, pushed, with migrations live.

## What only Sohan can do

1. **Sign the Paid Applications agreement in App Store Connect and add bank and tax details** (Business > Agreements). This is required before the subscriptions can load, even in TestFlight. The two products currently show "Missing metadata". After signing, open each product (App Store Connect > MoveMaxx > Subscriptions > MoveMaxx Premium). The page names anything still missing.
2. **Create a Twilio account for the SMS codes**, then turn on phone auth in Supabase (Authentication > Sign In / Providers > Phone) with provider **Twilio Verify**: Account SID, Auth Token, and a Verify Service SID. It costs about 5¢ per verification and needs no carrier (10DLC) registration. Until this is done, "Text me a code" says text messages aren't switched on yet. I can set Supabase up through the API once the credentials are in `.env`.
3. **At public launch**, run in the SQL editor: `update app_config set value = to_jsonb(now()) where key = 'founder_cutoff';` Everyone who signed up before then keeps premium for life; later sign-ups get the trial and the paywall. A tester who joins later gets premium for life with: `insert into premium_grants (owner_id, reason) values ('<their user id>', 'beta tester');`
4. Later, the decisions held for after these features: `ANTHROPIC_API_KEY`, Terms and Privacy updates for payments and contacts, and the App Store listing.

## What to test on the phone

**Dead hang timer** (Training tab, "Dead hang timer" card):
- [ ] The 3-2-1 countdown ticks with haptics and beeps at "go".
- [ ] Free hang counts up; "Let go" saves it and a toast shows "+42s · today …".
- [ ] Intervals (try 15s) count down, beep at the end and save themselves.
- [ ] Today's total stacks across hangs; the best hang and the 7-day bars update; × deletes a hang.
- [ ] The screen doesn't lock during a long hang.

**Paid plan** (you're a founder, so the gate never shows for you):
- [ ] Settings > Membership reads "Founder: free for life".
- [ ] Settings > "Preview the paywall" opens the paywall. Once the agreement is signed, prices show as $10.00/year and $2.00/month, "Start 2-week free trial" works with a sandbox account, and Restore works.

**Progress tab** (History is gone):
- [ ] Each assessment area is a collapsed row with its icon; tapping opens its charts.
- [ ] Workouts shows week/month/total; it opens into months, the newest open first; "Show older workouts" pages.

**Find friends** (Feed > Find people, with the search box empty):
- [ ] "Check my contacts" asks for permission, then lists friends or "None of your contacts are here yet".
- [ ] "Add your phone number" works once Twilio is set up; Settings > Privacy then shows the number and the "Friends can find me by phone" switch.

## Calls I made

- **Our own receipt check instead of RevenueCat.** It verifies Apple's signed transactions directly, so no third-party account is needed. The trade-off: renewals and refunds reach the server when the app next opens, not instantly. App Store Server Notifications are in the backlog for before launch.
- **Prices are exactly $2.00 and $10.00**, not $1.99 and $9.99, and the US is the only territory for now.
- **Founders are everyone who signs up before launch**, controlled by one setting, rather than a list of names to maintain.
- **The paywall fails open:** if the status can't load (offline), the app lets you in rather than locking out someone who may be paying.
- **The paywall review screenshot is a rendered mock** of the real screen. Replace it with a device screenshot before App Store review.
- **expo-iap is pinned to 6.4.0** (Oct 30). 6.4.4 came out the day before this build, which is too fresh to trust for payments.
