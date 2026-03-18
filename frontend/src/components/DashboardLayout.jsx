import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

const TABS = [
  { id: 'home', label: '🏠 Home' },
  { id: 'learning', label: '📚 My Learning' },
  { id: 'tutoring', label: '🎓 My Tutoring', badge: null },
  { id: 'chats', label: '💬 Chats', badge: null },
  { id: 'notifications', label: '🔔 Notifications', badge: null },
];

const DashboardLayout = ({ activeTab, onTabChange, badges = {}, children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const fullName = user?.full_name || 'User';
  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ===== NAV HEADER (from your mockup NavHeader) ===== */}
      <header style={{
        background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)',
        padding: '0 32px',
        height: '72px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Logo */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => { onTabChange('home'); }}
        >
          <div style={{
            width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 'bold', fontSize: '20px',
          }}>P</div>
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
        </div>

        {/* Centre nav buttons */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onTabChange('home')}
            style={{
              background: activeTab === 'home' ? 'rgba(255,255,255,0.2)' : 'transparent',
              border: 'none', padding: '10px 20px', borderRadius: '8px',
              color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer',
            }}
          >🏠 Dashboard</button>
          <button
            onClick={() => navigate('/request-help')}
            style={{
              background: 'transparent', border: 'none', padding: '10px 20px',
              borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer',
            }}
          >🎓 Get Help</button>
          <button
            onClick={() => navigate('/offer-tutor')}
            style={{
              background: 'transparent', border: 'none', padding: '10px 20px',
              borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer',
            }}
          >💡 Offer Help</button>
        </nav>

        {/* Right side: notification bell + profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Notification bell */}
          <button
            onClick={() => onTabChange('notifications')}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              width: '44px', height: '44px', borderRadius: '10px',
              cursor: 'pointer', fontSize: '20px', position: 'relative',
            }}
          >
            🔔
            {badges.notifications > 0 && (
              <span style={{
                position: 'absolute', top: '8px', right: '8px',
                width: '18px', height: '18px', background: '#ef4444', borderRadius: '50%',
                fontSize: '11px', color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: '600',
              }}>{badges.notifications}</span>
            )}
          </button>

          {/* Profile dropdown */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px',
                borderRadius: '10px', cursor: 'pointer',
              }}
            >
              <div style={{
                width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 'bold', fontSize: '14px',
              }}>{initials}</div>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{fullName}</span>
            </div>

            {/* Dropdown menu */}
            {showProfileMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '52px',
                backgroundColor: '#fff', border: '1px solid #e7e5e4',
                borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                minWidth: '200px', zIndex: 200, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '14px 16px', borderBottom: '1px solid #e7e5e4',
                  fontSize: '13px', color: '#57534e',
                }}>
                  {user?.email}
                </div>
                <button
                  onClick={() => { setShowProfileMenu(false); navigate('/profile'); }}
                  style={{
                    display: 'block', width: '100%', padding: '12px 16px',
                    border: 'none', backgroundColor: 'transparent', textAlign: 'left',
                    cursor: 'pointer', fontSize: '14px', color: '#1c1917',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f5f5f4'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  ⚙️ Profile Settings
                </button>
                <button
                  onClick={handleSignOut}
                  style={{
                    display: 'block', width: '100%', padding: '12px 16px',
                    border: 'none', backgroundColor: 'transparent', textAlign: 'left',
                    cursor: 'pointer', fontSize: '14px', color: '#ef4444',
                    borderTop: '1px solid #e7e5e4',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#fef2f2'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== TAB NAVIGATION (from your mockup TabNav) ===== */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e7e5e4', padding: '0 32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex' }}>
          {TABS.map((tab) => {
            const badgeCount = badges[tab.id] || tab.badge;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '18px 24px',
                  fontSize: '15px',
                  fontWeight: activeTab === tab.id ? '600' : '500',
                  color: activeTab === tab.id ? '#1a5f4a' : '#57534e',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '3px solid #1a5f4a' : '3px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {tab.label}
                {badgeCount > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff',
                    padding: '2px 8px', borderRadius: '10px', fontSize: '12px',
                  }}>{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== PAGE CONTENT ===== */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </div>

      {/* Close profile menu when clicking outside */}
      {showProfileMenu && (
        <div
          onClick={() => setShowProfileMenu(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100 }}
        />
      )}
    </div>
  );
};

export default DashboardLayout;
