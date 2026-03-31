import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

// ============================================================
// SECTION 6: PROFILE & SETTINGS PAGE (UPDATED)
// Changes per SRS:
// - Language preference (2.1.1.3)
// - Planning area with "Other" (2.1.1.4)
// - School from predefined list with "Other" (2.1.1.4)
// - Tutor Mode toggle (2.2.2.9)
// - Accessibility accommodation (2.2.2.7)
// ============================================================

const PLANNING_AREAS = ['Clementi', 'Jurong East', 'Jurong West', 'Bukit Batok', 'Woodlands', 'Tampines'];
const SCHOOLS = ['Nanyang Technological University (NTU)', 'National University of Singapore (NUS)', 'Singapore Management University (SMU)', 'Singapore Polytechnic', 'Ngee Ann Polytechnic'];

// Stable components at module level to prevent remount-on-typing (which caused scroll-to-top)
const ProfileNavHeader = ({ initials, fullName, onNavClick, hovered, setHovered }) => (
  <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
    </div>
    <nav style={{ display: 'flex', gap: '8px' }}>
      {['🏠 Dashboard', '🎓 Get Help', '💡 Offer Help'].map((item, i) => (
        <button key={i} onClick={onNavClick} onMouseEnter={() => setHovered(`nav-${i}`)} onMouseLeave={() => setHovered(null)} style={{ background: hovered === `nav-${i}` ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', padding: '10px 20px', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' }}>{item}</button>
      ))}
    </nav>
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <button onMouseEnter={() => setHovered('bell')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'bell' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', width: '44px', height: '44px', borderRadius: '10px', cursor: 'pointer', fontSize: '20px', transition: 'all 0.15s ease' }}>🔔</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px', borderRadius: '10px' }}>
        <div style={{ width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{initials}</div>
        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{fullName}</span>
      </div>
    </div>
  </header>
);

const ProfilePageHeader = ({ activeTab, onTabChange, hovered, setHovered }) => (
  <div style={{ background: '#fff', borderBottom: '1px solid #e7e5e4' }}>
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 0' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Settings</h1>
      <p style={{ color: '#57534e', marginBottom: '24px' }}>Manage your account and preferences</p>
      <div style={{ display: 'flex', gap: '0' }}>
        {[{ id: 'profile', label: '👤 Profile' }, { id: 'tutor', label: '🎓 Tutor Settings' }, { id: 'preferences', label: '⚙️ Preferences' }, { id: 'account', label: '🔐 Account' }].map(tab => (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} onMouseEnter={() => setHovered(`tab-${tab.id}`)} onMouseLeave={() => setHovered(null)} style={{ background: hovered === `tab-${tab.id}` ? '#f0faf5' : 'transparent', border: 'none', padding: '16px 24px', fontSize: '15px', fontWeight: activeTab === tab.id ? '600' : '500', color: activeTab === tab.id ? '#1a5f4a' : '#57534e', cursor: 'pointer', borderBottom: activeTab === tab.id ? '3px solid #1a5f4a' : '3px solid transparent', transition: 'all 0.15s ease' }}>{tab.label}</button>
        ))}
      </div>
    </div>
  </div>
);

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hovered, setHovered] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [showOtherArea, setShowOtherArea] = useState(false);
  const [showOtherSchool, setShowOtherSchool] = useState(false);
  const [tutorModeActive, setTutorModeActive] = useState(true);

  const [profile, setProfile] = useState({ full_name: '', email: '', preferred_language: 'en', planning_area: '', planning_area_other: '', school: '', school_other: '' });
  const [tutorProfile, setTutorProfile] = useState({ academic_levels: [], subjects: [], tutor_topics: [], max_weekly_hours: 5, planning_areas: [], accessibility_capabilities: [], accessibility_notes: '' });
  const [privacy, setPrivacy] = useState({ show_full_name: true, show_school: true, show_rating: true, allow_message_before_booking: true });
  const [notifications, setNotifications] = useState({ session_requests: true, reminders: true, feedback: false, push: true });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/users/me')
      .then(({ data }) => {
        const pa = data.planning_area ?? '';
        const sch = data.school ?? '';
        const paInList = PLANNING_AREAS.includes(pa);
        const schInList = SCHOOLS.includes(sch);
        setShowOtherArea(!paInList && !!pa);
        setShowOtherSchool(!schInList && !!sch);
        setProfile({
          full_name: data.full_name ?? user?.full_name ?? '',
          email: data.email ?? user?.email ?? '',
          preferred_language: data.preferred_language ?? 'en',
          planning_area: paInList ? pa : (pa ? 'other' : ''),
          planning_area_other: paInList ? '' : pa,
          school: schInList ? sch : (sch ? 'other' : ''),
          school_other: schInList ? '' : sch,
        });
      })
      .catch(() => setProfile((p) => ({ ...p, full_name: user?.full_name ?? '', email: user?.email ?? '' })));
  }, []);

  useEffect(() => {
    api.get('/tutor-profile')
      .then(({ data }) => {
        setTutorModeActive(data.is_active_mode ?? false);
        setTutorProfile({
          academic_levels: data.academic_levels ?? [],
          subjects: data.subjects ?? [],
          tutor_topics: data.topics ?? [],
          max_weekly_hours: data.max_weekly_hours ?? 5,
          planning_areas: data.planning_areas ?? [],
          accessibility_capabilities: data.accessibility_capabilities ?? [],
          accessibility_notes: data.accessibility_notes ?? '',
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'preferences') {
      api.get('/users/me/privacy')
        .then(({ data }) => {
          setPrivacy({
            show_full_name: data.show_full_name ?? true,
            show_school: data.show_school ?? true,
            show_rating: data.show_rating ?? true,
            allow_message_before_booking: data.allow_message_before_booking ?? true,
          });
          if (data.notifications) setNotifications((n) => ({ ...n, ...data.notifications }));
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const handleSaveProfile = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.patch('/users/me', {
        full_name: profile.full_name,
        preferred_language: profile.preferred_language,
        planning_area: profile.planning_area === 'other' ? profile.planning_area_other : profile.planning_area,
        school: profile.school === 'other' ? profile.school_other : profile.school,
      });
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTutorProfile = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.put('/tutor-profile', {
        academic_levels: tutorProfile.academic_levels,
        subjects: tutorProfile.subjects,
        tutor_topics: tutorProfile.tutor_topics,
        planning_areas: tutorProfile.planning_areas,
        accessibility_capabilities: tutorProfile.accessibility_capabilities,
        accessibility_notes: tutorProfile.accessibility_notes || null,
        max_weekly_hours: tutorProfile.max_weekly_hours,
        is_active_mode: tutorModeActive,
      });
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleTutorModeToggle = async () => {
    const next = !tutorModeActive;
    setTutorModeActive(next);
    setError(null);
    try {
      await api.patch('/tutor-profile/mode', { is_active_mode: next });
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to update mode');
      setTutorModeActive(!next);
    }
  };

  const handleSavePrivacy = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.patch('/users/me/privacy', { ...privacy, notifications });
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => (profile.full_name || user?.full_name || 'JD')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Profile Tab (Updated with language, "Other" options)
  const renderProfileTab = () => (
    <div>
      {error && <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>}
      {/* Profile Picture */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', padding: '24px', background: '#f5f5f4', borderRadius: '16px' }}>
        <div style={{ width: '100px', height: '100px', background: '#f59e0b', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '36px' }}>{getInitials()}</div>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '8px' }}>Profile Photo</h3>
          <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '12px' }}>JPG or PNG. Max 2MB.</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onMouseEnter={() => setHovered('upload')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 20px', background: hovered === 'upload' ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>Upload Photo</button>
            <button onMouseEnter={() => setHovered('remove')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 20px', background: hovered === 'remove' ? '#fef2f2' : '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>Remove</button>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input type="text" value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>1-100 characters</p>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
          <input type="email" value={profile.email} disabled style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', background: '#f5f5f4', color: '#a8a29e' }} />
          <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>Verified ✓</p>
        </div>
      </div>

      {/* Language Preference (SRS 2.1.1.3) */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Preferred Language <span style={{ color: '#ef4444' }}>*</span></label>
        <select value={profile.preferred_language} onChange={(e) => setProfile((p) => ({ ...p, preferred_language: e.target.value }))} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', background: '#fff' }}>
          <option value="en">English</option>
          <option value="zh">Chinese (中文)</option>
          <option value="ms">Malay (Bahasa Melayu)</option>
          <option value="ta">Tamil (தமிழ்)</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Planning Area with "Other" (SRS 2.1.1.4) */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Planning Area <span style={{ color: '#ef4444' }}>*</span></label>
          <select value={profile.planning_area} onChange={(e) => { setShowOtherArea(e.target.value === 'other'); setProfile((p) => ({ ...p, planning_area: e.target.value })); }} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', background: '#fff' }}>
            {PLANNING_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="other">Other (specify below)</option>
          </select>
          {showOtherArea && <input type="text" value={profile.planning_area_other} onChange={(e) => setProfile((p) => ({ ...p, planning_area_other: e.target.value }))} placeholder="Enter planning area (1-100 chars)" maxLength={100} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', marginTop: '10px' }} />}
        </div>

        {/* School with "Other" (SRS 2.1.1.4) */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>School / Institution</label>
          <select value={profile.school} onChange={(e) => { setShowOtherSchool(e.target.value === 'other'); setProfile((p) => ({ ...p, school: e.target.value })); }} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', background: '#fff' }}>
            {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="other">Other (specify below)</option>
          </select>
          {showOtherSchool && <input type="text" value={profile.school_other} onChange={(e) => setProfile((p) => ({ ...p, school_other: e.target.value }))} placeholder="Enter school (1-100 chars)" maxLength={100} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', marginTop: '10px' }} />}
        </div>
      </div>

      {/* Accessibility Needs */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Accessibility Needs <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional)</span></label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {['Wheelchair accessible venues', 'Ground floor / lift access required', 'Hearing assistance needed', 'Visual assistance needed'].map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={i === 0} style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
              <span style={{ fontSize: '14px', color: '#57534e' }}>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={handleSaveProfile} disabled={loading} onMouseEnter={() => !loading && setHovered('profile-save')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: loading ? '#1a5f4a' : (hovered === 'profile-save' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}>Save Changes</button>
    </div>
  );

  // Tutor Settings Tab (Updated with Mode toggle, accessibility accommodation)
  const renderTutorTab = () => (
    <div>
      {error && <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>}
      {/* Tutor Mode Toggle (SRS 2.2.2.9) */}
      <div style={{ background: tutorModeActive ? '#f0fdf4' : '#f5f5f4', border: `1px solid ${tutorModeActive ? '#bbf7d0' : '#e7e5e4'}`, borderRadius: '16px', padding: '20px 24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '32px' }}>🎓</div>
          <div>
            <div style={{ fontWeight: '600', color: tutorModeActive ? '#166534' : '#57534e', fontSize: '16px' }}>{tutorModeActive ? 'Tutor Mode Active' : 'Tutor Mode Inactive'}</div>
            <div style={{ fontSize: '14px', color: '#57534e' }}>{tutorModeActive ? "You're visible to students looking for help" : "You won't appear in tutor recommendations until reactivated"}</div>
          </div>
        </div>
        <div onClick={handleTutorModeToggle} style={{ width: '50px', height: '28px', background: tutorModeActive ? '#22c55e' : '#e7e5e4', borderRadius: '14px', position: 'relative', cursor: 'pointer' }}>
          <div style={{ width: '24px', height: '24px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: tutorModeActive ? 'auto' : '2px', right: tutorModeActive ? '2px' : 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {[{ label: 'Rating', value: '⭐ 4.8', sub: 'from 15 reviews' }, { label: 'Sessions', value: '24', sub: 'completed' }, { label: 'This Week', value: '2/5 hrs', sub: 'max: 5 hours' }, { label: 'Reliability', value: '98%', sub: 'completion rate' }].map((stat, i) => (
          <div key={i} style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '4px' }}>{stat.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1c1917' }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: '#a8a29e' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Subjects & Topics */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#1c1917' }}>Subjects & Topics</label>
          <button onMouseEnter={() => setHovered('edit-topics')} onMouseLeave={() => setHovered(null)} style={{ padding: '8px 16px', background: hovered === 'edit-topics' ? '#f0faf5' : '#fff', border: `1px solid ${hovered === 'edit-topics' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#1a5f4a', fontWeight: '500', transition: 'all 0.2s ease' }}>+ Edit Topics</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {tutorProfile.tutor_topics.length > 0
            ? tutorProfile.tutor_topics.map((t, i) => (
                <span key={i} style={{ background: '#f5f5f4', padding: '8px 14px', borderRadius: '8px', fontSize: '14px', color: '#57534e' }}>{t.subject}: {t.topic}</span>
              ))
            : tutorProfile.subjects.map((s) => (
                <span key={s} style={{ background: '#f5f5f4', padding: '8px 14px', borderRadius: '8px', fontSize: '14px', color: '#57534e' }}>{s}</span>
              ))
          }
          {tutorProfile.tutor_topics.length === 0 && tutorProfile.subjects.length === 0 && (
            <span style={{ fontSize: '14px', color: '#a8a29e' }}>No topics added yet</span>
          )}
        </div>
      </div>

      {/* Max Hours (SRS 2.2.2.6) */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Maximum hours per week</label>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[2, 3, 5, 8, 10].map((hrs) => {
            const selected = tutorProfile.max_weekly_hours === hrs;
            return (
              <button key={hrs} onClick={() => setTutorProfile((p) => ({ ...p, max_weekly_hours: hrs }))} onMouseEnter={() => setHovered(`hrs-${hrs}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 20px', background: selected ? (hovered === `hrs-${hrs}` ? '#145040' : '#1a5f4a') : (hovered === `hrs-${hrs}` ? '#f0faf5' : '#fff'), color: selected ? '#fff' : '#57534e', border: `2px solid ${selected ? '#1a5f4a' : (hovered === `hrs-${hrs}` ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}>{hrs} hrs</button>
            );
          })}
        </div>
      </div>

      {/* Preferred Areas */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Preferred tutoring areas</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {PLANNING_AREAS.map((area) => {
            const selected = tutorProfile.planning_areas.includes(area);
            return (
              <button key={area} onClick={() => setTutorProfile((p) => ({ ...p, planning_areas: selected ? p.planning_areas.filter((a) => a !== area) : [...p.planning_areas, area] }))} style={{ padding: '10px 16px', background: selected ? '#1a5f4a' : '#fff', color: selected ? '#fff' : '#57534e', border: `1px solid ${selected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{selected && '✓ '}{area}</button>
            );
          })}
        </div>
      </div>

      {/* Accessibility Accommodation (SRS 2.2.2.7) */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Accessibility Accommodation
          <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(optional, 1-100 chars)</span>
        </label>
        <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '12px' }}>Indicate if you can cater to tutees with accessibility needs.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {['I can accommodate wheelchair users', 'I can use hearing assistance devices', 'I am flexible with venue accessibility requirements'].map((opt) => {
            const checked = tutorProfile.accessibility_capabilities.includes(opt);
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => setTutorProfile((p) => ({ ...p, accessibility_capabilities: checked ? p.accessibility_capabilities.filter((c) => c !== opt) : [...p.accessibility_capabilities, opt] }))} style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
                <span style={{ fontSize: '14px', color: '#57534e' }}>{opt}</span>
              </label>
            );
          })}
        </div>
        <textarea rows={2} maxLength={100} value={tutorProfile.accessibility_notes} onChange={(e) => setTutorProfile((p) => ({ ...p, accessibility_notes: e.target.value }))} placeholder="Additional notes (1-100 characters)" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>{(tutorProfile.accessibility_notes || '').length} / 100</div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button onMouseEnter={() => setHovered('edit-avail')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 24px', background: hovered === 'edit-avail' ? '#f0faf5' : '#fff', color: '#1a5f4a', border: '2px solid #1a5f4a', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease' }}>📅 Edit Availability</button>
        <button onClick={handleSaveTutorProfile} disabled={loading} onMouseEnter={() => !loading && setHovered('tutor-save')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: loading ? '#1a5f4a' : (hovered === 'tutor-save' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}>Save Changes</button>
      </div>
    </div>
  );

  // Preferences Tab
  const notifKeys = ['session_requests', 'reminders', 'feedback', 'push'];
  const notifLabels = ['Email notifications for new session requests', 'Email notifications for session reminders', 'Email notifications for feedback received', 'Push notifications (browser)'];
  const privacyKeys = ['show_full_name', 'show_school', 'show_rating', 'allow_message_before_booking'];
  const privacyLabels = ['Show my full name to other users', 'Show my school/institution', 'Show my tutor rating publicly', 'Allow students to message me before booking'];

  const PreferencesTab = () => (
    <div>
      {error && <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '16px' }}>🔔 Notifications</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notifKeys.map((key, i) => (
            <div key={key} onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))} onMouseEnter={() => setHovered(`notif-${key}`)} onMouseLeave={() => setHovered(null)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: hovered === `notif-${key}` ? '#e7e5e4' : '#f5f5f4', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
              <span style={{ fontSize: '14px', color: '#1c1917' }}>{notifLabels[i]}</span>
              <div style={{ width: '50px', height: '28px', background: notifications[key] ? '#22c55e' : '#e7e5e4', borderRadius: '14px', position: 'relative' }}>
                <div style={{ width: '24px', height: '24px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: notifications[key] ? 'auto' : '2px', right: notifications[key] ? '2px' : 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '16px' }}>🔒 Privacy</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {privacyKeys.map((key, i) => (
            <div key={key} onClick={() => setPrivacy((p) => ({ ...p, [key]: !p[key] }))} onMouseEnter={() => setHovered(`privacy-${key}`)} onMouseLeave={() => setHovered(null)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: hovered === `privacy-${key}` ? '#e7e5e4' : '#f5f5f4', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
              <span style={{ fontSize: '14px', color: '#1c1917' }}>{privacyLabels[i]}</span>
              <div style={{ width: '50px', height: '28px', background: privacy[key] ? '#22c55e' : '#e7e5e4', borderRadius: '14px', position: 'relative' }}>
                <div style={{ width: '24px', height: '24px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: privacy[key] ? 'auto' : '2px', right: privacy[key] ? '2px' : 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSavePrivacy} disabled={loading} onMouseEnter={() => !loading && setHovered('pref-save')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: loading ? '#1a5f4a' : (hovered === 'pref-save' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}>Save Preferences</button>
    </div>
  );

  // Account Tab
  const renderAccountTab = () => (
    <div>
      {error && <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '16px' }}>🔐 Change Password</h3>
        <div style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#57534e' }}>
              <p style={{ marginBottom: '4px' }}>Password must contain:</p>
              <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.6' }}>
                <li>At least 8 characters</li>
                <li>At least 1 uppercase letter</li>
                <li>At least 1 lowercase letter</li>
                <li>At least 1 number or symbol</li>
              </ul>
            </div>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleChangePassword} disabled={loading} style={{ padding: '12px 24px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>Update Password</button>
        </div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '16px' }}>🔗 Connected Accounts</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f5f5f4', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🔵</span>
            <div>
              <div style={{ fontWeight: '600', color: '#1c1917' }}>Google</div>
              <div style={{ fontSize: '13px', color: '#57534e' }}>john.doe@gmail.com</div>
            </div>
          </div>
          <button onMouseEnter={() => setHovered('disconnect')} onMouseLeave={() => setHovered(null)} style={{ padding: '8px 16px', background: hovered === 'disconnect' ? '#fef2f2' : '#fff', border: '1px solid #e7e5e4', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#ef4444', transition: 'all 0.2s ease' }}>Disconnect</button>
        </div>
      </div>

      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444', marginBottom: '8px' }}>⚠️ Danger Zone</h3>
        <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '16px' }}>Once you delete your account, there is no going back.</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onMouseEnter={() => setHovered('deactivate')} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 24px', background: hovered === 'deactivate' ? '#fef2f2' : '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '10px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>Deactivate Account</button>
          <button onMouseEnter={() => setHovered('delete')} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 24px', background: hovered === 'delete' ? '#dc2626' : '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease' }}>Delete Account</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ProfileNavHeader initials={getInitials()} fullName={profile.full_name || user?.full_name || 'User'} onNavClick={() => navigate('/dashboard')} hovered={hovered} setHovered={setHovered} />
      <ProfilePageHeader activeTab={activeTab} onTabChange={(tabId) => { setActiveTab(tabId); setError(null); }} hovered={hovered} setHovered={setHovered} />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'tutor' && renderTutorTab()}
        {activeTab === 'preferences' && <PreferencesTab />}
        {activeTab === 'account' && renderAccountTab()}
      </div>
    </div>
  );
};

export default ProfileSettings;
