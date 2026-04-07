import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';

import api from '../../services/api';
import PeerLearnLogo from '../../assets/PeerLearnLogo.svg';

const getInitials = (name) =>
  (name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const NAV_ITEMS = [
  { path: '/admin/overview',    label: 'Overview',         icon: '📊' },
  { path: '/admin/complaints',  label: 'Complaints',       icon: '🚨' },
  { path: '/admin/demand',      label: 'Demand Analytics', icon: '📈' },
  { path: '/admin/supply',      label: 'Supply Analytics', icon: '👨‍🏫' },
  { path: '/admin/gaps',        label: 'Gap Analysis',     icon: '🔍' },
];

const AdminLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [hoverItem, setHoverItem] = useState(null);
  const [hoverDash, setHoverDash] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifFilter, setNotifFilter] = useState('All');

  const ADMIN_NOTIF_FILTERS = [
    { label: 'All',       types: null },
    { label: 'Complaints', types: ['admin_complaint', 'admin_appeal'] },
    { label: 'System',    types: ['admin_alert', 'session_update'] },
  ];

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      const list = Array.isArray(data) ? data : (data.notifications || data.items || []);
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read && !n.read).length);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleDeleteNotif = async (e, notif) => {
    e.stopPropagation();
    const id = notif?.notification_id || notif?.id;
    setNotifications((prev) => prev.filter((n) => (n.notification_id || n.id) !== id));
    setUnreadCount((c) => (!notif.is_read && !notif.read) ? Math.max(0, c - 1) : c);
    try { await api.delete(`/notifications/${id}`); } catch { fetchNotifications(); }
  };

  const handleClearAllNotifs = async () => {
    setNotifications([]);
    setUnreadCount(0);
    try { await api.delete('/notifications'); } catch { fetchNotifications(); }
  };

  const handleNotifClick = async (notif) => {
    const id = notif?.notification_id || notif?.id;
    if (id) {
      try { await api.patch(`/notifications/${id}`, {}); } catch { /* silent */ }
      setNotifications((prev) => prev.map((n) =>
        (n.notification_id === id || n.id === id) ? { ...n, is_read: true } : n
      ));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Extract complaint_id from content if present
    const content = notif?.content || notif?.message || '';
    const match = content.match(/\[complaint:([^\]]+)\]/);
    if (match?.[1]) {
      navigate(`/admin/complaints/${match[1]}`);
    } else {
      navigate('/admin/complaints');
    }
    setNotifOpen(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '64px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={PeerLearnLogo}
            alt="PeerLearn"
            style={{ height: '36px', objectFit: 'contain' }}
          />
          <span style={{ color: 'rgba(255,255,255,0.5)', margin: '0 6px' }}>|</span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: '500' }}>Admin Console</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              style={{ position: 'relative', background: notifOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', border: 'none', width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', top: '48px', right: 0, width: '360px', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #e7e5e4', zIndex: 1000, maxHeight: '480px', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #f5f5f4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: '#1c1917' }}>Notifications</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {notifications.length > 0 && (
                      <button onClick={handleClearAllNotifs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', fontWeight: '500', padding: '2px 6px' }}>Clear all</button>
                    )}
                    <button onClick={() => setNotifOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', fontSize: '18px', lineHeight: 1 }}>×</button>
                  </div>
                </div>
                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', borderBottom: '1px solid #f5f5f4', flexShrink: 0 }}>
                  {ADMIN_NOTIF_FILTERS.map(({ label }) => {
                    const sel = notifFilter === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setNotifFilter(label)}
                        style={{ padding: '4px 12px', background: sel ? '#1a5f4a' : '#f5f5f4', color: sel ? '#fff' : '#57534e', border: 'none', borderRadius: '6px', fontWeight: '500', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                      >{label}</button>
                    );
                  })}
                </div>
                {/* List */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {(() => {
                    const filterDef = ADMIN_NOTIF_FILTERS.find((f) => f.label === notifFilter);
                    const visible = filterDef?.types
                      ? notifications.filter((n) => filterDef.types.includes(n.type || n.notification_type))
                      : notifications;
                    if (visible.length === 0) return (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#a8a29e', fontSize: '13px' }}>No notifications</div>
                    );
                    return visible.map((n) => {
                      const nid = n.notification_id || n.id;
                      const unread = !n.is_read && !n.read;
                      const cleanContent = (n.content || n.message || '').replace(/\[(complaint|record):[^\]]+\]/g, '').trim();
                      return (
                        <div
                          key={nid}
                          style={{ padding: '12px 14px', borderBottom: '1px solid #f5f5f4', display: 'flex', gap: '10px', alignItems: 'flex-start', background: unread ? '#f0fdf4' : '#fff', borderLeft: unread ? '3px solid #22c55e' : '3px solid transparent', transition: 'background 0.15s' }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleNotifClick(n)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleNotifClick(n); }}
                            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: unread ? '600' : '400', color: '#1c1917', marginBottom: '2px' }}>{n.title || 'Notification'}</div>
                            <div style={{ fontSize: '12px', color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanContent}</div>
                            {unread && <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600', marginTop: '2px', display: 'block' }}>View →</span>}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteNotif(e, n)}
                            title="Dismiss"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', fontSize: '14px', flexShrink: 0, padding: '2px 4px', borderRadius: '4px', lineHeight: 1 }}
                          >✕</button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', padding: '5px 12px 5px 5px', borderRadius: '8px' }}>
            <div style={{ width: '28px', height: '28px', background: '#f59e0b', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>{getInitials(user?.full_name)}</div>
            <span style={{ color: '#fff', fontSize: '13px' }}>{user?.full_name || 'Admin'}</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            onMouseEnter={() => setHoverDash(true)}
            onMouseLeave={() => setHoverDash(false)}
            style={{ background: hoverDash ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', border: 'none', padding: '8px 14px', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside style={{ width: '220px', background: '#fff', borderRight: '1px solid #e7e5e4', padding: '24px 0', flexShrink: 0 }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#a8a29e', letterSpacing: '0.08em', padding: '0 20px', marginBottom: '8px', textTransform: 'uppercase' }}>Admin</p>
          {NAV_ITEMS.map(({ path, label, icon }) => {
            const active = location.pathname === path || location.pathname.startsWith(path + '/');
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
