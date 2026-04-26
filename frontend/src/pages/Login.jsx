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
      setStatus({ type: 'success', text: `Welcome, ${profile.name}!` });
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'Failed to seed demo data' });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#04080f] flex items-center justify-center relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-red-600/4 blur-3xl pointer-events-none" />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.015]"
        style={{backgroundImage:'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)', backgroundSize: '48px 48px'}}
      />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        {/* Card */}
        <div className="bg-[#0c1325]/90 border border-white/8 backdrop-blur-xl rounded-3xl p-10 text-center shadow-2xl">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 text-4xl mb-6 shadow-lg shadow-red-500/10">
            🚨
          </div>
          
          <h1 className="text-3xl font-bold mb-1 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent tracking-tight">
            NexAlert
          </h1>
          <p className="text-slate-500 text-sm mb-8 font-medium tracking-wide uppercase">
            Crisis Command Center
          </p>

          {/* Demo button */}
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] text-base"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Setting up demo…
              </>
            ) : (
              <>
                <span>⚡</span>
                Launch Manager Mode
              </>
            )}
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[11px] text-slate-600 font-semibold tracking-widest uppercase">Hackathon Demo</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Auto-creates a hotel with 3 staff, 10 guests, 8 sensors, geofences, and escalation policies. No Firebase login required.
          </p>

          {status && (
            <div className={`mt-5 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
              status.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <span>{status.type === 'success' ? '✅' : '❌'}</span>
              {status.text}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-slate-700 text-xs mt-6">
          Hotel emergency management platform
        </p>
      </div>
    </div>
  );
}
