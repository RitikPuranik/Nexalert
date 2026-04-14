/**
 * QR Emergency Page — GET /api/sos/[hotel_id]
 *
 * Lightweight HTML page served when a guest scans a QR code in their room.
 * No app install required. No login. Just scan and survive.
 *
 * Features:
 *   - Current emergency status for the hotel/floor
 *   - "I need help" / "I'm safe" response buttons
 *   - Dead man's switch button
 *   - Personalized exit route in guest's language
 *   - Guest self-registration
 */

import { NextRequest } from 'next/server'
import { adminDb } from '@/core/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ hotel_id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { hotel_id: hotelId } = await params
  const { searchParams } = new URL(req.url)
  const room = searchParams.get('room') ?? ''
  const floor = searchParams.get('floor') ?? ''
  const zone = searchParams.get('zone') ?? 'main'
  const lang = searchParams.get('lang') ?? 'en'

  // Fetch hotel info
  const { data: hotel } = await adminDb
    .from('hotels')
    .select('name, address, total_floors')
    .eq('id', hotelId)
    .single()

  const hotelName = hotel?.name ?? 'Hotel'

  // Check for active incidents on this floor
  let activeIncident = null
  if (floor) {
    const { data: incident } = await adminDb
      .from('incidents')
      .select('id, type, severity, status, floor, zone, ai_guest_alert_en, ai_guest_alert_translations')
      .eq('hotel_id', hotelId)
      .eq('floor', parseInt(floor))
      .in('status', ['detecting', 'triaging', 'active', 'investigating'])
      .limit(1)
      .single()
    activeIncident = incident
  }

  const alertText = activeIncident
    ? ((activeIncident.ai_guest_alert_translations as Record<string, string> | null)?.[lang]
      ?? activeIncident.ai_guest_alert_en
      ?? 'Emergency detected. Follow evacuation procedures.')
    : null

  const i18n: Record<string, Record<string, string>> = {
    en: {
      title: 'Emergency Portal',
      welcome: `Welcome to ${hotelName}`,
      register: 'Register Your Stay',
      name_label: 'Your Name',
      lang_label: 'Your Language',
      accessibility_label: 'I need accessibility assistance',
      register_btn: 'Register',
      emergency_title: '🚨 ACTIVE EMERGENCY',
      no_emergency: '✅ No active emergency',
      no_emergency_desc: 'If you see smoke, smell gas, or feel unsafe, tap the SOS button below.',
      sos_btn: '🚨 REPORT EMERGENCY',
      safe_btn: "✅ I'm Safe",
      help_btn: '🆘 I Need Help',
      deadman_btn: "💓 I'm Still OK",
      deadman_info: 'Tap every 2 minutes so responders know you\'re safe.',
      phone_label: 'Phone (optional)',
      registering: 'Registering...',
      registered: '✅ Registered!',
    },
    hi: {
      title: 'आपातकालीन पोर्टल',
      welcome: `${hotelName} में आपका स्वागत है`,
      register: 'अपना ठहरना दर्ज करें',
      name_label: 'आपका नाम',
      lang_label: 'आपकी भाषा',
      accessibility_label: 'मुझे सुलभता सहायता चाहिए',
      register_btn: 'रजिस्टर करें',
      emergency_title: '🚨 सक्रिय आपातकाल',
      no_emergency: '✅ कोई आपातकाल नहीं',
      no_emergency_desc: 'अगर आप धुआं देखें, गैस महसूस करें, या असुरक्षित महसूस करें, तो नीचे SOS बटन दबाएं।',
      sos_btn: '🚨 आपातकाल रिपोर्ट करें',
      safe_btn: '✅ मैं सुरक्षित हूं',
      help_btn: '🆘 मुझे मदद चाहिए',
      deadman_btn: '💓 मैं ठीक हूं',
      deadman_info: 'हर 2 मिनट में दबाएं ताकि बचावकर्ता जानें कि आप सुरक्षित हैं।',
      phone_label: 'फोन (वैकल्पिक)',
      registering: 'रजिस्टर हो रहा है...',
      registered: '✅ रजिस्टर हो गया!',
    },
    es: {
      title: 'Portal de Emergencia',
      welcome: `Bienvenido a ${hotelName}`,
      register: 'Registre su Estancia',
      name_label: 'Su Nombre',
      lang_label: 'Su Idioma',
      accessibility_label: 'Necesito asistencia de accesibilidad',
      register_btn: 'Registrar',
      emergency_title: '🚨 EMERGENCIA ACTIVA',
      no_emergency: '✅ Sin emergencia activa',
      no_emergency_desc: 'Si ve humo, huele gas, o se siente inseguro, presione el botón SOS abajo.',
      sos_btn: '🚨 REPORTAR EMERGENCIA',
      safe_btn: '✅ Estoy Bien',
      help_btn: '🆘 Necesito Ayuda',
      deadman_btn: '💓 Sigo Bien',
      deadman_info: 'Pulse cada 2 minutos para confirmar que está bien.',
      phone_label: 'Teléfono (opcional)',
      registering: 'Registrando...',
      registered: '✅ ¡Registrado!',
    },
  }

  const t = i18n[lang] ?? i18n.en

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${['ar', 'he'].includes(lang) ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${t.title} — ${hotelName}</title>
  <meta name="description" content="Emergency response portal for ${hotelName}. Scan QR code for emergency info.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #fff;
      min-height: 100dvh; padding: 16px;
    }
    .container { max-width: 480px; margin: 0 auto; }
    h1 { font-size: 1.5rem; text-align: center; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #888; font-size: 0.85rem; margin-bottom: 20px; }
    .room-info {
      background: #1a1a2e; border-radius: 12px; padding: 16px;
      text-align: center; margin-bottom: 16px; border: 1px solid #333;
    }
    .room-info .room { font-size: 2rem; font-weight: 800; color: #60a5fa; }
    .room-info .floor { color: #888; font-size: 0.85rem; }

    /* Alert banner */
    .alert-banner {
      background: linear-gradient(135deg, #dc2626, #991b1b);
      border-radius: 12px; padding: 20px; margin-bottom: 16px;
      animation: pulse-border 2s infinite;
      border: 2px solid #ef4444;
    }
    .alert-banner h2 { font-size: 1.2rem; margin-bottom: 8px; }
    .alert-banner p { font-size: 0.9rem; line-height: 1.5; opacity: 0.9; }

    @keyframes pulse-border {
      0%, 100% { border-color: #ef4444; box-shadow: 0 0 20px rgba(239,68,68,0.3); }
      50% { border-color: #fbbf24; box-shadow: 0 0 40px rgba(239,68,68,0.6); }
    }

    .safe-banner {
      background: #064e3b; border: 1px solid #10b981;
      border-radius: 12px; padding: 20px; margin-bottom: 16px;
    }
    .safe-banner h2 { font-size: 1.1rem; color: #34d399; }
    .safe-banner p { font-size: 0.85rem; color: #a7f3d0; margin-top: 8px; }

    /* Buttons */
    .btn-group { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .btn {
      display: block; width: 100%; padding: 18px;
      border: none; border-radius: 12px;
      font-size: 1.1rem; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
      text-align: center;
    }
    .btn:active { transform: scale(0.97); }
    .btn-sos { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; }
    .btn-safe { background: linear-gradient(135deg, #059669, #047857); color: white; }
    .btn-help { background: linear-gradient(135deg, #d97706, #b45309); color: white; }
    .btn-deadman {
      background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white;
      animation: none; font-size: 1.3rem; padding: 24px;
    }
    .btn-deadman.active { animation: beat 1.5s infinite; }
    @keyframes beat {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }
    .btn-deadman .countdown { font-size: 0.9rem; font-weight: 400; margin-top: 4px; display: block; opacity: 0.8; }
    .btn-register { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }

    /* Registration form */
    .card {
      background: #1a1a2e; border-radius: 12px; padding: 20px;
      margin-bottom: 16px; border: 1px solid #333;
    }
    .card h3 { margin-bottom: 12px; font-size: 1rem; }
    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 0.8rem; color: #888; margin-bottom: 4px; }
    .field input, .field select {
      width: 100%; padding: 12px; border-radius: 8px;
      border: 1px solid #444; background: #0a0a0a; color: #fff;
      font-size: 1rem;
    }
    .field-checkbox { display: flex; align-items: center; gap: 8px; }
    .field-checkbox input { width: auto; }

    .status-msg {
      text-align: center; padding: 12px; border-radius: 8px;
      font-size: 0.9rem; margin-bottom: 12px; display: none;
    }
    .status-msg.show { display: block; }
    .status-msg.success { background: #064e3b; color: #34d399; }
    .status-msg.error { background: #450a0a; color: #fca5a5; }

    .powered { text-align: center; color: #555; font-size: 0.7rem; margin-top: 24px; padding-bottom: 24px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${t.title}</h1>
    <p class="subtitle">${t.welcome}</p>

    ${room ? `
    <div class="room-info">
      <div class="room">Room ${room}</div>
      <div class="floor">Floor ${floor} · Zone ${zone}</div>
    </div>
    ` : ''}

    <!-- Status Banner -->
    <div id="statusBanner">
      ${activeIncident ? `
      <div class="alert-banner">
        <h2>${t.emergency_title}</h2>
        <p>${alertText ?? ''}</p>
      </div>
      ` : `
      <div class="safe-banner">
        <h2>${t.no_emergency}</h2>
        <p>${t.no_emergency_desc}</p>
      </div>
      `}
    </div>

    <!-- Status Messages -->
    <div id="statusMsg" class="status-msg"></div>

    <!-- Emergency Response Buttons -->
    <div id="emergencyButtons" class="${activeIncident ? '' : 'hidden'}">
      <div class="btn-group">
        <button class="btn btn-safe" onclick="respond('safe')">${t.safe_btn}</button>
        <button class="btn btn-help" onclick="respond('needs_help')">${t.help_btn}</button>
      </div>
    </div>

    <!-- Deadman Switch -->
    <div id="deadmanSection" class="hidden">
      <button class="btn btn-deadman active" id="deadmanBtn" onclick="pingDeadman()">
        ${t.deadman_btn}
        <span class="countdown" id="deadmanCountdown"></span>
      </button>
      <p style="text-align:center;color:#888;font-size:0.75rem;margin-top:8px;">${t.deadman_info}</p>
    </div>

    <!-- SOS Button (when no active emergency) -->
    <div id="sosSection" class="${activeIncident ? 'hidden' : ''}" style="margin-bottom: 16px;">
      <button class="btn btn-sos" onclick="submitSOS()">${t.sos_btn}</button>
    </div>

    <!-- Guest Registration -->
    <div class="card" id="registerCard">
      <h3>${t.register}</h3>
      <div class="field">
        <label>${t.name_label}</label>
        <input type="text" id="guestName" placeholder="John Smith" maxlength="100">
      </div>
      <div class="field">
        <label>${t.lang_label}</label>
        <select id="guestLang">
          <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
          <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
          <option value="es" ${lang === 'es' ? 'selected' : ''}>Español</option>
          <option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option>
          <option value="zh" ${lang === 'zh' ? 'selected' : ''}>中文</option>
          <option value="ja" ${lang === 'ja' ? 'selected' : ''}>日本語</option>
          <option value="fr" ${lang === 'fr' ? 'selected' : ''}>Français</option>
          <option value="de" ${lang === 'de' ? 'selected' : ''}>Deutsch</option>
          <option value="ru" ${lang === 'ru' ? 'selected' : ''}>Русский</option>
          <option value="ko" ${lang === 'ko' ? 'selected' : ''}>한국어</option>
          <option value="pt" ${lang === 'pt' ? 'selected' : ''}>Português</option>
        </select>
      </div>
      <div class="field">
        <label>${t.phone_label}</label>
        <input type="tel" id="guestPhone" placeholder="+1 555-0100">
      </div>
      <div class="field field-checkbox">
        <input type="checkbox" id="guestAccessibility">
        <label for="guestAccessibility">${t.accessibility_label}</label>
      </div>
      <button class="btn btn-register" id="registerBtn" onclick="registerGuest()">${t.register_btn}</button>
    </div>

    <div class="powered">Powered by NexAlert · Emergency Response System</div>
  </div>

  <script>
    const CONFIG = {
      hotelId: '${hotelId}',
      room: '${room}',
      floor: ${floor ? parseInt(floor) : 0},
      zone: '${zone}',
      lang: '${lang}',
      incidentId: ${activeIncident ? `'${activeIncident.id}'` : 'null'},
      apiBase: '/api',
    };

    let deadmanToken = null;
    let deadmanInterval = 120;
    let deadmanTimer = null;
    let deadmanRemaining = 120;

    function showMsg(text, type) {
      const el = document.getElementById('statusMsg');
      el.textContent = text;
      el.className = 'status-msg show ' + type;
      setTimeout(() => { el.className = 'status-msg'; }, 5000);
    }

    async function registerGuest() {
      const btn = document.getElementById('registerBtn');
      const name = document.getElementById('guestName').value.trim();
      if (!name) { showMsg('Please enter your name', 'error'); return; }
      if (!CONFIG.room || !CONFIG.floor) { showMsg('Room info missing — scan the QR code in your room', 'error'); return; }

      btn.textContent = '${t.registering}';
      btn.disabled = true;

      try {
        const res = await fetch(CONFIG.apiBase + '/guests/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotel_id: CONFIG.hotelId,
            room: CONFIG.room,
            floor: CONFIG.floor,
            zone: CONFIG.zone,
            guest_name: name,
            language: document.getElementById('guestLang').value,
            phone: document.getElementById('guestPhone').value || null,
            needs_accessibility: document.getElementById('guestAccessibility').checked,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showMsg('${t.registered}', 'success');
          btn.textContent = '${t.registered}';
          document.getElementById('registerCard').style.opacity = '0.5';
        } else {
          showMsg(data.error || 'Registration failed', 'error');
          btn.textContent = '${t.register_btn}';
          btn.disabled = false;
        }
      } catch {
        showMsg('Network error — please try again', 'error');
        btn.textContent = '${t.register_btn}';
        btn.disabled = false;
      }
    }

    async function submitSOS() {
      if (!CONFIG.room || !CONFIG.floor) {
        showMsg('Room info missing — scan the QR code in your room', 'error');
        return;
      }
      try {
        const res = await fetch(CONFIG.apiBase + '/incidents/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotel_id: CONFIG.hotelId,
            type: 'fire',
            room: CONFIG.room,
            floor: CONFIG.floor,
            zone: CONFIG.zone,
            language: CONFIG.lang,
            guest_name: document.getElementById('guestName').value || 'Guest',
          }),
        });
        const data = await res.json();
        if (data.success) {
          CONFIG.incidentId = data.data.incident_id;
          showMsg('SOS received — help is on the way!', 'success');
          document.getElementById('sosSection').classList.add('hidden');
          document.getElementById('emergencyButtons').classList.remove('hidden');
          if (data.data.deadman_token) {
            startDeadman(data.data.deadman_token);
          }
          // Refresh alert banner
          document.getElementById('statusBanner').innerHTML = '<div class="alert-banner"><h2>${t.emergency_title}</h2><p>' + (data.data.alert_text || 'Emergency reported. Stay calm.') + '</p></div>';
        } else {
          showMsg(data.error || 'SOS failed', 'error');
        }
      } catch {
        showMsg('Network error — please try again', 'error');
      }
    }

    async function respond(response) {
      if (!CONFIG.incidentId || !CONFIG.room) return;
      try {
        const res = await fetch(CONFIG.apiBase + '/guests/locations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotel_id: CONFIG.hotelId,
            room: CONFIG.room,
            floor: CONFIG.floor,
            guest_response: response,
          }),
        });
        const data = await res.json();
        showMsg(response === 'safe' ? "✅ Thank you! You're marked as safe." : '🆘 Help is being dispatched to your room.', 'success');
      } catch {
        showMsg('Network error — please try again', 'error');
      }
    }

    function startDeadman(token) {
      deadmanToken = token;
      deadmanRemaining = deadmanInterval;
      document.getElementById('deadmanSection').classList.remove('hidden');
      updateDeadmanDisplay();
      deadmanTimer = setInterval(() => {
        deadmanRemaining--;
        updateDeadmanDisplay();
        if (deadmanRemaining <= 0) deadmanRemaining = 0;
      }, 1000);
    }

    function updateDeadmanDisplay() {
      const m = Math.floor(deadmanRemaining / 60);
      const s = deadmanRemaining % 60;
      document.getElementById('deadmanCountdown').textContent =
        deadmanRemaining > 0 ? m + ':' + String(s).padStart(2, '0') + ' remaining' : 'TAP NOW!';
    }

    async function pingDeadman() {
      if (!deadmanToken) return;
      try {
        const res = await fetch(CONFIG.apiBase + '/deadman/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_token: deadmanToken }),
        });
        const data = await res.json();
        if (data.success) {
          deadmanRemaining = data.data.seconds_remaining || deadmanInterval;
          showMsg("💓 Ping received — you're marked as OK!", 'success');
        }
      } catch {
        showMsg('Network error — please try again', 'error');
      }
    }

    // Auto-start deadman if incident is active and we have context
    ${activeIncident ? `
    // Poll for updates every 15s
    setInterval(async () => {
      try {
        const res = await fetch(CONFIG.apiBase + '/incidents/sos?incident_id=' + CONFIG.incidentId + '&room=' + CONFIG.room + '&lang=' + CONFIG.lang);
        const data = await res.json();
        if (data.success && data.data.status === 'resolved') {
          document.getElementById('statusBanner').innerHTML = '<div class="safe-banner"><h2>✅ All Clear</h2><p>The emergency has been resolved. You may resume normal activities.</p></div>';
          document.getElementById('emergencyButtons').classList.add('hidden');
          document.getElementById('deadmanSection').classList.add('hidden');
          if (deadmanTimer) clearInterval(deadmanTimer);
        }
      } catch {}
    }, 15000);
    ` : ''}
  </script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
