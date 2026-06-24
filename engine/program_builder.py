import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import exercise_catalog_repo
from program_prompt import SYSTEM_PROMPT, render_catalog_excerpt, render_profile_slice, render_recent_signals

CLAUDE_MODEL = "claude-sonnet-4-6"
MAX_STRENGTH_EXERCISES_FALLBACK = 4
MAX_MOBILITY_EXERCISES_FALLBACK = 5

# Block types this catalog has real exercise rows for (matches
# exercise_catalog_repo.BLOCK_TYPE_MOVEMENT_PATTERNS' non-empty keys).
# pickleball/run/rest blocks never get an exercise list -- the Claude call
# (and the fallback) simply produce no `exercises` for those block types.
EXERCISE_BEARING_BLOCK_TYPES = {"upper", "lower", "mobility"}


def _exercise_output_schema():
    return {
        "type": "object",
        "properties": {
            "exercise_id": {"type": "string"},
            "sets": {"type": ["integer", "null"]},
            "reps": {"type": ["string", "null"]},
            "weight_note": {"type": ["string", "null"]},
            "unilateral_left_first": {"type": "boolean"},
            "notes": {"type": ["string", "null"]},
        },
        "required": ["exercise_id", "sets", "reps", "weight_note", "unilateral_left_first", "notes"],
        "additionalProperties": False,
    }


def _build_exercise_id_enum(catalog_excerpt):
    """Collects every exercise id across every block's catalog excerpt into
    one flat set, used to constrain the structured-output schema's
    exercise_id enum (anti-hallucination layer 1, design spec Decision 6)
    and to re-check the parsed response (layer 2)."""
    ids = set()
    for rows in catalog_excerpt.values():
        for row in rows:
            ids.add(row["id"])
    return ids


def _build_output_schema(catalog_excerpt, gated_blocks):
    """Builds the per-request JSON schema for output_config.format.
    exercise_id is constrained to a literal enum of this day's actual
    catalog-excerpt ids -- a hallucinated id becomes a schema-validation
    failure inside client.messages.parse() itself, not a silent bad write
    (design spec Decision 6, anti-hallucination layer 1). block_type gets
    the same treatment, constrained to today's actual gated_blocks list --
    without this, Claude could return a block_type the deterministic gate
    never decided on (or omit/duplicate one), which would flow straight
    into recommendation_blocks unvalidated even though the exercise-id
    checks were passing (caught in whole-branch review; see
    docs/superpowers/specs/2026-06-24-engine-v2-design.md)."""
    exercise_schema = _exercise_output_schema()
    ids = sorted(_build_exercise_id_enum(catalog_excerpt))
    exercise_schema["properties"]["exercise_id"] = {"type": "string", "enum": ids} if ids else {"type": "string"}

    return {
        "type": "object",
        "properties": {
            "blocks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "block_type": {"type": "string", "enum": list(gated_blocks)},
                        "title": {"type": "string"},
                        "estimated_minutes": {"type": ["integer", "null"]},
                        "exercises": {"type": "array", "items": exercise_schema},
                    },
                    "required": ["block_type", "title", "estimated_minutes", "exercises"],
                    "additionalProperties": False,
                },
            },
            "rationale_internal": {"type": "string"},
            "rationale_public": {"type": "string"},
        },
        "required": ["blocks", "rationale_internal", "rationale_public"],
        "additionalProperties": False,
    }


def _assemble_messages(gated_blocks, profile, breakdown, recent_feedback, catalog_excerpt):
    """Builds the system + user message list in stable-to-volatile order
    per the v2 design spec's caching strategy: persona system prompt
    (cached) -> catalog excerpt (cached) -> profile slice + recent
    signals/feedback + today's gate (uncached, changes daily/per-user)."""
    system = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]

    catalog_text = render_catalog_excerpt(catalog_excerpt)
    user_text = (
        f"{catalog_text}\n\n"
        "---\n"
        f"Today's gated session blocks: {', '.join(gated_blocks)}\n\n"
        f"{render_profile_slice(profile)}\n\n"
        f"{render_recent_signals(breakdown, recent_feedback)}\n\n"
        "Build today's program: one block per gated session block above, choosing real "
        "exercises (by id) from the catalog excerpt for any block_type that has exercise "
        "rows. Non-exercise block types (pickleball, run, rest) should still appear as a "
        "block with an empty exercises list."
    )
    messages = [
        {
            "role": "user",
            "content": [{"type": "text", "text": user_text, "cache_control": {"type": "ephemeral"}}],
        }
    ]
    return system, messages


def _call_claude(system, messages, schema):
    """Thin wrapper around the anthropic SDK call, isolated so tests mock
    this single function rather than the whole SDK client. Imports
    `anthropic` lazily inside the function so the module itself stays
    importable (and every other function in it testable) even in an
    environment where the package isn't installed yet -- matching this
    codebase's existing pattern of narrow, mockable network boundaries
    (oura_client.fetch, supabase_client.get/upsert)."""
    import anthropic

    client = anthropic.Anthropic()
    return client.messages.parse(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        system=system,
        messages=messages,
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )


