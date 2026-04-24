import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export default function Health() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadHealth = useCallback(async () => {
    try {
      // Deep health uses cron secret header
      const data = await api('/api/system/health/deep', {
        headers: { 'x-cron-secret': 'b932e5d481af657c68b60e6fcfa06d03d4d16bbd16316b165263596fc9ad6d87' },
      });
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadHealth]);

  function statusColor(status) {
    if (status === 'ok') return 'var(--success)';
    if (status === 'error') return 'var(--danger)';
    if (status === 'degraded') return 'var(--warning)';
    return 'var(--text-muted)';
  }

  if (loading) return <div className="loading-page"><div className="loading-spinner" /><span>Checking systems…</span></div>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>System Health</h1>
          <p>Deep diagnostic across all subsystems</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-sm" onClick={loadHealth}>🔄 Refresh</button>
          <button className={`btn btn-sm ${autoRefresh ? 'btn-primary' : ''}`} onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '⏸ Auto-refresh ON' : '▶ Auto-refresh OFF'}
          </button>
        </div>
      </div>

      {error && !health && (
        <div className="glass" style={{ padding: 24, marginBottom: 20, borderColor: 'rgba(239,68,68,0.3)' }}>
          <p style={{ color: 'var(--danger)' }}>❌ Health check failed: {error}</p>
        </div>
      )}

      {health && (
        <>
          {/* Overall Status */}
          <div className="glass" style={{
            padding: '28px 32px', marginBottom: 24, borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderColor: health.status === 'healthy' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 'var(--radius-full)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem',
                background: health.status === 'healthy' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
              }}>
                {health.status === 'healthy' ? '💚' : '⚠️'}
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.5px',
                  color: health.status === 'healthy' ? 'var(--success)' : 'var(--warning)',
                }}>
                  {health.status?.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  NexAlert API v{health.version} · Check took {health.check_duration_ms}ms
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Last checked: {new Date(health.timestamp).toLocaleTimeString()}
            </div>
          </div>

          {/* Health Cards Grid */}
          <div className="health-grid">
            {/* MongoDB */}
            {health.checks?.mongodb && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title">
                    <span>🍃</span> MongoDB
                  </div>
                  <div className={`health-status-dot ${health.checks.mongodb.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Status</span>
                  <span className="health-card-detail-value" style={{ color: statusColor(health.checks.mongodb.status) }}>
                    {health.checks.mongodb.status?.toUpperCase()}
                  </span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Latency</span>
                  <span className="health-card-detail-value">{health.checks.mongodb.latency_ms}ms</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">State</span>
                  <span className="health-card-detail-value">{health.checks.mongodb.state}</span>
                </div>
              </div>
            )}

            {/* Gemini */}
            {health.checks?.gemini && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>🧠</span> Gemini AI</div>
                  <div className={`health-status-dot ${health.checks.gemini.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Status</span>
                  <span className="health-card-detail-value" style={{ color: statusColor(health.checks.gemini.status) }}>
                    {health.checks.gemini.status?.toUpperCase()}
                  </span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Latency</span>
                  <span className="health-card-detail-value">{health.checks.gemini.latency_ms}ms</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Response</span>
                  <span className="health-card-detail-value">{health.checks.gemini.response || '—'}</span>
                </div>
              </div>
            )}

            {/* Twilio */}
            {health.checks?.twilio && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>📱</span> Twilio SMS</div>
                  <div className={`health-status-dot ${health.checks.twilio.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Status</span>
                  <span className="health-card-detail-value" style={{ color: statusColor(health.checks.twilio.status) }}>
                    {health.checks.twilio.status?.toUpperCase()}
                  </span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Account</span>
                  <span className="health-card-detail-value">{health.checks.twilio.account_name || '—'}</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Account Status</span>
                  <span className="health-card-detail-value">{health.checks.twilio.account_status || '—'}</span>
                </div>
              </div>
            )}

            {/* SSE */}
            {health.checks?.sse && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>📡</span> SSE Stream</div>
                  <div className={`health-status-dot ${health.checks.sse.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Connections</span>
                  <span className="health-card-detail-value">{health.checks.sse.connections}</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Hotels Streaming</span>
                  <span className="health-card-detail-value">{health.checks.sse.hotels_streaming}</span>
                </div>
              </div>
            )}

            {/* Socket.IO */}
            {health.checks?.socketio && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>🔌</span> Socket.IO</div>
                  <div className={`health-status-dot ${health.checks.socketio.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Connections</span>
                  <span className="health-card-detail-value">{health.checks.socketio.connections}</span>
                </div>
              </div>
            )}

            {/* Memory */}
            {health.checks?.memory && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>💾</span> Memory</div>
                  <div className={`health-status-dot ${health.checks.memory.status || 'ok'}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">RSS</span>
                  <span className="health-card-detail-value">{health.checks.memory.rss_mb} MB</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Heap Used</span>
                  <span className="health-card-detail-value">{health.checks.memory.heap_used_mb} MB</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Heap Total</span>
                  <span className="health-card-detail-value">{health.checks.memory.heap_total_mb} MB</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{
                      width: `${Math.min(100, (health.checks.memory.heap_used_mb / health.checks.memory.heap_total_mb) * 100)}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {Math.round((health.checks.memory.heap_used_mb / health.checks.memory.heap_total_mb) * 100)}% heap utilization
                  </div>
                </div>
              </div>
            )}

            {/* Incidents */}
            {health.checks?.incidents && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>🚨</span> Incidents</div>
                  <div className={`health-status-dot ${health.checks.incidents.status}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Active</span>
                  <span className="health-card-detail-value" style={{
                    color: health.checks.incidents.active > 0 ? 'var(--danger)' : 'var(--success)',
                  }}>
                    {health.checks.incidents.active}
                  </span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Total (all time)</span>
                  <span className="health-card-detail-value">{health.checks.incidents.total}</span>
                </div>
              </div>
            )}

            {/* Uptime */}
            {health.checks?.uptime && (
              <div className="health-card glass">
                <div className="health-card-header">
                  <div className="health-card-title"><span>⏱️</span> Uptime</div>
                  <div className={`health-status-dot ${health.checks.uptime.status || 'ok'}`} />
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Process Uptime</span>
                  <span className="health-card-detail-value">
                    {Math.floor(health.checks.uptime.process_seconds / 60)}m {health.checks.uptime.process_seconds % 60}s
                  </span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Node Version</span>
                  <span className="health-card-detail-value">{health.checks.uptime.node_version}</span>
                </div>
                <div className="health-card-detail">
                  <span className="health-card-detail-label">Platform</span>
                  <span className="health-card-detail-value">{health.checks.uptime.platform}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
