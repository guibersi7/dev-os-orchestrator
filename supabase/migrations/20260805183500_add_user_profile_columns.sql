alter table public.users
  add column if not exists phone text,
  add column if not exists birth_date date,
  add column if not exists profession text,
  add column if not exists company text;

notify pgrst, 'reload schema';
