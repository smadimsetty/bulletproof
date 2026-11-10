-- Run live after the C3 migration. Mirrors BASIC in apps/mobile/lib/equipmentTiers.ts (partner_or_bench moved to
-- intermediate 2026-11-10; still 0 rows). Expected: zero rows (every sprint slot has a basic/bodyweight candidate).
select p.pain_point_id, p.slot_key
from sprint_exercise_pool p join exercises e on e.id = p.exercise_id
group by 1,2
having bool_or(coalesce(e.equipment_needed,'{}') <@ array['none','bodyweight','wall','wall_or_couch','doorway','towel','step','floor_markers','cone_or_marker','cones','cones_or_floor_markers']) is not true;
