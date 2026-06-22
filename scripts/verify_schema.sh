#!/usr/bin/env bash
# Verifies the core RLS contract for the Bulletproof schema:
# - exercises and recommendations_public are anon-readable
# - user_profile, recovery, recommendations (base), and sessions are anon-blocked
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY must be set}"

anon_get() {
  curl -s "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY"
}

echo "exercises (expect 17 rows):"
anon_get "exercises?select=name" | python -c "import json,sys; print(len(json.load(sys.stdin)))"

echo "recommendations_public (expect >= 0 rows, no internal columns):"
anon_get "recommendations_public?select=*"

for table in user_profile recovery recommendations sessions; do
  echo "$table (expect []):"
  anon_get "$table?select=*"
done