def _validate_response(parsed, catalog_excerpt, gated_blocks):
    """Anti-hallucination layer 2 (design spec Decision 6): re-checks every
    returned exercise_id against the same excerpt's id set, independently
    of the schema enum that should have already blocked it. Also re-checks
    that the returned blocks are exactly the gated set -- no missing,
    extra, or duplicate block_type -- independently of the schema enum
    that should have already constrained each individual block_type (a
    per-item enum can't express "exactly these N items, no duplicates",
    which is why this needs its own check rather than relying on the
    schema alone). Returns False on any violation -- callers treat False
    exactly like a parse failure and fall back."""
    valid_ids = _build_exercise_id_enum(catalog_excerpt)
    for block in parsed.get("blocks", []):
        for exercise in block.get("exercises", []):
            if exercise["exercise_id"] not in valid_ids:
                return False

    returned_block_types = [block["block_type"] for block in parsed.get("blocks", [])]
    if sorted(returned_block_types) != sorted(gated_blocks):
        return False

    return True


def _build_fallback_blocks(gated_blocks, catalog_excerpt):
    """Deterministic, Claude-free fallback (design spec Decision 10): for
    each gated block type, take up to N already-filtered/sorted rows from
    the same catalog excerpt the primary path would have used, mapping each
    exercise's own default_sets/default_rep_range straight through (no
    Claude reasoning layered on top)."""
    blocks = []
    for block_type in gated_blocks:
        rows = catalog_excerpt.get(block_type, [])
        # Re-sort is_corrective DESC here too (not just relying on
        # exercise_catalog_repo.load_catalog_excerpt's own sort) -- design
        # spec Decision 10's "simple deterministic ordering" is stated as
        # this function's own contract, and defense-in-depth (the same
        # ordering re-applied independently at two layers) matches Decision
        # 6's posture for the anti-hallucination checks.
        sorted_rows = sorted(rows, key=lambda r: not r.get("is_corrective"))
        cap = MAX_MOBILITY_EXERCISES_FALLBACK if block_type == "mobility" else MAX_STRENGTH_EXERCISES_FALLBACK
        chosen = sorted_rows[:cap]
        blocks.append({
            "block_type": block_type,
            "title": block_type.replace("_", " ").title(),
            "estimated_minutes": None,
            "exercises": [
                {
                    "exercise_id": row["id"],
                    "sets": row.get("default_sets"),
                    "reps": row.get("default_rep_range"),
                    "weight_note": None,
                    "unilateral_left_first": bool(row.get("unilateral")),
                    "notes": None,
                }
                for row in chosen
            ],
        })
    return blocks


def _fallback_rationale(gated_blocks):
    blocks_text = ", ".join(gated_blocks)
    internal = f"Fallback template program used (Claude unavailable or response invalid). Blocks: {blocks_text}."
    public = f"Today's program covers: {blocks_text}."
    return internal, public


def build_daily_program(today, gated_blocks, profile, breakdown, recent_feedback, owner_id):
    """Builds today's full program -- one row's worth of
    program_generated_by/claude_model/claude_usage/blocks data, ready for
    run_daily.py to persist into recommendations/recommendation_blocks/
    recommendation_block_exercises. Always returns a usable result: on any
    Claude API exception, schema-validation failure, or failed runtime
    invariant check, falls back to a deterministic template program built
    from the same catalog excerpt (design spec Decision 10) -- this
    function never raises for a Claude-side failure, only for a genuine
    programming error (e.g. a malformed `profile`/`breakdown` input)."""
    catalog_excerpt = exercise_catalog_repo.load_catalog_excerpt(gated_blocks, profile)

    schema = _build_output_schema(catalog_excerpt, gated_blocks)
    system, messages = _assemble_messages(gated_blocks, profile, breakdown, recent_feedback, catalog_excerpt)

    try:
        response = _call_claude(system, messages, schema)
        parsed = response.parsed_output
        if parsed is None or not _validate_response(parsed, catalog_excerpt, gated_blocks):
            raise ValueError("Claude response failed the exercise-id/block-type invariant check")

        return {
            "program_generated_by": "claude",
            "claude_model": response.model,
            "claude_usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "cache_creation_input_tokens": response.usage.cache_creation_input_tokens,
                "cache_read_input_tokens": response.usage.cache_read_input_tokens,
            },
            "blocks": parsed["blocks"],
            "internal_rationale": parsed["rationale_internal"],
            "public_rationale": parsed["rationale_public"],
        }
    except Exception as exc:
        print(f"Warning: program_builder falling back to template program ({exc}).", file=sys.stderr)
        internal, public = _fallback_rationale(gated_blocks)
        return {
            "program_generated_by": "fallback_template",
            "claude_model": None,
            "claude_usage": None,
            "blocks": _build_fallback_blocks(gated_blocks, catalog_excerpt),
            "internal_rationale": internal,
            "public_rationale": public,
        }
