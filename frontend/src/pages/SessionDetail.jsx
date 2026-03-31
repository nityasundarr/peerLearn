import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

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
  scheduled:  { bg: '#ecfdf5', color: '#065f46', label: 'Scheduled' },
  completed:  { bg: '#f0f9ff', color: '#0369a1', label: 'Completed' },
  cancelled:  { bg: '#fef2f2', color: '#991b1b', label: 'Cancelled' },
  pending:    { bg: '#fefce8', color: '#854d0e', label: 'Pending' },
  in_progress:{ bg: '#f0fdf4', color: '#166534', label: 'In Progress' },
};

const SessionDetail = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);

  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [messages, setMessages] = useState([]);
  const [isReadonly, setIsReadonly] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [hoverSend, setHoverSend] = useState(false);
  const [hoveredBubbleId, setHoveredBubbleId] = useState(null);
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

  // ── Fetch messages (also updates is_readonly) ─────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/sessions/${sessionId}/messages`);
      const list = Array.isArray(data) ? data : (data?.messages ?? []);
      const sorted = [...list].sort(
        (a, b) => new Date(a.sent_at || a.created_at || 0) - new Date(b.sent_at || b.created_at || 0)
      );
      setMessages(sorted.map((m) => ({ ...m, id: m.message_id || m.id })));
      setIsReadonly(data?.is_readonly ?? data?.channel?.is_readonly ?? false);
      if (data?.session) setSession(data.session);
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const content = (newMessage || '').trim();
    if (!content || isReadonly || sending) return;
    setSendError(null);
    setSending(true);
    try {
      await api.post(`/sessions/${sessionId}/messages`, { content });
      setNewMessage('');
      await fetchMessages();
    } catch (err) {
      setSendError(err.response?.data?.detail ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  };

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

  const venue = session?.venue_manual
    ? session.venue_manual
    : (session?.venue_name || session?.venue?.name || '—');

  const senderLabel = (msg) => {
    if (String(msg.sender_id) === String(user?.id)) return 'You';
    if (String(msg.sender_id) === String(session?.tutor_id)) return tutorDisplayName;
    if (String(msg.sender_id) === String(session?.tutee_id)) return tuteeDisplayName;
    return isTutor ? tuteeDisplayName : tutorDisplayName;
  };

  const canLeaveFeedback = session?.status === 'completed';

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
          <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
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
                ].map(({ icon, label, value }) => (
                  <div key={label} style={{ background: '#fafaf9', borderRadius: '10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '4px' }}>{icon} {label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1c1917', wordBreak: 'break-word' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              {canLeaveFeedback && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/feedback/${sessionId}`)}
                    onMouseEnter={() => setHoverNav('feedback')}
                    onMouseLeave={() => setHoverNav(null)}
                    style={{ padding: '10px 20px', background: hoverNav === 'feedback' ? '#145040' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'background 0.2s ease' }}
                  >
                    ⭐ Leave Feedback
                  </button>
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

            {/* ── Messaging Panel ── */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '520px' }}>
              {/* Chat header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                  {getInitials(otherName)}
                </div>
                <div>
                  <div style={{ fontWeight: '600', color: '#1c1917', fontSize: '15px' }}>Chat with {otherName}</div>
                  <div style={{ fontSize: '12px', color: '#a8a29e' }}>{subjects}{topics ? ` • ${topics}` : ''}</div>
                </div>
              </div>

              {/* Read-only banner */}
              {isReadonly && (
                <div style={{ padding: '10px 24px', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: '13px', color: '#92400e', textAlign: 'center' }}>
                  This conversation is read-only — the session has ended.
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#fafaf9' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: '14px', paddingTop: '32px' }}>
                    No messages yet. Start the conversation!
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = String(msg.sender_id) === String(user?.id);
                  const bubbleKey = msg.id || msg.message_id;
                  const ts = msg.sent_at || msg.created_at;
                  const bubbleHover = hoveredBubbleId === bubbleKey;
                  return (
                    <div
                      key={bubbleKey}
                      style={{ display: 'flex', marginBottom: '14px', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}
                    >
                      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ fontSize: '11px', color: '#78716c', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600', color: '#57534e' }}>{senderLabel(msg)}</span>
                          <span style={{ margin: '0 5px', color: '#d6d3d1' }}>·</span>
                          <span>{formatTime(ts)}</span>
                        </div>
                        <div
                          role="presentation"
                          onMouseEnter={() => setHoveredBubbleId(bubbleKey)}
                          onMouseLeave={() => setHoveredBubbleId(null)}
                          style={{
                            background: isMe ? '#1a5f4a' : '#f5f5f4',
                            padding: '10px 14px',
                            borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            boxShadow: bubbleHover ? '0 2px 8px rgba(0,0,0,0.12)' : (isMe ? '0 1px 2px rgba(26,95,74,0.15)' : '0 1px 2px rgba(0,0,0,0.06)'),
                            transition: 'box-shadow 0.2s ease',
                          }}
                        >
                          <p style={{ fontSize: '14px', color: isMe ? '#fff' : '#1c1917', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid #e7e5e4', background: '#fff' }}>
                {sendError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 8px' }}>{sendError}</p>
                )}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      flex: 1,
                      background: '#f5f5f4',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      opacity: isReadonly ? 0.7 : 1,
                      border: inputFocused ? '1px solid #1a5f4a' : '1px solid transparent',
                      transition: 'border 0.2s ease',
                    }}
                  >
                    <textarea
                      rows={1}
                      placeholder={isReadonly ? 'Messaging is disabled' : 'Type a message…'}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      disabled={isReadonly}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!newMessage.trim() || isReadonly || sending}
                    onMouseEnter={() => setHoverSend(true)}
                    onMouseLeave={() => setHoverSend(false)}
                    style={{
                      width: '44px',
                      height: '44px',
                      background: newMessage.trim() && !isReadonly ? (hoverSend ? '#145040' : '#1a5f4a') : '#e7e5e4',
                      color: newMessage.trim() && !isReadonly ? '#fff' : '#a8a29e',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: newMessage.trim() && !isReadonly && !sending ? 'pointer' : 'not-allowed',
                      fontSize: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: sending ? 0.7 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    ➤
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SessionDetail;
