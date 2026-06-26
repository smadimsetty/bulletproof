// supabase/functions/trigger-daily-engine/index.ts
//
// Thin relay, not a reimplementation of the engine: dispatches the
// existing daily-cron.yml GitHub Actions workflow on demand, so the
// mobile app can get today's recommendation generated within about a
// minute of opening the app instead of waiting for the 11:00 UTC cron.
// See docs/superpowers/specs/2026-06-26-on-demand-recommendation-trigger-design.md.
//
// Requires a signed-in session by default (Supabase Edge Functions
// verify the caller's JWT unless verify_jwt is explicitly disabled in
// supabase/config.toml, which it is not here) -- this is what keeps this
// endpoint mobile-app-only; the public web dashboard never calls it.
const GITHUB_OWNER = "smadimsetty";
const GITHUB_REPO = "bulletproof";
const GITHUB_WORKFLOW_FILE = "daily-cron.yml";
const GITHUB_REF = "master";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const githubPat = Deno.env.get("GITHUB_PAT");
  if (!githubPat) {
    return new Response(JSON.stringify({ error: "GITHUB_PAT is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dispatchUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

  const githubResponse = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubPat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "bulletproof-trigger-daily-engine",
    },
    body: JSON.stringify({ ref: GITHUB_REF }),
  });

  if (!githubResponse.ok) {
    const body = await githubResponse.text();
    return new Response(
      JSON.stringify({ error: `GitHub dispatch failed (${githubResponse.status}): ${body}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
