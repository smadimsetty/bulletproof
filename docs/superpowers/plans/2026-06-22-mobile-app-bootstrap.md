# Mobile App Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working, TestFlight-distributed Expo (React Native) app
with no features yet beyond Apple Sign-In and a verified, RLS-secured
connection to the existing Supabase project — the skeleton that every later
mobile feature (HealthKit sync, recommendation UI) builds on.

**Architecture:** A new `apps/mobile/` Expo project (TypeScript, managed
workflow) talks to the existing Supabase project via `@supabase/supabase-js`,
authenticating with Sign In with Apple. Cloud builds via EAS mean no Mac or
Xcode is ever used locally; the resulting build is installed on the phone
through TestFlight.

**Tech Stack:** Expo SDK (TypeScript), `@supabase/supabase-js`,
`expo-apple-authentication`, EAS Build/Submit, Supabase Auth (Apple
provider), Supabase Postgres RLS.

## Global Constraints

- No local Xcode/Mac use for development or building — all native iOS builds
  happen via EAS's cloud build service.
- This repo is public (per `prototyping/weight-tuning/README.md`) — never
  commit real secrets, tokens, or keys. The Supabase anon key is safe to ship
  in the app bundle (anon-level access only); the service-role key must
  never appear in `apps/mobile/`.
- RLS policies added in this plan are intentionally single-user (`using
  (true)` for the `authenticated` role, no per-row ownership column) per the
  existing "design for multi-user later, don't build it yet" principle in
  `CLAUDE.md`.
- Apple Developer Program enrollment ($99/yr) is required and the user has
  already agreed to it (see `docs/superpowers/specs/2026-06-22-mobile-interface-design.md`).

---

### Task 1: Apple Developer Program enrollment

This is a manual, human-only task — start it first since Apple's review can
take up to 48 hours, and every later task in this plan that needs a real
Apple Developer account (Tasks 5 and 8) is blocked on it. Tasks 2–4 below
have no dependency on this and can proceed in parallel while this is
pending.

**Files:** None.

- [ ] **Step 1: Enroll**

Go to https://developer.apple.com/programs/enroll, sign in with the Apple ID
already used on the iPhone/Apple Watch, choose **Individual** enrollment
(not Organization — no company involved here), and pay the $99/yr fee.

- [ ] **Step 2: Wait for approval and verify**

Apple emails a confirmation once approved (usually within 48 hours). Verify
by going to https://developer.apple.com/account and confirming the
**Membership** section shows status **Active**.

No commit for this task — nothing in the repo changes.

---

### Task 2: Supabase RLS policies for the authenticated role

