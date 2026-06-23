// apps/web/app/page.tsx
//
// The dashboard's only page: today's and yesterday's recommendations,
// fetched client-side on mount against the public recommendations_public
// view (anon key, no auth -- see
// docs/superpowers/specs/2026-06-22-web-dashboard-design.md). Mirrors the
// mobile app's App.tsx rendering structure and copy (same two-card layout,
// same "hasn't generated yet" placeholder) so the two surfaces present the
// same two outputs consistently.
'use client';

import { useEffect, useState } from 'react';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';
import { labelForSessionType } from '../lib/sessionTypeLabels';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: RecommendationsState = {
  today: null,
  yesterday: null,
  loading: true,
  error: null,
};

export default function Page() {
  const [recommendations, setRecommendations] = useState<RecommendationsState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    fetchRecommendations(new Date())
      .then((result) => {
        if (cancelled) return;
        setRecommendations({
          today: result.today,
          yesterday: result.yesterday,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRecommendations((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load recommendations',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <header>
        <h1>Bulletproof</h1>
        <p className="subtitle">A daily, Oura-integrated training recommendation.</p>
      </header>

      {recommendations.loading && <p>Loading today&rsquo;s recommendation&hellip;</p>}

      {recommendations.error && (
        <p className="error-text">Couldn&rsquo;t load recommendations: {recommendations.error}</p>
      )}

      {!recommendations.loading && !recommendations.error && (
        <>
          {recommendations.yesterday && (
            <section className="card">
              <span className="card-label">Yesterday</span>
              <h2 className="headline">{labelForSessionType(recommendations.yesterday.top_pick)}</h2>
              <p className="rationale">{recommendations.yesterday.public_rationale}</p>
            </section>
          )}

          <section className="card">
            <span className="card-label">Today</span>
            {recommendations.today ? (
              <>
                <h2 className="headline">{labelForSessionType(recommendations.today.top_pick)}</h2>
                {recommendations.today.runner_up && (
                  <p className="runner-up">
                    Runner-up: {labelForSessionType(recommendations.today.runner_up)}
                  </p>
                )}
                <p className="rationale">{recommendations.today.public_rationale}</p>
              </>
            ) : (
              <p className="rationale">
                Today&rsquo;s recommendation hasn&rsquo;t generated yet &mdash; check back this morning.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
