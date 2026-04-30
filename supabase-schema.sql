create table if not exists public.test_reports (
  id text primary key,
  session_name text not null,
  route text,
  vehicle text,
  version text,
  staff text,
  started_at timestamptz,
  ended_at timestamptz,
  total_count integer not null default 0,
  event_count integer not null default 0,
  report_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.test_events (
  id text primary key,
  report_id text not null references public.test_reports(id) on delete cascade,
  category_name text not null,
  metric_name text not null,
  severity text not null,
  note text,
  route text,
  vehicle text,
  version text,
  staff text,
  created_at timestamptz not null
);

alter table public.test_reports enable row level security;
alter table public.test_events enable row level security;

drop policy if exists "allow anon insert reports" on public.test_reports;
drop policy if exists "allow anon read reports" on public.test_reports;
drop policy if exists "allow anon insert events" on public.test_events;
drop policy if exists "allow anon read events" on public.test_events;

create policy "allow anon insert reports"
on public.test_reports for insert
to anon
with check (true);

create policy "allow anon read reports"
on public.test_reports for select
to anon
using (true);

create policy "allow anon insert events"
on public.test_events for insert
to anon
with check (true);

create policy "allow anon read events"
on public.test_events for select
to anon
using (true);
