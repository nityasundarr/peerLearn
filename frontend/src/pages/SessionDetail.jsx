import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const formatTime = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const getInitials = (name) =>
  (name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const STATUS_STYLES = {
  pending_tutor_selection: { bg: '#fefce8', color: '#854d0e', label: 'Awaiting Tutor' },
  tutor_accepted:          { bg: '#f0fdf4', color: '#166534', label: 'Tutor Accepted' },
  pending_confirmation:    { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending Confirmation' },
  confirmed:               { bg: '#ecfdf5', color: '#065f46', label: 'Confirmed' },
  completed_attended:      { bg: '#f0f9ff', color: '#0369a1', label: 'Completed' },
  completed_no_show:       { bg: '#fef2f2', color: '#991b1b', label: 'No Show' },
  cancelled:               { bg: '#fef2f2', color: '#991b1b', label: 'Cancelled' },
};

const SessionDetail = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hoverNav, setHoverNav] = useState(null);


  // ── Fetch session info ────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // ── Derived display values ────────────────────────────────────────────────
  const isTutor =
    String(session?.tutor_id) === String(user?.id) ||
    String(session?.tutor?.id) === String(user?.id);

  const tuteeDisplayName = session?.tutee_name || session?.tutee?.full_name || 'Student';
  const tutorDisplayName =
    session?.tutor_name || session?.tutor_full_name || session?.tutor?.full_name || 'Tutor';
  const otherName = isTutor ? tuteeDisplayName : tutorDisplayName;

  const subjects = Array.isArray(session?.subjects) && session.subjects.length
    ? session.subjects.filter(Boolean).join(', ')
    : (session?.subject || '—');
  const topics = Array.isArray(session?.topics) && session.topics.length
    ? session.topics.filter(Boolean).join(', ')
    : (session?.topic || '');

  const statusInfo = STATUS_STYLES[session?.status] || { bg: '#f5f5f4', color: '#57534e', label: session?.status || '—' };

  const venueName = session?.venue_name || session?.venue?.name || null;
  const venueAddress = session?.venue_address || null;
  const venue = session?.venue_manual || venueName || (session?.venue_id ? 'Venue confirmed' : '—');

  // Use server-computed map URL; fall back to a client-built amm.html URL
  const oneMapEmbedUrl = (() => {
    if (session?.venue_map_url) return session.venue_map_url;
    const addr = venueAddress || venueName || session?.venue_manual || null;
    if (!addr) return null;
    const postalMatch = addr.match(/\bS?(\d{6})\b/);
    const postal = postalMatch ? postalMatch[1] : null;
    if (postal) {
      return (
        `https://www.onemap.gov.sg/amm/amm.html`
        + `?mapStyle=Default&zoomLevel=17`
        + `&marker=postalcode:${postal}!colour:red`
        + `&popupWidth=200`
      );
    }
    return null;
  })();

  const canLeaveFeedback = ['completed_attended', 'completed_no_show'].includes(session?.status) && !session?.has_rating;

  // Show venue picker when session is active but no venue set yet
  const venueSettableStates = new Set(['tutor_accepted', 'pending_confirmation']);
  const hasVenue = !!(session?.venue_id || session?.venue_manual);
  const needsVenue = venueSettableStates.has(session?.status) && !hasVenue;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav Header */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')}
          role="button"
          tabIndex={0}
        >
          <img
            src={PeerLearnLogo}
            alt="PeerLearn"
            style={{ height: '36px', objectFit: 'contain' }}
          />
        </div>
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            onMouseEnter={() => setHoverNav('dash')}
            onMouseLeave={() => setHoverNav(null)}
            style={{ background: hoverNav === 'dash' ? '#f0faf5' : 'transparent', border: 'none', padding: '10px 20px', borderRadius: '8px', color: hoverNav === 'dash' ? '#1a5f4a' : '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}
          >
            🏠 Dashboard
          </button>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px', borderRadius: '10px' }}>
          <div style={{ width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
            {getInitials(user?.full_name)}
          </div>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{user?.full_name || 'User'}</span>
        </div>
      </header>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 24px' }}>
        {sessionLoading ? (
          <div style={{ textAlign: 'center', color: '#78716c', padding: '48px' }}>Loading session…</div>
        ) : !session ? (
          <div style={{ textAlign: 'center', color: '#ef4444', padding: '48px' }}>Session not found.</div>
        ) : (
          <>
            {/* ── Session Info Card ── */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '28px 32px', marginBottom: '24px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1c1917' }}>
                    {subjects}
                  </h1>
                  {topics && (
                    <p style={{ margin: '4px 0 0', color: '#78716c', fontSize: '14px' }}>{topics}</p>
                  )}
                </div>
                <span style={{ background: statusInfo.bg, color: statusInfo.color, padding: '5px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {statusInfo.label}
                </span>
              </div>

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                {[
                  { icon: '👤', label: isTutor ? 'Student' : 'Tutor', value: otherName },
                  { icon: '📅', label: 'Date', value: session.scheduled_at ? formatDate(session.scheduled_at) : '—' },
                  { icon: '⏰', label: 'Time', value: session.scheduled_at ? formatTime(session.scheduled_at) : '—' },
                  { icon: '⏱', label: 'Duration', value: session.duration_hours ? `${session.duration_hours}h` : '—' },
                  { icon: '🎓', label: 'Level', value: session.academic_level || '—' },
                  { icon: '📍', label: 'Venue', value: venue },
                  session.fee != null ? { icon: '💰', label: 'Fee Paid', value: `$${Number(session.fee).toFixed(2)}` } : null,
                ].filter(Boolean).map(({ icon, label, value }) => (
                  <div key={label} style={{ background: '#fafaf9', borderRadius: '10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '4px' }}>{icon} {label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1c1917', wordBreak: 'break-word' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* OneMap venue embed */}
              {oneMapEmbedUrl && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#57534e', marginBottom: '8px' }}>
                    📍 Venue Location
                  </div>
                  {venueAddress && (
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#78716c' }}>{venueAddress}</p>
                  )}
                  <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e7e5e4', height: 'calc(100vh - 480px)', minHeight: '360px' }}>
                    <iframe
                      title="Venue Map"
                      src={oneMapEmbedUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 'none', display: 'block' }}
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                  {(venueAddress || venueName || session?.venue_manual) && (
                    <a
                      href={`https://www.onemap.gov.sg/main/v2/?searchval=${encodeURIComponent(venueAddress || venueName || session?.venue_manual || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: '#1a5f4a', textDecoration: 'none' }}
                    >
                      Open in OneMap ↗
                    </a>
                  )}
                </div>
              )}

              {/* ── Continue Setup Banner ── */}
              {needsVenue && (
                <div style={{ marginTop: '24px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#14532d' }}>📍 Session setup in progress</div>
                    <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px' }}>Choose a venue and complete payment to confirm your session.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/session/${sessionId}/coordinate`)}
                    onMouseEnter={() => setHoverNav('setup')}
                    onMouseLeave={() => setHoverNav(null)}
                    style={{ background: hoverNav === 'setup' ? '#145040' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Continue Setup →
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {(canLeaveFeedback || ['completed_attended', 'completed_no_show', 'cancelled'].includes(session?.status)) && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {canLeaveFeedback && (
                    <button
                      type="button"
                      onClick={() => navigate(`/feedback/${sessionId}`)}
                      onMouseEnter={() => setHoverNav('feedback')}
                      onMouseLeave={() => setHoverNav(null)}
                      style={{ padding: '10px 20px', background: hoverNav === 'feedback' ? '#145040' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'background 0.2s ease' }}
                    >
                      ⭐ Leave Feedback
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate('/complaints', { state: { preselectedSessionId: sessionId } })}
                    onMouseEnter={() => setHoverNav('report')}
                    onMouseLeave={() => setHoverNav(null)}
                    style={{ padding: '10px 20px', background: hoverNav === 'report' ? '#fee2e2' : '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '10px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'background 0.2s ease' }}
                  >
                    🚨 Report Issue
                  </button>
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
};

export default SessionDetail;
