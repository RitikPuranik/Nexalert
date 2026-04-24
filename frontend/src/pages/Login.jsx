import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
  const { loginDemo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleDemoLogin() {
    setLoading(true);
    setStatus(null);
    try {
      const profile = await loginDemo();
      setStatus({ type: 'success', text: `Welcome, ${profile.name}! Redirecting…` });
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'Failed to seed demo data' });
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card glass">
        <div className="login-logo">🚨</div>
        <h1 className="login-title">NexAlert</h1>
        <p className="login-subtitle">Crisis Command Dashboard</p>

        <button
          className="login-btn login-btn-primary"
          onClick={handleDemoLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              Setting up demo…
            </>
          ) : (
            <>⚡ Launch Demo Mode</>
          )}
        </button>

        <div className="login-divider">HACKATHON DEMO</div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Auto-creates a hotel with 3 staff, 10 guests, 8 sensors, geofences, and escalation policies.
          No Firebase login required.
        </p>

        {status && (
          <div className={`login-status ${status.type}`}>
            {status.type === 'success' ? '✅ ' : '❌ '}{status.text}
          </div>
        )}
      </div>
    </div>
  );
}