**Files:**
- Create: `supabase/migrations/20260622120000_add_authenticated_rls_policies.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `authenticated` Postgres role can now `select`/`insert`/
  `update`/`delete` on `recovery`, `activity`, `sessions`, and `select` on
  `recommendations`. Later tasks (the app's Supabase client, once a user is
  signed in) rely on this — without it, every query from the app will return
  empty results (RLS silently filters, doesn't error).

- [ ] **Step 1: Write the migration**

```sql
-- Single-user app: any authenticated session gets full read/write on
-- recovery/activity/sessions and read-only on recommendations. There's
-- exactly one real account right now, so there's no per-row ownership
-- column yet — revisit with an owner_id column + scoped policies once a
-- second user actually exists (see CLAUDE.md's multi-user principle).

create policy "authenticated read write recovery" on recovery
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read write activity" on activity
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read write sessions" on sessions
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read recommendations" on recommendations
  for select
  to authenticated
  using (true);
```

Save this as `supabase/migrations/20260622120000_add_authenticated_rls_policies.sql`.

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: output ends with `Applying migration 20260622120000_add_authenticated_rls_policies.sql...` and no errors. (The project is already linked from Phase 0/1 — `supabase/.temp/project-ref` exists.)

- [ ] **Step 3: Verify the policies exist**

Run this against the project (Supabase SQL Editor, or `psql` via the
connection string in `supabase status`):

```sql
select tablename, policyname, roles, cmd
from pg_policies
where tablename in ('recovery', 'activity', 'sessions', 'recommendations')
order by tablename;
```

Expected: 4 rows — one each for `recovery`, `activity`, `sessions` (cmd =
`ALL`) and `recommendations` (cmd = `SELECT`), all with `roles = {authenticated}`.

There is no real authenticated user yet to test actual read/write behavior
against — that end-to-end check happens in Task 8, once Apple Sign-In is
wired up and a real session exists. This step only confirms the policies
are correctly registered.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260622120000_add_authenticated_rls_policies.sql
git commit -m "feat: add authenticated RLS policies for mobile app access"
```

---

### Task 3: Scaffold the Expo app

**Files:**
- Create: `apps/mobile/` (entire Expo project, via `create-expo-app`)

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Expo project at `apps/mobile/` with `App.tsx` as the
  entry component. Later tasks edit `apps/mobile/App.tsx` and add files
  under `apps/mobile/lib/`.

- [ ] **Step 1: Generate the project**

Run: `npx create-expo-app@latest apps/mobile --template blank-typescript`
Expected: command completes with `✅ Your app is ready!` and creates
`apps/mobile/App.tsx`, `apps/mobile/package.json`, `apps/mobile/app.json`,
`apps/mobile/tsconfig.json`.

- [ ] **Step 2: Set the bundle identifier**

Open `apps/mobile/app.json` and add an `ios.bundleIdentifier` (this must
match the App ID you'll register in Task 5 — pick something now, e.g.
`com.sohan.bulletproof`):

```json
{
  "expo": {
    "name": "bulletproof",
    "slug": "bulletproof",
    "ios": {
      "bundleIdentifier": "com.sohan.bulletproof",
      "supportsTablet": false
    }
  }
}
```

(Keep any other existing keys in the generated file as-is; only add the
`ios` block.)

- [ ] **Step 3: Run it and verify on the phone**

Install the free **Expo Go** app from the App Store on the iPhone. Then:

Run: `cd apps/mobile && npx expo start`
Expected: terminal prints a QR code and `Metro waiting on exp://...`. Scan
the QR code with the iPhone's camera, open in Expo Go, and confirm the
default "Open up App.tsx to start working on your app!" screen renders.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat: scaffold Expo mobile app"
```

---

### Task 4: Wire up the Supabase client and verify connectivity

**Files:**
- Create: `apps/mobile/lib/supabase.ts`
- Create: `apps/mobile/.env.example`
- Create: `apps/mobile/.env` (local only — gitignored, not committed)
- Modify: `apps/mobile/App.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks except the scaffolded project from
  Task 3.
- Produces: `supabase` — an exported Supabase client instance from
  `apps/mobile/lib/supabase.ts` — that Task 7 imports to call
  `supabase.auth.signInWithIdToken(...)`.

- [ ] **Step 1: Install dependencies**

Run (from `apps/mobile/`):
```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```
Expected: all three packages added to `apps/mobile/package.json`.

- [ ] **Step 2: Create the env files**

Create `apps/mobile/.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Create `apps/mobile/.env` (same two keys, filled in with the real values
from the existing root `.env` file's `SUPABASE_URL` and the project's anon
key — find the anon key in the Supabase dashboard under Project Settings →
API → `anon` `public` key, **not** the service-role key):
```
EXPO_PUBLIC_SUPABASE_URL=<real value>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<real value>
```

Confirm `apps/mobile/.env` is ignored: run `git status` and verify it does
not appear (the root `.gitignore`'s `.env` pattern matches at any depth).

- [ ] **Step 3: Create the Supabase client**

```ts
// apps/mobile/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Smoke-test the connection**

Replace `apps/mobile/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from './lib/supabase';

export default function App() {
  const [status, setStatus] = useState('loading...');

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        setStatus(error ? `error: ${error.message}` : `exercises count: ${count}`);
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

`exercises` is anon-readable (existing RLS policy from Phase 0/1), so this
exercises the real anon key against the real project with no auth needed
yet.

Run: `npx expo start` (restart if already running, so the new `.env` values
load), reload the app in Expo Go.
Expected: screen shows `exercises count: 17` (per
`scripts/verify_schema.sh`'s documented expectation). If it shows an
`error:` message instead, double check the values in `apps/mobile/.env`
against the Supabase dashboard.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/supabase.ts apps/mobile/.env.example apps/mobile/App.tsx
git commit -m "feat: wire up Supabase client in mobile app"
```

---

### Task 5: Apple Developer portal — Sign In with Apple capability

Manual task. Requires Task 1 (Apple Developer Program membership Active).

**Files:** None (external account configuration only).

- [ ] **Step 1: Register the App ID**

At https://developer.apple.com/account/resources/identifiers/list, click
**+** next to Identifiers, choose **App IDs** → **App**, and register the
same bundle identifier set in Task 3 Step 2 (e.g. `com.sohan.bulletproof`).
Under Capabilities, enable **Sign In with Apple**. Save.

(Skip this step if `eas build` in Task 8 already auto-created the App ID —
in that case, edit the existing App ID to enable the Sign In with Apple
capability instead of creating a new one.)

- [ ] **Step 2: Create a Services ID**

Click **+** again, choose **Services IDs**, create one with a distinct
identifier (e.g. `com.sohan.bulletproof.signin`). Enable **Sign In with
Apple**, and configure it (you'll come back to fill in the real return URL
in Task 6 once Supabase generates it — enter a placeholder like
`https://example.com` for now if the form requires one).

- [ ] **Step 3: Create a Sign In with Apple key**

Go to **Keys** → **+**, name it (e.g. "Bulletproof Sign In with Apple"),
enable **Sign In with Apple**, associate it with the App ID from Step 1,
and register. Download the `.p8` key file — **this is only downloadable
once**, so save it somewhere safe (not in the git repo).

- [ ] **Step 4: Record the four values needed for Task 6**

Write down (not in the repo — these go into the Supabase dashboard in Task
6, not into any file):
- **Team ID** — top-right of the developer portal, or Account → Membership.
- **Key ID** — shown on the key's detail page after creating it in Step 3.
- **Services ID** — the identifier string from Step 2 (e.g.
  `com.sohan.bulletproof.signin`).
- **Private key** — the contents of the downloaded `.p8` file.

No commit for this task — nothing in the repo changes.

---

### Task 6: Supabase Auth — enable the Apple provider

Manual task. Requires Task 5's four values.

**Files:** None (external account configuration only).

- [ ] **Step 1: Enable the provider**

In the Supabase dashboard, go to **Authentication → Providers → Apple**,
toggle it on, and fill in:
- **Client ID**: the Services ID from Task 5.
- **Team ID**, **Key ID**, **Private Key**: from Task 5 Step 4.

Save.

- [ ] **Step 2: Close the loop on the Services ID's return URL**

Supabase shows a callback URL on the same page (something like
`https://<project-ref>.supabase.co/auth/v1/callback`). Copy it, go back to
the Services ID created in Task 5 Step 2, and set this as the real **Return
URL** (replacing the placeholder).

- [ ] **Step 3: Verify**

Reload the Supabase dashboard's Apple provider page and confirm it shows
**Enabled** with no validation error.

No commit for this task — nothing in the repo changes.

---

### Task 7: Apple Sign-In button wired to Supabase Auth

**Files:**
- Modify: `apps/mobile/App.tsx`

**Interfaces:**
- Consumes: `supabase` from `apps/mobile/lib/supabase.ts` (Task 4).
- Produces: a working `supabase.auth.getSession()` call returns a non-null
  session after sign-in — Task 8's TestFlight verification and all future
  feature tasks (HealthKit sync, recommendation UI) rely on there being a
  real authenticated session to read/write through.

- [ ] **Step 1: Install the package**

Run (from `apps/mobile/`): `npx expo install expo-apple-authentication`

- [ ] **Step 2: Add the sign-in button and session display**

Replace `apps/mobile/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('not signed in');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (err: any) {
      setStatus(`sign-in error: ${err.message}`);
    }
  }

  return (
    <View style={styles.container}>
      <Text>{session ? `Signed in as ${session.user.id}` : status}</Text>
      {!session && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={styles.button}
          onPress={handleSignIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 200, height: 44 },
});
```

- [ ] **Step 3: Test in Expo Go**

Run: `npx expo start`, reload in Expo Go on the iPhone.
Expected: the native Apple Sign-In button renders. Tap it, complete the
Face ID/Apple ID confirmation sheet, and confirm the screen updates to
`Signed in as <uuid>`.

If this fails specifically with an entitlement/capability error in Expo Go
(rather than a network or credential error), it means Expo Go's shared
bundle ID didn't cover it for this account — skip ahead and verify via the
EAS development/TestFlight build in Task 8 instead, where the real
entitlement from Task 5 is present.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat: add Apple Sign-In wired to Supabase Auth"
```

---

### Task 8: EAS build and TestFlight verification

**Files:**
- Create: `apps/mobile/eas.json`

**Interfaces:**
- Consumes: the working `apps/mobile/App.tsx` from Task 7.
- Produces: a TestFlight build installed on the phone — the deliverable this
  whole plan was building toward. Confirms production parity (the Sign In
  with Apple capability from Task 5 is actually exercised here, unlike in
  Expo Go).

- [ ] **Step 1: Install EAS CLI and log in**

Run: `npm install -g eas-cli` then `eas login` (create a free Expo account
if you don't have one — this is separate from the Apple Developer account).

- [ ] **Step 2: Configure the build**

Run (from `apps/mobile/`): `eas build:configure`
Expected: creates `apps/mobile/eas.json` and prompts to link/create the
project on Expo's servers — accept the defaults.

- [ ] **Step 3: Start the cloud build**

Run: `eas build --platform ios --profile preview`
Expected: EAS prompts for Apple Developer account credentials (recommend
letting it generate an App Store Connect API key rather than your Apple ID
password) and offers to auto-manage credentials — accept. It will reuse the
App ID/capability from Task 5 if the bundle identifier matches, or create a
matching one if Task 5 used `eas build` to register it (in which case go
back and confirm Sign In with Apple is enabled on it, per Task 5 Step 1's
note). The build runs entirely on Expo's servers; wait for it to finish
(`eas build:list` to check status, or watch the provided URL).

- [ ] **Step 4: Submit to TestFlight**

Run: `eas submit --platform ios --latest`
Expected: uploads the build to App Store Connect. Within a few minutes it
appears in TestFlight (you may need to accept an "export compliance"
question — answer "No" for standard encryption, which is correct for this
app).

- [ ] **Step 5: Install and verify on the phone**

Install the **TestFlight** app from the App Store, accept the invite/build
for this app, install it, and open it.
Expected: same behavior as the Expo Go test in Task 7 Step 3 — the Apple
Sign-In button renders, tapping it completes sign-in, and the screen shows
`Signed in as <uuid>`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "feat: configure EAS build for TestFlight distribution"
```

---

**End state after this plan:** a TestFlight-installed app on the phone that
signs in with Apple, holds a real Supabase `authenticated` session, and has
confirmed connectivity to the project (anon read of `exercises` in Task 4,
RLS policies for `recovery`/`activity`/`sessions`/`recommendations` in
place from Task 2). The next plan adds the actual HealthKit → Supabase sync
and the recommendation/summary UI on top of this skeleton.
