import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';

export default function Login() {
  const { login, error: authError } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [localErr, setLocalErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalErr('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setLocalErr(err.message);
    }
    setLoading(false);
  }

  const err = localErr || authError;

  return (
    <div className="min-h-screen bg-void-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Atmospheric background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-red-900/8 blur-3xl"/>
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-indigo-900/8 blur-3xl"/>
        <div className="absolute inset-0 opacity-[0.012]" style={{backgroundImage:'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',backgroundSize:'60px 60px'}}/>
      </div>

      <div className="relative z-10 w-full max-w-[380px]">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/15 text-3xl mb-5">
            🚨
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">NexAlert</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Staff Command Center</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-8">
          <p className="text-slate-400 text-sm font-medium mb-6">Sign in with your hotel staff credentials</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/3 border border-white/8 hover:border-white/15 focus:border-indigo-500/50 focus:outline-none text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm transition-colors"
                placeholder="manager@hotel.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Password</label>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-white/3 border border-white/8 hover:border-white/15 focus:border-indigo-500/50 focus:outline-none text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm transition-colors"
                placeholder="••••••••"
              />
            </div>

            {err && (
              <div className="bg-red-500/8 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {err}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/> Signing in…</>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="mt-6 p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
          <p className="text-xs text-amber-400/80 font-medium">
            🔑 <strong>Setup:</strong> Create your Firebase project, enable Email/Password auth, 
            create a staff account, then run <code className="text-amber-300 font-mono">POST /api/staff/register</code> 
            to link your Firebase UID to a hotel profile.
          </p>
        </div>

        <p className="text-center text-slate-700 text-xs mt-6">Hotel Emergency Management Platform</p>
      </div>
    </div>
  );
}
