import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  return dt.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
};

const getInitials = (name) => (name || '')
  .split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

const SessionMessaging = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const goBack = () => navigate('/dashboard', { state: { tab: location.state?.tab || 'home', filterTab: location.state?.filterTab } });
  const messagesEndRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [isReadonly, setIsReadonly] = useState(false);
  const [session, setSession] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [hoverSend, setHoverSend] = useState(false);
  const [hoverBack, setHoverBack] = useState(false);
  const [hoveredBubbleId, setHoveredBubbleId] = useState(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      setSession(data);
    } catch {
      setSession(null);
    }
  }, [sessionId]);

  const fetchMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/sessions/${sessionId}/messages`);
      const list = Array.isArray(data) ? data : (data?.messages ?? []);
      const sorted = [...list].sort((a, b) => new Date(a.sent_at || a.created_at || 0) - new Date(b.sent_at || b.created_at || 0));
      const normalized = sorted.map((m) => ({
        ...m,
        id: m.message_id || m.id,
      }));
      console.log('[Messaging] sessionId:', sessionId);
      console.log('[Messaging] channel_id:', data?.channel_id);
      console.log('[Messaging] messages:', normalized);
      setMessages(normalized);
      setIsReadonly((prev) => prev || (data?.is_readonly ?? data?.channel?.is_readonly ?? false));
      if (data?.session) setSession(data.session);
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetchSession();
  }, [sessionId, fetchSession]);

  useEffect(() => {
    if (!sessionId) return;
    fetchMessages();
    const interval = setInterval(() => fetchMessages(), 3000);
    return () => clearInterval(interval);
  }, [sessionId, fetchMessages]);

  useEffect(() => {
    if (!session) return;
    const terminal = ['completed_attended', 'completed_no_show', 'cancelled'].includes(session.status);
    if (terminal) setIsReadonly(true);
  }, [session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = (newMessage || '').trim();
    if (!sessionId || !content || isReadonly || loading) return;
    setError(null);
    setLoading(true);
    try {
      const response = await api.post(`/sessions/${sessionId}/messages`, { content });
      console.log('[Messaging] send response:', response);
      setNewMessage('');
      await fetchMessages();
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  const isTutor = String(session?.tutor_id) === String(user?.id) || String(session?.tutor?.id) === String(user?.id);
  const tuteeDisplayName = session?.tutee_name || session?.tutee?.full_name || 'Student';
  const tutorDisplayName = session?.tutor_name || session?.tutor_full_name || session?.tutor?.full_name || 'Tutor';
  const otherName = isTutor ? tuteeDisplayName : tutorDisplayName;

  const subtitleParts = (() => {
    const subjects = session?.subjects;
    const topics = session?.topics;
    const subj = Array.isArray(subjects) && subjects.length
      ? subjects.filter(Boolean).join(', ')
      : (session?.subject || session?.academic_level || '');
    const top = Array.isArray(topics) && topics.length
      ? topics.filter(Boolean).join(', ')
      : (session?.topic || '');
    if (subj && top) return `${subj} • ${top}`;
    if (subj) return subj;
    if (top) return top;
    return session?.academic_level ? `${session.academic_level} • Session` : '—';
  })();

  const initials = getInitials(user?.full_name);

  const senderLabel = (msg) => {
    if (String(msg.sender_id) === String(user?.id)) return 'You';
    if (String(msg.sender_id) === String(session?.tutor_id)) return tutorDisplayName;
    if (String(msg.sender_id) === String(session?.tutee_id)) return tuteeDisplayName;
    return isTutor ? tuteeDisplayName : tutorDisplayName;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav Header */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/dashboard')} onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')} role="button" tabIndex={0}>
          <img
            src={PeerLearnLogo}
            alt="PeerLearn"
            style={{ height: '36px', objectFit: 'contain' }}
          />
        </div>
        <nav />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px', borderRadius: '10px' }}>
          <div style={{ width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{initials}</div>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{user?.full_name || 'User'}</span>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
          {/* Chat Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>{getInitials(otherName)}</div>
              <div>
                <div style={{ fontWeight: '600', color: '#1c1917' }}>{otherName}</div>
                <div style={{ fontSize: '13px', color: '#57534e' }}>{subtitleParts}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goBack()}
              onMouseEnter={() => setHoverBack('card')}
              onMouseLeave={() => setHoverBack(null)}
              style={{
                padding: '8px 16px',
                background: hoverBack === 'card' ? '#f0faf5' : '#f5f5f4',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: hoverBack === 'card' ? '#1a5f4a' : '#57534e',
                transition: 'all 0.2s ease',
              }}
            >
              ← Back
            </button>
          </div>

          {/* Read-only Banner */}
          {isReadonly && (
            <div style={{ padding: '12px 24px', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: '14px', color: '#92400e', textAlign: 'center' }}>
              This conversation is read-only. The session has been completed or cancelled.
            </div>
          )}

          {/* Messages Area */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#fafaf9' }}>
            {error && <p style={{ color: '#ef4444', marginBottom: '16px', textAlign: 'center' }}>{error}</p>}
            {messages.length === 0 && !error && (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: '14px', padding: '24px' }}>No messages yet. Start the conversation!</div>
            )}
            {messages.map((msg) => {
              const isMe = String(msg.sender_id) === String(user?.id);
              const label = senderLabel(msg);
              const ts = msg.sent_at || msg.created_at;
              const bubbleKey = msg.id || msg.message_id;
              const bubbleHover = hoveredBubbleId === bubbleKey;
              return (
                <div
                  key={bubbleKey}
                  style={{
                    display: 'flex',
                    marginBottom: '16px',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: '12px', color: '#78716c', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '600', color: '#57534e' }}>{label}</span>
                      <span style={{ margin: '0 6px', color: '#d6d3d1' }}>·</span>
                      <span>{formatTime(ts)}</span>
                    </div>
                    <div
                      role="presentation"
                      onMouseEnter={() => setHoveredBubbleId(bubbleKey)}
                      onMouseLeave={() => setHoveredBubbleId(null)}
                      style={{
                        background: isMe ? '#1a5f4a' : '#f5f5f4',
                        padding: '12px 16px',
                        borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        display: 'inline-block',
                        boxShadow: bubbleHover ? '0 2px 10px rgba(0,0,0,0.12)' : (isMe ? '0 1px 2px rgba(26,95,74,0.2)' : '0 1px 2px rgba(0,0,0,0.06)'),
                        transition: 'box-shadow 0.2s ease',
                      }}
                    >
                      <p style={{ fontSize: '14px', color: isMe ? '#fff' : '#1c1917', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e7e5e4', background: '#fff' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div
                style={{
                  flex: 1,
                  background: isReadonly ? '#f5f5f4' : '#f5f5f4',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  opacity: isReadonly ? 0.7 : 1,
                  border: inputFocused ? '1px solid #1a5f4a' : '1px solid transparent',
                  transition: 'border 0.2s ease',
                }}
              >
                <textarea
                  rows={1}
                  placeholder={isReadonly ? 'Messaging is disabled' : 'Type a message...'}
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
                disabled={!newMessage.trim() || isReadonly || loading}
                onMouseEnter={() => setHoverSend(true)}
                onMouseLeave={() => setHoverSend(false)}
                style={{
                  width: '48px',
                  height: '48px',
                  background: newMessage.trim() && !isReadonly
                    ? (hoverSend ? '#145040' : '#1a5f4a')
                    : '#e7e5e4',
                  color: newMessage.trim() && !isReadonly ? '#fff' : '#a8a29e',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: newMessage.trim() && !isReadonly && !loading ? 'pointer' : 'not-allowed',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionMessaging;
