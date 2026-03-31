import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import AdminLayout from './AdminLayout';

const BarRow = ({ label, value, max, color }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '13px', color: '#1c1917', fontWeight: '500' }}>{label}</span>
        <span style={{ fontSize: '13px', color: '#57534e' }}>{value}</span>
      </div>
      <div style={{ height: '8px', background: '#f5f5f4', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color || '#1a5f4a', borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
};

const WorkloadDonut = ({ bands }) => {
  const total = (bands.light + bands.balanced + bands.heavy) || 1;
  const segments = [
    { label: 'Light (<30%)', value: bands.light, color: '#34d399' },
    { label: 'Balanced (30–70%)', value: bands.balanced, color: '#f59e0b' },
    { label: 'Heavy (>70%)', value: bands.heavy, color: '#f87171' },
  ];
  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Stacked bar */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <div style={{ height: '20px', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
          {segments.map((s) => (
            <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color, transition: 'width 0.4s ease' }} />
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: s.color, borderRadius: '3px' }} />
            <span style={{ fontSize: '12px', color: '#57534e' }}>{s.label}: <strong>{s.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TODAY = new Date().toISOString().slice(0, 10);
const THIRTY_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const SupplyAnalytics = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(THIRTY_AGO);
  const [endDate, setEndDate] = useState(TODAY);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/admin/analytics/supply', { params: { start_date: startDate, end_date: endDate } })
      .then(({ data: d }) => setData(d))
      .catch((err) => {
        if (err.response?.status === 403) navigate('/dashboard');
        else setError(err.response?.data?.detail ?? 'Failed to load supply analytics');
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, navigate]);

  useEffect(() => { load(); }, [load]);

  const maxSubject = data ? Math.max(...data.tutors_by_subject.map((s) => s.count), 1) : 1;

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '700', color: '#1c1917' }}>Supply Analytics</h1>
            <p style={{ margin: 0, color: '#78716c', fontSize: '14px' }}>Tutor counts, workload distribution, and subject coverage</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e7e5e4' }}>
            <label style={{ fontSize: '13px', color: '#57534e' }}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{ border: '1px solid #e7e5e4', borderRadius: '8px', padding: '5px 10px', fontSize: '13px', outline: 'none' }} />
            <label style={{ fontSize: '13px', color: '#57534e' }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              style={{ border: '1px solid #e7e5e4', borderRadius: '8px', padding: '5px 10px', fontSize: '13px', outline: 'none' }} />
            <button type="button" onClick={load}
              style={{ background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              Apply
            </button>
          </div>
        </div>

        {loading && <div style={{ color: '#a8a29e', padding: '48px', textAlign: 'center' }}>Loading…</div>}
        {error && <div style={{ color: '#ef4444', padding: '24px', textAlign: 'center' }}>{error}</div>}

        {data && (
          <>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {[
                { icon: '👨‍🏫', label: 'Total Tutors', value: data.total_tutors },
                { icon: '✅', label: 'Active Tutors', value: data.active_tutors, accent: '#1a5f4a' },
                { icon: '📅', label: 'Avg Sessions / Tutor', value: data.avg_sessions_per_tutor.toFixed(1) },
                { icon: '⭐', label: 'Avg Rating', value: `${data.avg_rating.toFixed(2)} / 5`, accent: '#f59e0b' },
              ].map(({ icon, label, value, accent }) => (
                <div key={label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e7e5e4', padding: '18px 20px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{icon}</div>
                  <div style={{ fontSize: '26px', fontWeight: '700', color: accent || '#1c1917' }}>{value}</div>
                  <div style={{ fontSize: '12px', color: '#78716c' }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Workload bands */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px', gridColumn: '1 / -1' }}>
                <h2 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>⚖️ Tutor Workload Distribution</h2>
                <WorkloadDonut bands={data.workload_bands} />
              </div>

              {/* Tutors by subject */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px', gridColumn: '1 / -1' }}>
                <h2 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📚 Tutors by Subject</h2>
                {data.tutors_by_subject.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No data in range.</p>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 32px' }}>
                      {data.tutors_by_subject.map((s) => (
                        <BarRow key={s.subject} label={s.subject} value={s.count} max={maxSubject} color="#1a5f4a" />
                      ))}
                    </div>
                  )
                }
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default SupplyAnalytics;
