alter table recommendations add column owner_id uuid references auth.users(id);

update recommendations
set owner_id = '89ac801b-5515-4388-80a7-03662030c487'
where owner_id is null;

alter table recommendations
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

alter table recommendations
  add column program_generated_by text check (program_generated_by in ('claude', 'fallback_template')),
  add column claude_model text,
  add column claude_usage jsonb;
