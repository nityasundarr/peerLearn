import React, { useState, useEffect, useRef } from 'react';
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
  const { user } = useAuth();
  const messagesEndRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [isReadonly, setIsReadonly] = useState(false);
  const [session, setSession] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMessages = async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/sessions/${sessionId}/messages`);
      const list = Array.isArray(data) ? data : (data?.messages ?? []);
      const sorted = [...list].sort((a, b) => new Date(a.sent_at || a.created_at || 0) - new Date(b.sent_at || b.created_at || 0));
      setMessages(sorted);
      setIsReadonly(data?.is_readonly ?? data?.channel?.is_readonly ?? false);
      if (data?.session) setSession(data.session);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    fetchMessages();
    const interval = setInterval(() => fetchMessages(), 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    api.get(`/sessions/${sessionId}`)
      .then(({ data }) => setSession(data))
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = (newMessage || '').trim();
    if (!sessionId || !content || isReadonly || loading) return;
    setError(null);
    setLoading(true);
    try {
      await api.post(`/sessions/${sessionId}/messages`, { content });
      setNewMessage('');
      await fetchMessages();
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  const isTutor = String(session?.tutor_id) === String(user?.id) || String(session?.tutor?.id) === String(user?.id);
  const otherName = isTutor
    ? (session?.tutee_name || session?.tutee?.full_name || 'Student')
    : (session?.tutor_name || session?.tutor?.full_name || 'Tutor');
  const initials = getInitials(user?.full_name);

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav Header */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
        </div>
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'transparent', border: 'none', padding: '10px 20px', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer' }}>🏠 Dashboard</button>
        </nav>
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
                <div style={{ fontSize: '13px', color: '#57534e' }}>{session?.subjects?.[0] || session?.subject || '—'} • {session?.topics?.[0] || session?.topic || '—'}</div>
              </div>
            </div>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', background: '#f5f5f4', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#57534e' }}>Back to Dashboard</button>
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
              const senderName = msg.sender_name || msg.sender?.full_name || (isMe ? user?.full_name : otherName);
              const ts = msg.sent_at || msg.created_at;
              return (
                <div key={msg.id} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  <div style={{ width: '32px', height: '32px', background: isMe ? '#1a5f4a' : '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '11px', flexShrink: 0 }}>{getInitials(senderName)}</div>
                  <div style={{ textAlign: isMe ? 'right' : 'left', maxWidth: '70%' }}>
                    <div style={{ fontSize: '12px', color: '#57534e', marginBottom: '4px' }}>{senderName} • {formatTime(ts)} {formatDate(ts) !== formatDate(new Date()) && `• ${formatDate(ts)}`}</div>
                    <div style={{ background: isMe ? '#1a5f4a' : '#fff', padding: '12px 16px', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px', display: 'inline-block', boxShadow: isMe ? 'none' : '0 1px 2px rgba(0,0,0,0.05)' }}>
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
              <div style={{ flex: 1, background: isReadonly ? '#f5f5f4' : '#f5f5f4', borderRadius: '12px', padding: '12px 16px', opacity: isReadonly ? 0.7 : 1 }}>
                <textarea
                  rows={1}
                  placeholder={isReadonly ? 'Messaging is disabled' : 'Type a message...'}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={isReadonly}
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || isReadonly || loading}
                style={{
                  width: '48px',
                  height: '48px',
                  background: newMessage.trim() && !isReadonly ? '#1a5f4a' : '#e7e5e4',
                  color: newMessage.trim() && !isReadonly ? '#fff' : '#a8a29e',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: newMessage.trim() && !isReadonly && !loading ? 'pointer' : 'not-allowed',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading ? 0.7 : 1,
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
