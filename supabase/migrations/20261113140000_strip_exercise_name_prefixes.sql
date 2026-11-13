-- Sprint content was seeded with a pain-point prefix in the name ("Ankle: Banded Eversion").
-- The library and logger already show the body part and type as tags, so the prefix is noise.
-- Global rows only; users' custom exercises are untouched.

-- The band face pull would otherwise share a name with the older cable "Face Pull".
update exercises set name = 'Band Face Pull'
 where owner_id is null and name = 'Shoulder: Face Pull';

update exercises set name = regexp_replace(name, '^(Ankle|APT|Full Body|Knees|Mobility|Neck|Shoulder): ', '')
 where owner_id is null and name ~ '^(Ankle|APT|Full Body|Knees|Mobility|Neck|Shoulder): ';

-- Two older rows were lower-case; match the title case everything else uses.
update exercises set name = 'Couch Stretch' where owner_id is null and name = 'Couch stretch';
update exercises set name = 'Deep Squat Hold' where owner_id is null and name = 'Deep squat hold';

-- The day's "why today" line named the assessment test as if it were an exercise
-- ("Focus today: weight-bearing lunge, ..."). Reword already-built days to match the planner.
update sprint_days
   set why_today = regexp_replace(why_today, '^Focus today: (.*), your biggest gap to target\.$', 'Today targets your weakest test: \1.')
 where why_today ~ '^Focus today: .*, your biggest gap to target\.$';
update sprint_days
   set why_today = regexp_replace(why_today, '^(\w+) side first, plus one extra set: your (.*) gap is (.*)\.$', '\1 side first, plus one extra set to close a \3 gap on your \2 test.')
 where why_today ~ '^\w+ side first, plus one extra set: your .* gap is .*\.$';
