-- ============================================================
-- NexAlert — Demo Seed Data
-- Grand Indore Palace — 8 floors, 24 rooms per floor
-- Run AFTER 001_schema.sql
-- ============================================================

-- ─── Demo hotel already seeded in migration ───────────────────────────────────
-- hotel_id: 00000000-0000-0000-0000-000000000001

-- ─── Floor Plans (Floors 1–3 for demo) ───────────────────────────────────────
insert into floor_plans (hotel_id, floor, width_px, height_px, rooms, exits, muster_points) values
(
  '00000000-0000-0000-0000-000000000001', 3, 1200, 800,
  '[
    {"room_number":"301","x":50,"y":100,"w":80,"h":60,"zone":"east_wing"},
    {"room_number":"302","x":140,"y":100,"w":80,"h":60,"zone":"east_wing"},
    {"room_number":"303","x":230,"y":100,"w":80,"h":60,"zone":"east_wing"},
    {"room_number":"304","x":320,"y":100,"w":80,"h":60,"zone":"east_wing"},
    {"room_number":"305","x":50,"y":640,"w":80,"h":60,"zone":"west_wing"},
    {"room_number":"306","x":140,"y":640,"w":80,"h":60,"zone":"west_wing"},
    {"room_number":"307","x":230,"y":640,"w":80,"h":60,"zone":"west_wing"},
    {"room_number":"308","x":320,"y":640,"w":80,"h":60,"zone":"west_wing"},
    {"room_number":"309","x":800,"y":100,"w":80,"h":60,"zone":"north_wing"},
    {"room_number":"310","x":900,"y":100,"w":80,"h":60,"zone":"north_wing"},
    {"room_number":"311","x":1000,"y":100,"w":80,"h":60,"zone":"north_wing"},
    {"room_number":"312","x":800,"y":640,"w":80,"h":60,"zone":"south_wing"}
  ]',
  '[
    {"id":"exit_3a","label":"Stairwell A","x":600,"y":50,"type":"stairwell","accessible":true},
    {"id":"exit_3b","label":"Stairwell B","x":600,"y":750,"type":"stairwell","accessible":false},
    {"id":"exit_3c","label":"Fire Exit East","x":1150,"y":400,"type":"fire_exit","accessible":true}
  ]',
  '[
    {"id":"mp_car_park","label":"Car Park","location_description":"Car park Level B1 — main ramp entrance","x":600,"y":400}
  ]'
),
(
  '00000000-0000-0000-0000-000000000001', 1, 1200, 800,
  '[]',
  '[
    {"id":"exit_1_main","label":"Main Entrance","x":600,"y":750,"type":"main_entrance","accessible":true},
    {"id":"exit_1a","label":"Stairwell A","x":300,"y":400,"type":"stairwell","accessible":true},
    {"id":"exit_1b","label":"Stairwell B","x":900,"y":400,"type":"stairwell","accessible":false}
  ]',
  '[
    {"id":"mp_car_park","label":"Car Park","location_description":"Car park Level B1","x":600,"y":900}
  ]'
);

-- ─── Exit Routes ──────────────────────────────────────────────────────────────
-- Floor 3, East Wing rooms → Stairwell A
insert into exit_routes (hotel_id, floor, zone, room, path_coordinates, muster_point, estimated_time_seconds, is_accessible, uses_elevator, label, label_translations) values
(
  '00000000-0000-0000-0000-000000000001', 3, 'east_wing', null,
  '[
    {"x":50,"y":50,"instruction":"Exit your room and turn right"},
    {"x":50,"y":30,"instruction":"Walk toward the centre corridor"},
    {"x":50,"y":5,"instruction":"Stairwell A is on your left — use it to descend to Ground floor"},
    {"x":50,"y":95,"instruction":"Exit to Car Park Level B1"}
  ]',
  '{"id":"mp_car_park","label":"Car Park B1","location_description":"Car park Level B1 — main ramp entrance","x":50,"y":95}',
  90, true, false,
  'Use Stairwell A (centre of floor) → descend to Ground → exit to Car Park Level B1',
  '{"hi":"सीढ़ी A का उपयोग करें → भूतल पर उतरें → कार पार्क B1 से बाहर जाएं", "ar":"استخدم السلم أ → انزل إلى الطابق الأرضي → اخرج إلى موقف السيارات B1", "zh":"使用楼梯A → 下至底层 → 从B1停车场出口离开", "es":"Use la Escalera A → baje al Piso Planta → salga al Estacionamiento Nivel B1"}'
),
(
  '00000000-0000-0000-0000-000000000001', 3, 'west_wing', null,
  '[
    {"x":25,"y":80,"instruction":"Exit room and turn left toward corridor"},
    {"x":50,"y":80,"instruction":"Walk to centre — Stairwell A on your right"},
    {"x":50,"y":5,"instruction":"Descend all floors"},
    {"x":50,"y":95,"instruction":"Exit to Car Park Level B1"}
  ]',
  '{"id":"mp_car_park","label":"Car Park B1","location_description":"Car park Level B1 — main ramp entrance","x":50,"y":95}',
  100, true, false,
  'Use Stairwell A → descend to Ground → Car Park Level B1',
  '{"hi":"सीढ़ी A का उपयोग करें → भूतल तक जाएं → कार पार्क B1", "ar":"استخدم السلم أ → انزل إلى الأرضي → B1", "zh":"楼梯A → 底层 → 停车场B1", "es":"Escalera A → Planta → Estacionamiento B1"}'
),
(
  '00000000-0000-0000-0000-000000000001', 3, 'east_wing', '312',
  '[
    {"x":67,"y":80,"instruction":"Exit Room 312 and turn left"},
    {"x":50,"y":80,"instruction":"Walk to Stairwell A at centre"},
    {"x":50,"y":5,"instruction":"Descend to Ground floor"},
    {"x":50,"y":95,"instruction":"Exit building to Car Park Level B1"}
  ]',
  '{"id":"mp_car_park","label":"Car Park B1","location_description":"Car park Level B1 — main ramp entrance","x":50,"y":95}',
  85, true, false,
  'Exit 312 → turn left → Stairwell A → Ground floor → Car Park B1',
  '{"hi":"कमरा 312 से बाहर → बाएं मुड़ें → सीढ़ी A → भूतल → कार पार्क B1", "ar":"اخرج من 312 → يسار → السلم أ → الأرضي → موقف B1"}'
);

