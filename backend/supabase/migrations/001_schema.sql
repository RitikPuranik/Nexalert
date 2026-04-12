-- ============================================================
-- NexAlert — Supabase Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ─── Hotels ──────────────────────────────────────────────────────────────────
create table hotels (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  address         text not null,
  total_floors    int not null default 1,
  access_codes    jsonb not null default '{}',
  emergency_contacts jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

-- ─── Users (extends Supabase auth.users) ─────────────────────────────────────
create table user_profiles (
  id              text primary key,  -- Firebase UID (string, not UUID)
  hotel_id        uuid references hotels(id),
  name            text not null,
  role            text not null check (role in ('guest','staff','manager','responder')),
  staff_role      text check (staff_role in ('security','housekeeping','front_desk','maintenance','management','f_and_b','medical')),
  floor_assignment int,
  zone_assignment text,
  phone           text,
  is_on_duty      boolean not null default false,
  push_token      text,
  language        text not null default 'en',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Floor Plans ─────────────────────────────────────────────────────────────
create table floor_plans (
  id              uuid primary key default uuid_generate_v4(),
  hotel_id        uuid not null references hotels(id) on delete cascade,
  floor           int not null,
  svg_url         text,
  width_px        int not null default 1000,
  height_px       int not null default 800,
  rooms           jsonb not null default '[]',
  exits           jsonb not null default '[]',
  hazard_zones    jsonb not null default '[]',
  aed_locations   jsonb not null default '[]',
  muster_points   jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  unique(hotel_id, floor)
);

-- ─── Exit Routes ─────────────────────────────────────────────────────────────
create table exit_routes (
  id                    uuid primary key default uuid_generate_v4(),
  hotel_id              uuid not null references hotels(id) on delete cascade,
  floor                 int not null,
  room                  text,
  zone                  text not null,
  path_coordinates      jsonb not null default '[]',
  muster_point          jsonb not null,
  estimated_time_seconds int not null default 120,
  is_accessible         boolean not null default true,
  uses_elevator         boolean not null default false,
  avoid_zones           jsonb not null default '[]',
  label                 text not null,
  label_translations    jsonb not null default '{}',
  created_at            timestamptz not null default now()
);

create index exit_routes_hotel_floor_idx on exit_routes(hotel_id, floor);
create index exit_routes_room_idx on exit_routes(hotel_id, room);

-- ─── Incidents ───────────────────────────────────────────────────────────────
create table incidents (
  id                      uuid primary key default uuid_generate_v4(),
  hotel_id                uuid not null references hotels(id) on delete cascade,
  type                    text not null check (type in ('fire','smoke','medical','security','gas_leak','power_outage','flood','other')),
  severity                int check (severity in (1,2,3)),
  status                  text not null default 'detecting' check (status in ('detecting','triaging','active','investigating','resolved','false_alarm','drill')),
  source                  text not null check (source in ('sensor','guest_sos','staff_alert','manual','drill')),
  is_drill                boolean not null default false,

  -- Location
  floor                   int not null,
  zone                    text not null,
  room                    text,

  -- Sensor data
  sensor_id               text,
  sensor_type             text check (sensor_type in ('smoke','heat','gas','motion')),
  sensor_value            numeric,
  sensor_threshold        numeric,

  -- Reporter
  reporter_id             text,  -- Firebase UID
  reporter_role           text,
  reporter_language       text,

  -- AI outputs
  ai_severity_reason      text,
  ai_briefing             text,
  ai_responder_briefing   text,
  ai_guest_alert_en       text,
  ai_guest_alert_translations jsonb default '{}',
  ai_tasks                jsonb default '[]',
  ai_recommend_911        boolean default false,
  ai_triage_completed_at  timestamptz,

  -- Lifecycle
  detected_at             timestamptz not null default now(),
  confirmed_at            timestamptz,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index incidents_hotel_status_idx on incidents(hotel_id, status);
create index incidents_hotel_floor_idx on incidents(hotel_id, floor);
create index incidents_detected_at_idx on incidents(detected_at desc);

-- ─── Staff Tasks ─────────────────────────────────────────────────────────────
create table staff_tasks (
  id                  uuid primary key default uuid_generate_v4(),
  incident_id         uuid not null references incidents(id) on delete cascade,
  hotel_id            uuid not null references hotels(id),
  assigned_to_user_id text,  -- Firebase UID
  assigned_to_role    text not null,
  task_text           text not null,
  protocol_id         text,
  status              text not null default 'pending' check (status in ('pending','accepted','in_progress','completed','skipped')),
  priority            int not null default 5,
  accepted_at         timestamptz,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index staff_tasks_incident_idx on staff_tasks(incident_id);
create index staff_tasks_user_idx on staff_tasks(assigned_to_user_id);
create index staff_tasks_role_idx on staff_tasks(hotel_id, assigned_to_role, status);

-- ─── Guest Locations ─────────────────────────────────────────────────────────
create table guest_locations (
  id                          uuid primary key default uuid_generate_v4(),
  hotel_id                    uuid not null references hotels(id) on delete cascade,
  guest_id                    text,  -- Firebase UID
  guest_name                  text not null,
  room_number                 text not null,
  floor                       int not null,
  zone                        text not null,
  last_seen_at                timestamptz not null default now(),
  location_source             text not null default 'check_in' check (location_source in ('check_in','qr_scan','sos_report','manual')),
  notification_status         text check (notification_status in ('pending','sent','delivered','failed')),
  guest_response              text check (guest_response in ('safe','needs_help')),
  responded_at                timestamptz,
  needs_accessibility_assistance boolean not null default false,
  language                    text not null default 'en',
  phone                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index guest_locations_hotel_floor_idx on guest_locations(hotel_id, floor);
create index guest_locations_hotel_room_idx on guest_locations(hotel_id, room_number);

-- ─── Guest Notifications ─────────────────────────────────────────────────────
create table guest_notifications (
  id                      uuid primary key default uuid_generate_v4(),
  incident_id             uuid not null references incidents(id) on delete cascade,
  guest_location_id       uuid not null references guest_locations(id),
  hotel_id                uuid not null references hotels(id),
  channel                 text not null check (channel in ('push','sms','in_app','tv_override')),
  language                text not null,
  message_text            text not null,
  evacuation_instruction  text not null,
  status                  text not null default 'pending' check (status in ('pending','sent','delivered','failed')),
  sent_at                 timestamptz,
  delivered_at            timestamptz,
  guest_response          text check (guest_response in ('safe','needs_help')),
  responded_at            timestamptz,
  created_at              timestamptz not null default now()
);

create index guest_notifications_incident_idx on guest_notifications(incident_id);
create index guest_notifications_guest_idx on guest_notifications(guest_location_id);

-- ─── Sensor Registry ─────────────────────────────────────────────────────────
create table sensors (
  id          text primary key,   -- matches sensor_id from hardware
  hotel_id    uuid not null references hotels(id) on delete cascade,
  type        text not null check (type in ('smoke','heat','gas','motion')),
  floor       int not null,
  zone        text not null,
  room        text,
  threshold   numeric not null,
  is_active   boolean not null default true,
  last_ping   timestamptz,
  created_at  timestamptz not null default now()
);

-- ─── Sensor Events Log ───────────────────────────────────────────────────────
create table sensor_events (
  id          uuid primary key default uuid_generate_v4(),
  sensor_id   text not null references sensors(id),
  hotel_id    uuid not null references hotels(id),
  value       numeric not null,
  threshold   numeric not null,
  triggered   boolean not null,   -- value > threshold
  incident_id uuid references incidents(id),
  recorded_at timestamptz not null default now()
);

create index sensor_events_sensor_idx on sensor_events(sensor_id, recorded_at desc);
create index sensor_events_hotel_idx on sensor_events(hotel_id, recorded_at desc);

-- ─── Protocols ───────────────────────────────────────────────────────────────
create table protocols (
  id              text primary key,   -- e.g. "fire_evacuation_v2"
  hotel_id        uuid references hotels(id),  -- null = global default
  incident_type   text not null,
  title           text not null,
  steps           jsonb not null default '[]',
  version         int not null default 1,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ─── Incident Reports ────────────────────────────────────────────────────────
create table incident_reports (
  id                  uuid primary key default uuid_generate_v4(),
  incident_id         uuid not null references incidents(id) on delete cascade,
  hotel_id            uuid not null references hotels(id),
  generated_at        timestamptz not null default now(),
  generated_by        text not null default 'auto',
  executive_summary   text not null,
  timeline            jsonb not null default '[]',
  response_metrics    jsonb not null default '{}',
  notifications_summary jsonb not null default '{}',
  tasks_summary       jsonb not null default '{}',
  recommendations     jsonb not null default '[]',
  pdf_url             text,
  created_at          timestamptz not null default now()
);

-- ─── Auto-update updated_at trigger ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger incidents_updated_at before update on incidents for each row execute function update_updated_at();
create trigger staff_tasks_updated_at before update on staff_tasks for each row execute function update_updated_at();
create trigger guest_locations_updated_at before update on guest_locations for each row execute function update_updated_at();
create trigger user_profiles_updated_at before update on user_profiles for each row execute function update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- IMPORTANT ARCHITECTURE NOTE:
-- This project uses Firebase Authentication instead of Supabase Auth.
-- auth.uid() returns NULL for Firebase users — RLS policies using auth.uid()
-- will NOT work for direct client queries using the anon key.
--
-- Security is enforced at the API layer:
--   • All API routes use adminDb (service role) which bypasses RLS
--   • Route handlers call getRequestUser() to verify Firebase JWT tokens
--   • hasRole() and hotel_id checks are performed in every handler
--
-- If you add direct browser Supabase queries (e.g. in hooks), pass the
-- Supabase service role key or ensure those queries are read-only public data.
-- ─────────────────────────────────────────────────────────────────────────────
alter table hotels enable row level security;
alter table incidents enable row level security;
alter table staff_tasks enable row level security;
alter table guest_locations enable row level security;
alter table guest_notifications enable row level security;
alter table floor_plans enable row level security;
alter table exit_routes enable row level security;
alter table sensor_events enable row level security;
alter table incident_reports enable row level security;

-- Helper: get current user's role and hotel
create or replace function get_user_role()
returns text as $$
  select role from user_profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function get_user_hotel_id()
returns uuid as $$
  select hotel_id from user_profiles where id = auth.uid();
$$ language sql security definer stable;

-- Incidents: managers and staff see all in their hotel
--            guests only see active incidents that affect their floor
create policy "incidents_manager_staff_read" on incidents
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff','responder')
  );

create policy "incidents_guest_read" on incidents
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() = 'guest'
    and status in ('active','resolved')
    and floor = (select floor from guest_locations where guest_id = auth.uid() and hotel_id = incidents.hotel_id limit 1)
  );

create policy "incidents_insert_any_auth" on incidents
  for insert with check (hotel_id = get_user_hotel_id());

create policy "incidents_update_manager" on incidents
  for update using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff')
  );

-- Staff tasks: managers see all, staff see their role + assigned tasks
create policy "tasks_manager_read" on staff_tasks
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','responder')
  );

create policy "tasks_staff_read" on staff_tasks
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() = 'staff'
    and (
      assigned_to_user_id = auth.uid()
      or assigned_to_role = (select staff_role from user_profiles where id = auth.uid())
    )
  );

create policy "tasks_staff_update" on staff_tasks
  for update using (
    hotel_id = get_user_hotel_id()
    and (
      assigned_to_user_id = auth.uid()
      or get_user_role() = 'manager'
    )
  );

-- Guest locations: managers and staff see ALL guests in their hotel
create policy "guest_locations_manager_staff_read" on guest_locations
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff','responder')
  );

