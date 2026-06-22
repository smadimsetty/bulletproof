-- Enable pgcrypto so we can use gen_random_uuid() as a primary key default.
create extension if not exists pgcrypto;

-- Canonical set of session/recommendation types used across the schema.
create type session_type as enum (
  'upper_a',
  'upper_b',
  'lower_a',
  'lower_b',
  'pickleball',
  'run',
  'rest',
  'mobility'
);
