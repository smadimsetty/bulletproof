// apps/web/app/privacy/page.tsx
//
// Privacy Policy (static). Linked from the app's Settings and App Store Connect.
// TODO(Sohan): replace support@example.com with the real support address
// before publishing, and have the text reviewed if you want legal sign-off.
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy - Bulletproof' };

const CONTACT = 'support@example.com'; // TODO(Sohan): real support address

export default function PrivacyPage() {
  return (
    <main className="legal">
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: November 2026</p>

      <p>
        Bulletproof is a mobility-first workout logger. This page explains what the app collects, why, who can see
        it, and how to delete it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your account: the email address you sign in with, or the identifier Apple gives us if you use Sign in with Apple.</li>
        <li>Your profile: display name, handle, optional bio and profile photo, and whether your profile is public.</li>
        <li>Your workouts: exercises, sets, weights, hold times, range-of-motion measurements, titles, notes and any photos you attach.</li>
        <li>Your mobility sprints and assessments: the pain points you choose and the before/after measurements you record.</li>
        <li>Social activity: who you follow and who follows you, likes, comments, blocks, hidden posts and reports you file.</li>
        <li>Settings: units, weekly goal, default post visibility and notification choices.</li>
        <li>Push notification tokens, if you allow notifications.</li>
      </ul>
      <p>
        Apple Health: if you turn it on in Settings, Bulletproof saves your finished workouts to Apple Health. The
        app only writes to Health. It never reads your Health data.
      </p>

      <h2>Why we collect it</h2>
      <p>
        To run the app: log and show your workouts, track your progress, let you share with people you choose, send
        the notifications you ask for, and keep the community safe (reports, blocks and moderation).
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          Every workout has its own visibility: Private (only you), Followers (people whose follow you have
          approved), or Public (anyone, and only if your profile is public).
        </li>
        <li>Mobility sprint workouts default to Private because they can reveal a health issue.</li>
        <li>A private profile shows only your name, handle, photo and a Private badge to people who do not follow you.</li>
        <li>People you block cannot see your profile, workouts or comments, and you cannot see theirs.</li>
        <li>Photos are stored privately and are only shown to people who are allowed to see the workout they belong to.</li>
        <li>We do not sell your data and we do not show ads.</li>
      </ul>

      <h2>Where it is stored</h2>
      <p>
        Your data is stored with our backend provider, Supabase, which hosts the database, file storage and sign-in.
        Push notifications are delivered through Expo&apos;s push service, which receives your device push token and
        the notification text.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your data while your account exists. You can delete your account at any time in the app under
        Profile, Settings, Delete account. Deleting removes your profile, workouts, photos, routines, social
        activity and sign-in. You can also delete individual workouts, photos and comments yourself.
      </p>

      <h2>Children</h2>
      <p>Bulletproof is not for children under 13, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a meaningful way we will update the date above and, where appropriate, tell you in
        the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
