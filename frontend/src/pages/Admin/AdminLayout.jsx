import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';

const getInitials = (name) =>
  (name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const NAV_ITEMS = [
  { path: '/admin/overview',  label: 'Overview',         icon: '📊' },
  { path: '/admin/demand',    label: 'Demand Analytics', icon: '📈' },
  { path: '/admin/supply',    label: 'Supply Analytics', icon: '👨‍🏫' },
  { path: '/admin/gaps',      label: 'Gap Analysis',     icon: '🔍' },
];

const AdminLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [hoverItem, setHoverItem] = useState(null);
  const [hoverDash, setHoverDash] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '64px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>P</div>
          <span style={{ color: '#fff', fontSize: '20px', fontWeight: '700' }}>PeerLearn</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', margin: '0 6px' }}>|</span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: '500' }}>Admin Console</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            onMouseEnter={() => setHoverDash(true)}
            onMouseLeave={() => setHoverDash(false)}
            style={{ background: hoverDash ? '#f0faf5' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '8px', color: hoverDash ? '#1a5f4a' : '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🏠 User Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', padding: '5px 12px 5px 5px', borderRadius: '8px' }}>
            <div style={{ width: '28px', height: '28px', background: '#f59e0b', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>{getInitials(user?.full_name)}</div>
            <span style={{ color: '#fff', fontSize: '13px' }}>{user?.full_name || 'Admin'}</span>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside style={{ width: '220px', background: '#fff', borderRight: '1px solid #e7e5e4', padding: '24px 0', flexShrink: 0 }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#a8a29e', letterSpacing: '0.08em', padding: '0 20px', marginBottom: '8px', textTransform: 'uppercase' }}>Analytics</p>
          {NAV_ITEMS.map(({ path, label, icon }) => {
            const active = location.pathname === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                onMouseEnter={() => setHoverItem(path)}
                onMouseLeave={() => setHoverItem(null)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 20px',
                  background: active ? '#f0faf5' : (hoverItem === path ? '#fafaf9' : 'transparent'),
                  border: 'none',
                  borderLeft: active ? '3px solid #1a5f4a' : '3px solid transparent',
                  color: active ? '#1a5f4a' : '#57534e',
                  fontSize: '14px',
                  fontWeight: active ? '600' : '400',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
