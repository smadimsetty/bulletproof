insert into user_profile (name, goals, injury_constraints) values (
  'Sohan',
  '{
    "core_goal": "bulletproof: move and lift pain-free, total-body resilience, strong and mobile and lean, visible abs",
    "target_ratios_per_10_days": {"lift": 4, "pickleball": 2, "run": 1.5, "rest": 1},
    "focus": "slight recomposition, fill out shoulders and upper back, sharpen abs"
  }'::jsonb,
  '{
    "neck": {"active": true, "note": "chronic stiffness, root cause treated as thoracic spine"},
    "ankles": {"active": true, "note": "both injured over ~1.5yrs, highest reinjury risk under high volume / lateral pickleball movement"},
    "hips_hamstrings": {"active": true, "note": "wants better mobility: deep squat, down dog, flexibility poses"},
    "right_dominance": {"active": true, "note": "right arm stronger and tighter/less mobile than left"}
  }'::jsonb
);
