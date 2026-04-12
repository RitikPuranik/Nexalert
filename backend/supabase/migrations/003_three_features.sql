-- ============================================================
-- NexAlert Migration 003
-- Three features:
--   1. Dead man's switch  (deadman_sessions)
--   2. Floor plan heatmap (no new table — uses guest_locations + guest_notifications)
--   3. Staff last-seen    (staff_presence)
-- ============================================================

-- ─── 1. Dead Man's Switch ─────────────────────────────────────────────────────
-- One session per SOS. Guest must ping every 2 min.
-- Missing 2 pings → status flips to 'escalated'.

create table deadman_sessions (
  id                uuid primary key default uuid_generate_v4(),
  incident_id       uuid not null references incidents(id) on delete cascade,
  hotel_id          uuid not null references hotels(id) on delete cascade,
  guest_location_id uuid references guest_locations(id),
  room_number       text not null,
  floor             int  not null,
  session_token     text not null unique,
  status            text not null default 'active'
                    check (status in ('active','escalated','resolved','expired')),
  interval_seconds  int  not null default 120,
  missed_pings      int  not null default 0,
  escalate_after    int  not null default 2,
  last_ping_at      timestamptz not null default now(),
  escalated_at      timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index deadman_hotel_status_idx on deadman_sessions(hotel_id, status);
create index deadman_token_idx        on deadman_sessions(session_token);
create index deadman_incident_idx     on deadman_sessions(incident_id);

create trigger deadman_updated_at
  before update on deadman_sessions
  for each row execute function update_updated_at();

-- ─── 3. Staff Presence / Last-Seen ────────────────────────────────────────────
-- One row per (staff member × incident).
-- Staff app sends a heartbeat every 30 s while app is open.
-- No ping for > SILENT_THRESHOLD → status = 'silent'.

create table staff_presence (
  id           uuid primary key default uuid_generate_v4(),
  user_id      text not null,  -- Firebase UID (text, not uuid)
  hotel_id     uuid not null references hotels(id) on delete cascade,
  incident_id  uuid not null references incidents(id) on delete cascade,
  last_ping_at timestamptz not null default now(),
  floor        int,
  zone         text,
  status       text not null default 'active'
               check (status in ('active','silent','offline')),
  silent_since timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, incident_id)
);

create index presence_incident_idx on staff_presence(incident_id, status);
create index presence_hotel_idx    on staff_presence(hotel_id);

create trigger presence_updated_at
  before update on staff_presence
  for each row execute function update_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table deadman_sessions enable row level security;
alter table staff_presence   enable row level security;

-- Dead man's switch: manager/staff/responder can read; API handles guest token auth
create policy "deadman_hotel_read" on deadman_sessions
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff','responder')
  );

create policy "deadman_hotel_write" on deadman_sessions
  for all using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff')
  );

-- Staff presence: manager/responder read all; staff read/write their own
create policy "presence_manager_read" on staff_presence
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','responder')
  );

create policy "presence_staff_own" on staff_presence
  for all using (user_id = auth.uid());

-- ─── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table deadman_sessions;
alter publication supabase_realtime add table staff_presence;
-- guest_locations and guest_notifications already in realtime (used for heatmap)
