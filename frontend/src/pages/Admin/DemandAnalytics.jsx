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

const TODAY = new Date().toISOString().slice(0, 10);
const THIRTY_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const DemandAnalytics = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(THIRTY_AGO);
  const [endDate, setEndDate] = useState(TODAY);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/admin/analytics/demand', { params: { start_date: startDate, end_date: endDate } })
      .then(({ data: d }) => setData(d))
      .catch((err) => {
        if (err.response?.status === 403) navigate('/dashboard');
        else setError(err.response?.data?.detail ?? 'Failed to load demand analytics');
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, navigate]);

  useEffect(() => { load(); }, [load]);

  const maxSubject = data ? Math.max(...data.requests_by_subject.map((s) => s.count), 1) : 1;
  const maxTopic   = data ? Math.max(...data.trending_topics.map((t) => t.count), 1) : 1;
  const maxArea    = data ? Math.max(...data.by_planning_area.map((a) => a.count), 1) : 1;

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '700', color: '#1c1917' }}>Demand Analytics</h1>
            <p style={{ margin: 0, color: '#78716c', fontSize: '14px' }}>Tutoring requests by subject, topic, and area</p>
          </div>
          {/* Date filter */}
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
            {/* Summary badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f0faf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '10px 18px', marginBottom: '24px' }}>
              <span style={{ fontSize: '22px' }}>📋</span>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#065f46' }}>{data.total_requests} total requests</span>
              <span style={{ fontSize: '13px', color: '#6ee7b7' }}>·</span>
              <span style={{ fontSize: '13px', color: '#059669' }}>{data.start_date} → {data.end_date}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* By subject */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px' }}>
                <h2 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📚 Requests by Subject</h2>
                {data.requests_by_subject.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No data in range.</p>
                  : data.requests_by_subject.map((s) => (
                    <BarRow key={s.subject} label={s.subject} value={s.count} max={maxSubject} color="#1a5f4a" />
                  ))
                }
              </div>

              {/* Trending topics */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px' }}>
                <h2 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>🔥 Trending Topics</h2>
                {data.trending_topics.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No data in range.</p>
                  : data.trending_topics.map((t) => (
                    <BarRow key={t.topic} label={t.topic} value={t.count} max={maxTopic} color="#f59e0b" />
                  ))
                }
              </div>

              {/* By planning area — full width */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px', gridColumn: '1 / -1' }}>
                <h2 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📍 Requests by Planning Area</h2>
                {data.by_planning_area.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No data in range.</p>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 32px' }}>
                      {data.by_planning_area.map((a) => (
                        <BarRow key={a.area} label={a.area} value={a.count} max={maxArea} color="#6366f1" />
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

export default DemandAnalytics;
