-- Numbers for the weekly Supabase usage email (.github/workflows/usage-report.yml).
-- security definer so it can read auth.users and storage.objects; callable by the
-- service role only (the workflow uses the service key), never by app users.
create or replace function admin_usage_report()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'storage_files', (select count(*) from storage.objects),
    'users_total', (select count(*) from auth.users),
    'users_new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'workouts_7d', (select count(*) from workouts where started_at > now() - interval '7 days'),
    'sets_7d', (select count(*) from workout_sets where completed_at > now() - interval '7 days'),
    'active_sprints', (select count(*) from sprints where status = 'active'),
    'coach_calls_7d', (select count(*) from engine_calls where created_at > now() - interval '7 days'),
    'largest_tables', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.relname as name, pg_total_relation_size(c.oid) as bytes
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'r' and n.nspname in ('public', 'auth', 'storage')
         order by pg_total_relation_size(c.oid) desc
         limit 5
      ) t
    )
  );
$$;

revoke all on function admin_usage_report() from public, anon, authenticated;
grant execute on function admin_usage_report() to service_role;
