import { useState, useEffect } from 'react';
import { get } from '../lib/api';
import { formatDateTime } from '../lib/utils';

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [filter, setFilter] = useState('');

  const limit = 25;

  useEffect(() => {
    loadLogs();
  }, [page, filter]);

  async function loadLogs() {
    setLoading(true);
    try {
      const query = `/api/audit?page=${page}&limit=${limit}${filter ? `&action=${filter}` : ''}`;
      const data = await get(query);
      if (data.logs) {
        setLogs(data.logs);
        setTotal(data.total || data.logs.length);
      } else if (Array.isArray(data)) {
        setLogs(data);
        setTotal(data.length);
      }
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }

  async function verifyChain() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await get('/api/audit/verify');
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({ valid: false, error: err.message });
    }
    setVerifying(false);
  }

  const actions = ['incident:create', 'incident:triage', 'incident:confirm', 'incident:resolve',
    'incident:escalate_911', 'task:assign', 'task:update', 'guest:response', 'sensor:breach'];

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Audit Trail</h1>
          <p>Immutable, SHA-256 hash-chained forensic log</p>
        </div>
        <button className="btn btn-primary" onClick={verifyChain} disabled={verifying}>
          {verifying ? '⏳ Verifying…' : '🔐 Verify Hash Chain'}
        </button>
      </div>

      {/* Verification Result */}
      {verifyResult && (
        <div className="glass" style={{
          padding: '16px 24px', marginBottom: 20, borderRadius: 'var(--radius-md)',
          borderColor: verifyResult.valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem' }}>{verifyResult.valid ? '✅' : '❌'}</span>
            <div>
              <div style={{ fontWeight: 700, color: verifyResult.valid ? 'var(--success)' : 'var(--danger)' }}>
                {verifyResult.valid ? 'Hash Chain Verified — Integrity Confirmed' : 'Chain Broken — Tampering Detected'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {verifyResult.total_entries ?? 0} entries verified
                {verifyResult.broken_at && ` · Broken at entry #${verifyResult.broken_at}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filter === '' ? 'btn-primary' : ''}`} onClick={() => { setFilter(''); setPage(1); }}>
          All
        </button>
        {actions.map((a) => (
          <button key={a} className={`btn btn-sm ${filter === a ? 'btn-primary' : ''}`} onClick={() => { setFilter(a); setPage(1); }}>
            {a.replace(/:/g, ' → ')}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-page"><div className="loading-spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="empty-state glass" style={{ padding: 48, borderRadius: 'var(--radius-lg)' }}>
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-text">No audit entries found</p>
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>Details</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.createdAt || log.timestamp)}
                  </td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '0.7rem',
                      fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: 'var(--accent-light)',
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {log.actor || '—'}
                    {log.actorType && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                        {log.actorType}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {log.resourceType}
                    {log.resourceId && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{String(log.resourceId).slice(-8)}</span>}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.details || '—'}
                  </td>
                  <td style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-muted)', maxWidth: 100 }}>
                    {log.hash ? `${log.hash.slice(0, 8)}…` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
        </div>
      )}
    </div>
  );
}