create policy "guest_locations_guest_self" on guest_locations
  for select using (
    guest_id = auth.uid()
  );

create policy "guest_locations_insert" on guest_locations
  for insert with check (hotel_id = get_user_hotel_id());

create policy "guest_locations_update" on guest_locations
  for update using (
    guest_id = auth.uid()
    or get_user_role() in ('manager','staff')
  );

-- Floor plans and exit routes: all hotel members can read
create policy "floor_plans_hotel_read" on floor_plans
  for select using (hotel_id = get_user_hotel_id());

create policy "exit_routes_hotel_read" on exit_routes
  for select using (hotel_id = get_user_hotel_id());

-- Incident reports: managers only
create policy "reports_manager_read" on incident_reports
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','responder')
  );

-- ─── Realtime — enable for key tables ────────────────────────────────────────
alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table staff_tasks;
alter publication supabase_realtime add table guest_locations;
alter publication supabase_realtime add table guest_notifications;
alter publication supabase_realtime add table sensor_events;

-- ─── Seed: Demo hotel ─────────────────────────────────────────────────────────
insert into hotels (id, name, address, total_floors, access_codes, emergency_contacts) values (
  '00000000-0000-0000-0000-000000000001',
  'Grand Indore Palace',
  'Race Course Road, Indore, MP 452001',
  8,
  '{"stairwell_a": "4521", "stairwell_b": "3309", "roof_access": "7712", "basement": "1188"}',
  '[{"label":"Fire dept","number":"101"},{"label":"Ambulance","number":"108"},{"label":"Police","number":"100"}]'
);
