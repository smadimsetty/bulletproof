// apps/web/app/support/page.tsx
//
// Support page (static): short FAQ + contact. Linked from the app's Settings
// and App Store Connect.
// TODO(Sohan): replace support@example.com with the real support address.
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Support - MoveMaxx' };

const CONTACT = 'support@example.com'; // TODO(Sohan): real support address

export default function SupportPage() {
  return (
    <main className="legal">
      <h1>Support</h1>

      <h2>How do I delete my account?</h2>
      <p>
        In the app, open the Profile tab, tap the gear for Settings, then Delete account. You will be asked to type
        DELETE to confirm. This permanently removes your profile, workouts, photos, routines and social activity.
      </p>

      <h2>How do I report something or someone?</h2>
      <p>
        Tap the ... menu on a workout or a profile and choose Report. For a comment, press and hold it. You can also
        block a user from the same menus, which hides everything between you in both directions. Reports go to a
        moderator; content reported by several people is hidden while it is reviewed.
      </p>

      <h2>Who can see my workouts?</h2>
      <p>
        You choose per workout: Private (only you), Followers, or Public. Mobility sprint workouts start as Private.
        Your profile can be public or private in Settings; a private profile only shows your name, handle and photo
        to people who do not follow you. See the <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>I did not get my sign-in code</h2>
      <p>
        Check your spam folder and make sure you typed the right email, then request a new code. Codes expire quickly,
        so use the newest one. If you signed up with Apple, use Sign in with Apple again: Apple and email sign-in
        create separate accounts unless the emails match.
      </p>

      <h2>Contact us</h2>
      <p>
        Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and include what you were doing and, if you can, a
        screenshot.
      </p>
    </main>
  );
}
