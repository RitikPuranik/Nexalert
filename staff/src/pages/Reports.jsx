import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, INCIDENT_ICONS, SEVERITY_LABELS } from '../lib/utils.js';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null);
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/api/reports');
      setReports(Array.isArray(data) ? data : []);
    } catch { setReports([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generateReport(type) {
    setGenerating(type);
    try {
      const data = await api.post('/api/reports/generate', { type });
      setReports(p => [data, ...p]);
      setSelected(data);
    } catch(e) { alert(e.message); }
    setGenerating(null);
  }

  const REPORT_TYPES = [
    { type:'incident_summary', label:'Incident Summary', icon:'📋', desc:'Full summary of all incidents this period' },
    { type:'response_times',   label:'Response Times',  icon:'⏱',  desc:'Staff response time analytics' },
    { type:'sensor_health',    label:'Sensor Health',   icon:'📡',  desc:'Sensor uptime and alarm frequency' },
    { type:'guest_safety',     label:'Guest Safety',    icon:'👥',  desc:'Guest responses and evacuation stats' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Reports</h1>
        <p className="text-slate-600 text-xs mt-0.5">AI-generated incident and safety reports</p>
      </div>

      {/* Generate */}
      <div className="glass rounded-2xl p-5">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Generate New Report</p>
        <div className="grid grid-cols-2 gap-3">
          {REPORT_TYPES.map(({ type, label, icon, desc }) => (
            <button key={type} onClick={() => generateReport(type)} disabled={!!generating}
              className="flex items-start gap-3 p-4 bg-white/3 hover:bg-white/6 border border-white/8 hover:border-white/15 rounded-xl text-left transition-all disabled:opacity-50 group">
              <span className="text-xl shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm">{label}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
              </div>
              {generating === type && (
                <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin shrink-0 ml-auto mt-0.5"/>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        {/* Report list */}
        <div className="glass rounded-2xl">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="font-semibold text-white text-sm">Generated Reports</p>
          </div>
          <div className="divide-y divide-white/4 max-h-[600px] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-sm">No reports yet</div>
            ) : reports.map(r => (
              <div key={r._id}
                onClick={() => setSelected(r)}
                className={`px-5 py-4 cursor-pointer transition-all ${selected?._id===r._id?'bg-indigo-500/8 border-l-2 border-indigo-500':'hover:bg-white/3'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{REPORT_TYPES.find(t=>t.type===r.type)?.icon||'📄'}</span>
                  <span className="text-sm font-semibold text-white capitalize">{r.type?.replace(/_/g,' ')}</span>
                </div>
                <p className="text-[10px] text-slate-600">{formatDateTime(r.createdAt)}</p>
                {r.incident_count != null && (
                  <p className="text-[10px] text-slate-700 mt-0.5">{r.incident_count} incidents covered</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Report content */}
        <div className="glass rounded-2xl overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="text-3xl">📄</div>
              <p className="text-slate-600 text-sm">Select a report to view</p>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white capitalize">{selected.type?.replace(/_/g,' ')}</h3>
                  <p className="text-xs text-slate-600">{formatDateTime(selected.createdAt)}</p>
                </div>
                {selected.period && (
                  <span className="text-[10px] text-slate-600 font-mono">Period: {selected.period}</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {selected.summary && (
                  <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-4 mb-5">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Summary</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{selected.summary}</p>
                  </div>
                )}

                {selected.content && (
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selected.content}
                  </div>
                )}

                {selected.incidents && selected.incidents.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Incidents Covered</p>
                    <div className="space-y-2">
                      {selected.incidents.map((inc, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-white/3 border border-white/6 rounded-xl">
                          <span className="text-base">{INCIDENT_ICONS[inc.type]||'❓'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white capitalize">{inc.type?.replace(/_/g,' ')} — Floor {inc.floor}</p>
                            <p className="text-[10px] text-slate-600">{formatDateTime(inc.createdAt)}</p>
                          </div>
                          {inc.severity && (
                            <span className="text-[9px] font-bold text-slate-400">{SEVERITY_LABELS[inc.severity]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.metrics && (
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {Object.entries(selected.metrics).map(([k, v]) => (
                      <div key={k} className="bg-white/3 border border-white/6 rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 capitalize mb-1">{k.replace(/_/g,' ')}</p>
                        <p className="text-lg font-bold text-white">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
