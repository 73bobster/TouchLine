-- Crowd size for a recorded match (optional). Additive, nullable.
alter table public.matches add column if not exists attendance int;
