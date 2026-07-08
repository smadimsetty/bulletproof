alter table user_profile
  add column weight_unit text not null default 'lbs' check (weight_unit in ('kg', 'lbs'));
