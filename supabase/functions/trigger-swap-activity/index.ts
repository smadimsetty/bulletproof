// supabase/functions/trigger-swap-activity/index.ts
//
// Thin relay, not a reimplementation of the engine: dispatches the
// swap-activity.yml GitHub Actions workflow on demand with the caller's
// chosen date + activity, mirroring trigger-daily-engine/index.ts's
// existing dispatch pattern exactly. See engine/swap_activity.py for what
// actually runs.
//
// Requires a signed-in session by default (Supabase Edge Functions verify
// the caller's JWT unless verify_jwt is explicitly disabled in
// supabase/config.toml, which it is not here) -- mobile-app-only, same as
// trigger-daily-engine.
const GITHUB_OWNER = "smadimsetty";
const GITHUB_REPO = "bulletproof";
const GITHUB_WORKFLOW_FILE = "swap-activity.yml";
const GITHUB_REF = "master";

// Must match engine/swap_activity.py's VALID_ACTIVITIES exactly -- these
// are the only session types program_builder/scoring know how to build a
// program for. Validated here (not just left to GitHub Actions/the engine)
// so an invalid value 400s immediately instead of interpolating untrusted
// input into the workflow's `run:` step's `${{ inputs.activity }}`.
const VALID_ACTIVITIES = new Set(["upper", "lower", "pickleball", "run", "mobility", "rest"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { date?: unknown; activity?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { date, activity } = body;
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return new Response(JSON.stringify({ error: "date must be a YYYY-MM-DD string" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof activity !== "string" || !VALID_ACTIVITIES.has(activity)) {
    return new Response(
      JSON.stringify({ error: `activity must be one of ${[...VALID_ACTIVITIES].join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
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
      "User-Agent": "bulletproof-trigger-swap-activity",
    },
    body: JSON.stringify({ ref: GITHUB_REF, inputs: { date, activity } }),
  });

  if (!githubResponse.ok) {
    const responseBody = await githubResponse.text();
    return new Response(
      JSON.stringify({ error: `GitHub dispatch failed (${githubResponse.status}): ${responseBody}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
