import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import AdminLayout from './AdminLayout';

const KPICard = ({ icon, label, value, sub, accent }) => (
  <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '28px' }}>{icon}</span>
      {sub && <span style={{ fontSize: '12px', color: '#a8a29e', background: '#f5f5f4', padding: '3px 10px', borderRadius: '20px' }}>{sub}</span>}
    </div>
    <div style={{ fontSize: '32px', fontWeight: '700', color: accent || '#1c1917' }}>{value}</div>
    <div style={{ fontSize: '13px', color: '#78716c' }}>{label}</div>
  </div>
);

const ACTIVITY_ICONS = { registration: '👤', session: '📅', complaint: '🚨' };

const Overview = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/overview')
      .then(({ data: d }) => setData(d))
      .catch((err) => {
        if (err.response?.status === 403) {
          navigate('/dashboard');
        } else {
          setError(err.response?.data?.detail ?? 'Failed to load overview');
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1100px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '700', color: '#1c1917' }}>Overview</h1>
        <p style={{ margin: '0 0 28px', color: '#78716c', fontSize: '14px' }}>Platform-wide KPIs and recent activity</p>

        {loading && <div style={{ color: '#a8a29e', padding: '48px', textAlign: 'center' }}>Loading…</div>}
        {error && <div style={{ color: '#ef4444', padding: '24px', textAlign: 'center' }}>{error}</div>}

        {data && (
          <>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <KPICard icon="👥" label="Total Users" value={data.kpis.total_users} />
              <KPICard icon="👨‍🏫" label="Active Tutors" value={data.kpis.active_tutors} accent="#1a5f4a" />
              <KPICard icon="📅" label="Sessions This Week" value={data.kpis.sessions_this_week} />
              <KPICard icon="⏳" label="Pending Requests" value={data.kpis.pending_requests} accent="#d97706" />
              <KPICard icon="⭐" label="Average Rating" value={data.kpis.avg_rating.toFixed(2)} sub="/ 5.0" accent="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Alerts */}
              {data.alerts.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #fca5a5', padding: '24px' }}>
                  <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#991b1b' }}>⚠️ Alerts</h2>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.alerts.map((a, i) => (
                      <li key={i} style={{ fontSize: '13px', color: '#7f1d1d' }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Top subjects */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📚 Top Subjects</h2>
                {data.top_subjects.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No data yet.</p>
                  : data.top_subjects.map((s, i) => (
                    <div key={s.subject} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < data.top_subjects.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#1c1917', fontWeight: '500' }}>{s.subject}</span>
                      <span style={{ fontSize: '13px', color: '#57534e', background: '#f0faf5', padding: '2px 10px', borderRadius: '20px' }}>{s.count}</span>
                    </div>
                  ))
                }
              </div>

              {/* Recent activity — full width */}
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px', gridColumn: '1 / -1' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>🕐 Recent Activity</h2>
                {data.recent_activity.length === 0
                  ? <p style={{ color: '#a8a29e', fontSize: '13px' }}>No recent activity.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {data.recent_activity.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < data.recent_activity.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                          <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>{ACTIVITY_ICONS[a.type] || '📌'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#1c1917' }}>{a.description}</p>
                          </div>
                          <span style={{ fontSize: '12px', color: '#a8a29e', whiteSpace: 'nowrap' }}>
                            {new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
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

export default Overview;
