import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import supabase_client

# Which exercises.movement_pattern values are relevant to a given block_type
# (a session_type, per the v2 schema's recommendation_blocks.block_type
# column). Strength blocks (upper/lower) pull from the four lifting
# patterns; mobility blocks pull from the two non-lifting patterns; cardio
# block types (pickleball/run) have no dedicated exercise rows of their own
# in this catalog (CLAUDE.md's program is about gym/mobility content, not
# cardio-activity exercise selection) so they intentionally match nothing
# and the caller gets an empty list back -- not an error.
BLOCK_TYPE_MOVEMENT_PATTERNS = {
    "upper": ["push", "pull", "core"],
    "lower": ["squat", "hinge", "core"],
    "mobility": ["mobility", "balance"],
    "rest": [],
    "pickleball": [],
    "run": [],
}

SELECT_COLUMNS = (
    "id,name,movement_pattern,exercise_type,target_goals,body_parts,"
    "default_sets,default_rep_range,unilateral,is_corrective"
)


def _matches_profile(row, profile):
    """A row is relevant if it tags one of the profile's current_goals, one
    of the profile's pain body_parts, or is a corrective row for a
    pain-relevant body part -- design spec Decision 7's filter, mirrored
    here in Python since expressing an array-intersection OR across three
    different jsonb/array shapes in one PostgREST query string is more
    fragile than filtering the (already movement_pattern-narrowed,
    typically small) result set in Python."""
    goals = set(profile.get("current_goals") or [])
    pain_parts = {p["body_part"] for p in (profile.get("pains") or [])}
    row_goals = set(row.get("target_goals") or [])
    row_parts = set(row.get("body_parts") or [])

    if row_goals & goals:
        return True
    if row_parts & pain_parts:
        return True
    if row.get("is_corrective") and row_parts & pain_parts:
        return True
    return False


def load_catalog_excerpt(block_types, profile, limit_per_block=40):
    """Returns {block_type: [row, ...]} -- one filtered, capped, sorted
    exercise list per block_type in block_types. Sorted is_corrective DESC
    then by id (stable, deterministic) so the same inputs always produce the
    same prompt excerpt, per design spec Decision 7. Block types with no
    matching movement_pattern (pickleball/run/rest) return an empty list,
    not an error -- callers should not assume every block_type yields rows.
    """
    excerpt = {}
    for block_type in block_types:
        patterns = BLOCK_TYPE_MOVEMENT_PATTERNS.get(block_type, [])
        if not patterns:
            excerpt[block_type] = []
            continue

        rows = supabase_client.get(
            "exercises",
            {
                "select": SELECT_COLUMNS,
                "movement_pattern": "in.(" + ",".join(patterns) + ")",
            },
        )
        matching = [row for row in rows if _matches_profile(row, profile)]
        matching.sort(key=lambda r: (not r.get("is_corrective"), r["id"]))
        excerpt[block_type] = matching[:limit_per_block]

    return excerpt
