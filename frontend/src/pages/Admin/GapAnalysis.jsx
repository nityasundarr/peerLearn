import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import AdminLayout from './AdminLayout';

const GAP_COLORS = {
  shortage: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', badge: '#fee2e2', badgeText: '#991b1b' },
  surplus:  { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#dcfce7', badgeText: '#166534' },
  balanced: { bg: '#f0f9ff', border: '#7dd3fc', text: '#075985', badge: '#e0f2fe', badgeText: '#0369a1' },
};

const GapCard = ({ gap }) => {
  const style = GAP_COLORS[gap.label] || GAP_COLORS.balanced;
  const maxBar = Math.max(gap.demand, gap.supply, 1);
  return (
    <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: '12px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: '700', color: style.text }}>{gap.subject}</span>
        <span style={{ fontSize: '11px', fontWeight: '700', background: style.badge, color: style.badgeText, padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>
          {gap.label}
        </span>
      </div>
      {/* Supply vs demand mini bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#78716c', marginBottom: '4px' }}>
          <span>Demand: {gap.demand}</span>
          <span>Supply: {gap.supply}</span>
        </div>
        <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
          <div style={{ height: '100%', width: `${(gap.demand / maxBar) * 100}%`, background: '#f59e0b', borderRadius: '3px' }} />
        </div>
        <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(gap.supply / maxBar) * 100}%`, background: '#34d399', borderRadius: '3px' }} />
        </div>
        <div style={{ display: 'flex', gap: '14px', marginTop: '5px' }}>
          <span style={{ fontSize: '10px', color: '#78716c' }}>🟡 Demand</span>
          <span style={{ fontSize: '10px', color: '#78716c' }}>🟢 Supply</span>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: style.text, fontWeight: '600' }}>
        Shortage: {gap.shortage_pct.toFixed(1)}%
      </div>
    </div>
  );
};

const TODAY = new Date().toISOString().slice(0, 10);
const THIRTY_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const GapAnalysis = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(THIRTY_AGO);
  const [endDate, setEndDate] = useState(TODAY);
  const [filterLabel, setFilterLabel] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/admin/analytics/gaps', { params: { start_date: startDate, end_date: endDate } })
      .then(({ data: d }) => setData(d))
      .catch((err) => {
        if (err.response?.status === 403) navigate('/dashboard');
        else setError(err.response?.data?.detail ?? 'Failed to load gap analysis');
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, navigate]);

  useEffect(() => { load(); }, [load]);

  const visibleGaps = data
    ? (filterLabel === 'all' ? data.gaps : data.gaps.filter((g) => g.label === filterLabel))
    : [];

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '700', color: '#1c1917' }}>Gap Analysis</h1>
            <p style={{ margin: 0, color: '#78716c', fontSize: '14px' }}>Identify subject shortages and surpluses between demand and supply</p>
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
            {/* Critical gaps banner */}
            {data.critical_gaps.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>🚨 Critical Gaps ({data.critical_gaps.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.critical_gaps.map((g, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#7f1d1d', minWidth: '100px' }}>{g.subject}</span>
                      <span style={{ fontSize: '13px', color: '#7f1d1d' }}>{g.description}</span>
                      <span style={{ fontSize: '12px', color: '#ef4444', marginLeft: 'auto', whiteSpace: 'nowrap' }}>shortfall: {g.shortfall}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div style={{ background: '#f0faf5', border: '1px solid #a7f3d0', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#065f46' }}>💡 Recommendations</h2>
                <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.recommendations.map((r, i) => (
                    <li key={i} style={{ fontSize: '13px', color: '#065f46' }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {['all', 'shortage', 'balanced', 'surplus'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilterLabel(f)}
                  style={{
                    padding: '7px 16px',
                    background: filterLabel === f ? '#1a5f4a' : '#fff',
                    color: filterLabel === f ? '#fff' : '#57534e',
                    border: '1px solid ' + (filterLabel === f ? '#1a5f4a' : '#e7e5e4'),
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: filterLabel === f ? '600' : '400',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {f === 'all' ? `All (${data.gaps.length})` : f}
                </button>
              ))}
            </div>

            {/* Gap cards grid */}
            {visibleGaps.length === 0
              ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No gaps found for this filter.</p>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                  {visibleGaps.map((g) => <GapCard key={g.subject} gap={g} />)}
                </div>
              )
            }
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default GapAnalysis;
