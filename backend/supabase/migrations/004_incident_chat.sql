-- ============================================================
-- NexAlert Migration 004
-- Adds: incident_chat table for inter-incident communication
-- ============================================================

-- ─── Incident Chat / Communication Log ──────────────────────────────────────
-- Staff and managers post quick text updates during an active incident.
-- Messages are visible to all responders in real time via SSE.

create table incident_chat (
  id              uuid primary key default uuid_generate_v4(),
  incident_id     uuid not null references incidents(id) on delete cascade,
  hotel_id        uuid not null references hotels(id) on delete cascade,
  user_id         text not null,            -- Firebase UID
  user_name       text not null,
  user_role       text not null,
  message         text not null,
  message_type    text not null default 'update'
                  check (message_type in ('update','alert','question','resolution')),
  floor           int,
  zone            text,
  created_at      timestamptz not null default now()
);

create index chat_incident_idx on incident_chat(incident_id, created_at);
create index chat_hotel_idx on incident_chat(hotel_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table incident_chat enable row level security;

-- Manager/staff/responder can read all chat in their hotel
create policy "chat_hotel_read" on incident_chat
  for select using (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff','responder')
  );

-- Manager/staff/responder can insert chat
create policy "chat_hotel_write" on incident_chat
  for insert with check (
    hotel_id = get_user_hotel_id()
    and get_user_role() in ('manager','staff','responder')
  );

-- ─── Realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table incident_chat;
