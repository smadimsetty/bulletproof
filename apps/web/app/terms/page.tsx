// apps/web/app/terms/page.tsx
//
// Terms of Use (static). Linked from onboarding, the app's Settings and App
// Store Connect. Includes the zero-tolerance clause required for apps with
// user-generated content, and the not-medical-advice disclaimer.
// TODO(Sohan): replace support@example.com with the real support address and
// review this text before publishing.
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Use - Bulletproof' };

const CONTACT = 'support@example.com'; // TODO(Sohan): real support address

export default function TermsPage() {
  return (
    <main className="legal">
      <h1>Terms of Use</h1>
      <p className="updated">Last updated: November 2026</p>

      <p>By creating an account or using Bulletproof you agree to these terms.</p>

      <h2>Who can use Bulletproof</h2>
      <p>
        You must be at least 13 years old. If you are under the age of majority where you live, use the app with a
        parent or guardian&apos;s permission. You are responsible for your account and for keeping your sign-in
        secure.
      </p>

      <h2>Acceptable use and zero tolerance</h2>
      <p>
        Bulletproof has zero tolerance for objectionable content and abusive users. You agree not to post, share or
        send anything that is:
      </p>
      <ul>
        <li>harassing, bullying, threatening or hateful toward a person or group;</li>
        <li>sexually explicit, or contains nudity;</li>
        <li>violent, or encourages harm to yourself or others;</li>
        <li>spam, scams or impersonation;</li>
        <li>illegal, or that infringes someone else&apos;s rights.</li>
      </ul>
      <p>
        You also agree not to try to access other people&apos;s private data, interfere with the service, or use it to
        harm others.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the workouts, photos and comments you post. You give us permission to store them and
        show them to the people you choose through your visibility settings, so the app can work.
      </p>

      <h2>Reporting, moderation and termination</h2>
      <p>
        You can report any workout, comment or user from inside the app, and block users. Reports are reviewed by a
        moderator, and content reported by several people is hidden while it is reviewed. We may remove content and
        suspend or terminate accounts that break these terms, without notice. You can delete your own account at any
        time in Settings.
      </p>

      <h2>Not medical advice</h2>
      <p>
        Bulletproof&apos;s exercises, mobility routines and sprints are general fitness information, not medical
        advice, diagnosis or treatment. They are not a substitute for a doctor or physical therapist. Stop any
        exercise that causes pain, and if pain gets worse or does not improve, see a qualified professional. Check
        with a professional before starting if you have an injury or health condition. You exercise at your own risk.
      </p>

      <h2>Limits of liability</h2>
      <p>
        The app is provided &quot;as is&quot; without warranties. To the fullest extent the law allows, we are not
        liable for indirect or consequential damages, or for injuries or losses arising from your use of the app or
        from other users&apos; content. Nothing here limits liability that cannot legally be limited.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. If we make a significant change we will update the date above and, where
        appropriate, tell you in the app. Continuing to use Bulletproof after a change means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
