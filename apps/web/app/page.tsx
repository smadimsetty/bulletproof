// apps/web/app/page.tsx
//
// MoveMaxx landing page (static). The site root is what App Store Connect's
// marketing URL and the in-app legal links point at, so it describes the app
// as it is today: pain-point mobility sprints + a mobility-first workout
// logger. The original Oura recommendation dashboard lives at /dashboard.
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'MoveMaxx',
  description: 'Mobility that sticks. Pick one pain point, test it, train it for 14 days, and test it again.',
};

const SPRINTS: { name: string; tagline: string }[] = [
  { name: 'Ankles', tagline: 'Steadier ankles that hold up when you move fast' },
  { name: 'Rounded Shoulders', tagline: 'Open up your chest and strengthen your upper back' },
  { name: 'Nerd Neck', tagline: 'Ease neck strain from long hours at a screen' },
  { name: 'Anterior Pelvic Tilt', tagline: 'Balance tight hips with a stronger core and glutes' },
  { name: 'Knees', tagline: 'Stronger hips, quads and ankles so knees handle stairs and squats' },
  { name: 'Full Body', tagline: 'A little movement for stiff spines, hips and shoulders' },
  { name: 'Total Mobility', tagline: 'The mobility and recovery work training usually skips' },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Test', body: 'A few simple measurements with a wall, a tape measure and a timer. No guessing where you start.' },
  { n: '02', title: 'Train', body: 'Short daily routines for 14 days, built from your equipment: bodyweight, a home setup or a full gym.' },
  { n: '03', title: 'Retest', body: 'Run the same tests again and see the before and after in numbers, not vibes.' },
];

const FEATURES: { title: string; body: string }[] = [
  { title: 'A logger built for mobility', body: 'Holds, side-by-side work, rest timers with a beep that plays on silent, and a lock-screen timer.' },
  { title: 'Every exercise explained', body: 'A one-line cue, a demo video, how to do it and why it helps.' },
  { title: 'Progress you can see', body: 'Streaks, assessment trends, personal records and a monthly recap you can share.' },
  { title: 'Train with friends', body: 'Follow people, share workouts, copy a routine. Every workout is private unless you say otherwise.' },
];

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="30" fill="none" stroke="var(--track)" strokeWidth="11" />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray="150 189"
        transform="rotate(130 50 50)"
      />
      <circle cx="71" cy="71" r="8.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2.5" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="landing">
      <header className="hero">
        <div className="brand">
          <Mark />
          <span className="wordmark">MOVEMAXX</span>
        </div>
        <h1>Mobility that sticks.</h1>
        <p className="lede">
          Pick the one thing that bothers you most, whether that's stiff ankles, a forward neck or tight hips. Test it,
          train it for 14 days, and test it again.
        </p>
        <p className="availability">Coming soon to iPhone.</p>
      </header>

      <section>
        <h2 className="eyebrow">How a sprint works</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n} className="tile">
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="eyebrow">Seven sprints</h2>
        <ul className="sprints">
          {SPRINTS.map((s) => (
            <li key={s.name}>
              <span className="sprint-name">{s.name}</span>
              <span className="sprint-tagline">{s.tagline}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="eyebrow">Everything else</h2>
        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title} className="tile">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="site-footer">
        <nav>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p>MoveMaxx is general fitness information, not medical advice.</p>
      </footer>
    </main>
  );
}
