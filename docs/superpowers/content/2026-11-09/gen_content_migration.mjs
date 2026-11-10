// Generates supabase/migrations/20261109151000_exercise_videos_and_cues.sql
// Run from repo root: node docs/superpowers/content/2026-11-09/gen_content_migration.mjs
import fs from 'fs';
const dir = 'docs/superpowers/content/2026-11-09/';
const rd = (f) => JSON.parse(fs.readFileSync(dir + f, 'utf8'));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const cues = [...rd('cues_a.json'), ...rd('cues_b.json')];
const videos = rd('videos.json');
const lines = [
  '-- GENERATED FILE. Do not edit by hand.',
  '-- Source: docs/superpowers/content/2026-11-09/{cues_a,cues_b,videos}.json',
  '-- Generator: docs/superpowers/content/2026-11-09/gen_content_migration.mjs',
  '-- Sets one-line cue + description (by exercise id) and demo_video_url (by name) on global exercises only.',
  '',
];
for (const c of cues)
  lines.push(`update exercises set cue = ${q(c.cue)}, description = ${q(c.description)} where id = ${q(c.id)} and owner_id is null;`);
lines.push('');
for (const v of videos)
  lines.push(`update exercises set demo_video_url = ${q(v.url)} where name = ${q(v.name)} and owner_id is null;`);
fs.writeFileSync('supabase/migrations/20261109151000_exercise_videos_and_cues.sql', lines.join('\n') + '\n');
// checks
const out = fs.readFileSync('supabase/migrations/20261109151000_exercise_videos_and_cues.sql', 'utf8');
const stmts = out.split('\n').filter((l) => l.startsWith('update ')).length;
console.log('statements', stmts, 'expected', cues.length + videos.length);
const lib = rd('library_exercises.json');
const libNames = new Set((Array.isArray(lib) ? lib : Object.values(lib)).map((e) => e.name));
const mig = fs.readFileSync('supabase/migrations/20261109150500_new_sprints_and_basic_alternatives.sql', 'utf8');
const missing = videos.filter((v) => !libNames.has(v.name) && !mig.includes(q(v.name)));
console.log('videos with unknown names:', missing.map((m) => m.name));