-- ─── Sensors ──────────────────────────────────────────────────────────────────
insert into sensors (id, hotel_id, type, floor, zone, room, threshold, is_active) values
('sensor_f3_east_corridor', '00000000-0000-0000-0000-000000000001', 'smoke', 3, 'east_wing', null, 400, true),
('sensor_f3_west_corridor', '00000000-0000-0000-0000-000000000001', 'smoke', 3, 'west_wing', null, 400, true),
('sensor_f3_kitchen', '00000000-0000-0000-0000-000000000001', 'heat', 1, 'kitchen', null, 80, true),
('sensor_f2_east', '00000000-0000-0000-0000-000000000001', 'smoke', 2, 'east_wing', null, 400, true),
('sensor_f1_lobby', '00000000-0000-0000-0000-000000000001', 'smoke', 1, 'lobby', null, 400, true),
('sensor_gas_kitchen', '00000000-0000-0000-0000-000000000001', 'gas', 1, 'kitchen', null, 100, true);

-- ─── Demo Guest Locations (Floor 3) ──────────────────────────────────────────
insert into guest_locations (hotel_id, guest_name, room_number, floor, zone, language, needs_accessibility_assistance, location_source) values
('00000000-0000-0000-0000-000000000001', 'Priya Sharma', '301', 3, 'east_wing', 'hi', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Mohammed Al-Rashid', '302', 3, 'east_wing', 'ar', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Wei Zhang', '303', 3, 'east_wing', 'zh', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Sarah Johnson', '304', 3, 'east_wing', 'en', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Roberto García', '305', 3, 'west_wing', 'es', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Yuki Tanaka', '306', 3, 'west_wing', 'ja', true, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Elena Petrov', '307', 3, 'west_wing', 'ru', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Arjun Patel', '308', 3, 'west_wing', 'hi', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Claire Dubois', '309', 3, 'north_wing', 'fr', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Ahmed Hassan', '310', 3, 'north_wing', 'ar', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'Lisa Mueller', '311', 3, 'north_wing', 'de', false, 'check_in'),
('00000000-0000-0000-0000-000000000001', 'James Wilson', '312', 3, 'south_wing', 'en', true, 'check_in');

-- ─── Protocols ────────────────────────────────────────────────────────────────
insert into protocols (id, incident_type, title, steps) values
('fire_evacuation_v1', 'fire',
 'Fire Evacuation Protocol',
 '[
   {"step":1,"text":"Sound fire alarm immediately if not already activated"},
   {"step":2,"text":"Call 101 (Fire Department) — give hotel name, floor, and room"},
   {"step":3,"text":"Do NOT use elevators — use stairwells only"},
   {"step":4,"text":"Assist guests with mobility issues to evacuation chairs on stairwell landings"},
   {"step":5,"text":"Sweep assigned rooms — knock loudly, call out, do not enter smoke-filled areas"},
   {"step":6,"text":"Proceed to muster point: Car Park Level B1"},
   {"step":7,"text":"Report headcount to duty manager at muster point"}
 ]'
),
('medical_response_v1', 'medical',
 'Medical Emergency Protocol',
 '[
   {"step":1,"text":"Call 108 (Ambulance) immediately"},
   {"step":2,"text":"Send trained first-aider to location — do not move patient"},
   {"step":3,"text":"Retrieve AED from Floor 1 lobby (left of reception desk)"},
   {"step":4,"text":"Clear area — ask bystanders to move back"},
   {"step":5,"text":"Ensure elevator is held at incident floor for ambulance crew"},
   {"step":6,"text":"Meet ambulance at main entrance and escort to patient"}
 ]'
),
('security_threat_v1', 'security',
 'Security Threat Protocol',
 '[
   {"step":1,"text":"DO NOT ANNOUNCE on PA — use staff app only"},
   {"step":2,"text":"Call 100 (Police) immediately — give exact location"},
   {"step":3,"text":"Lock down: secure stairwells B and C, restrict elevator access"},
   {"step":4,"text":"Shelter-in-place: instruct guests via app to lock doors and stay put"},
   {"step":5,"text":"Security team to positions: lobby, car park entrance, service entrance"},
   {"step":6,"text":"Do not confront threat — observe and report to police"}
 ]'
);
