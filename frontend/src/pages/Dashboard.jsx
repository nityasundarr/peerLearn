import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

const getUrgency = (s) => {
  const val = s.urgency_category || s.urgency_level || s.urgency;
  const map = {
    'exam_soon': '🔥 Exam Soon',
    'assignment_due': '⚡ Assignment Due',
    'general_study': '📚 General Study',
    'very_urgent': '🔥 Very Urgent',
    'urgent': '⚡ Urgent',
    'normal': '📚 Normal'
  };
  return map[val] || val || '—';
};

// ============================================================
// SECTION 2: USER DASHBOARD (UPDATED)
// Changes per SRS:
// - Session states (2.7.1)
// - Messaging channel (2.9)
// - Session fee display (2.8)
// - Pending actions (2.12.4.2)
// - Accept/decline/message for requests (2.12.6.3)
// ============================================================

const getInitials = (name) => (name || '')
  .split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) || '??';

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatTime = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatRelativeTime = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const diff = (Date.now() - dt) / 60000;
  if (diff < 60) return 'Just now';
  if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
  if (diff < 43200) return `${Math.floor(diff / 1440)} days ago`;
  return formatDate(dt);
};

const mapSessionToUi = (s) => {
  const tutorDisplay =
    s.tutor_name ||
    s.tutor_full_name ||
    (s.tutor && typeof s.tutor === 'object' ? s.tutor.full_name : null) ||
    (typeof s.tutor === 'string' ? s.tutor : null) ||
    'Tutor';
  let state = (s.status || s.state || '').toUpperCase().replace(/\s/g, '_');
  if (state === 'PENDING_CONFIRMATION') state = 'PENDING_CONFIRM';
  if (state === 'COMPLETED_ATTENDED' || state === 'COMPLETED_NO_SHOW') state = 'COMPLETED';
  return {
    ...s,
    id: s.id,
    subject: s.subject || s.subjects?.[0] || '—',
    topic: s.topic || s.topics?.[0] || '—',
    tutor: tutorDisplay,
    tutee: s.tutee_name || s.tutee?.full_name || 'Student',
    initials: getInitials(
      s.tutor_name ||
        s.tutor_full_name ||
        (s.tutor && typeof s.tutor === 'object' ? s.tutor.full_name : null) ||
        s.tutee_name ||
        s.tutee?.full_name
    ),
    date: formatDate(s.scheduled_at || s.date),
    time: formatTime(s.scheduled_at || s.date),
    venue: s.venue_name || s.venue_manual || s.venue || '—',
    state,
    fee: s.fee ? `$${typeof s.fee === 'number' ? s.fee.toFixed(2) : s.fee}` : '—',
  };
};

const normalizeSessionStatus = (s) =>
  String(s.status || s.state || '')
    .toLowerCase()
    .replace(/\s/g, '_');

const learningScheduleDisplay = (s) => {
  const st = normalizeSessionStatus(s);
  if (st === 'pending_tutor_selection') {
    return { date: 'Waiting for tutor to accept', time: '' };
  }
  if (st === 'tutor_accepted' && !s.scheduled_at) {
    return { date: 'Pending slot confirmation', time: '' };
  }
  if (s.scheduled_at) {
    return { date: formatDate(s.scheduled_at), time: formatTime(s.scheduled_at) };
  }
  return { date: s.date || '—', time: s.time || '—' };
};

const venueDisplayForLearning = (s) => {
  const v = s.venue_name || s.venue_manual || s.venue;
  if (v && v !== '—') return v;
  return 'Pending venue selection';
};

const paymentStatusLabel = (s) => {
  const st = normalizeSessionStatus(s);
  const map = {
    pending_tutor_selection: 'Not started',
    tutor_accepted: 'Pending slot confirmation',
    pending_confirmation: 'Pending payment',
    confirmed: 'Paid',
    completed: 'Paid',
    completed_attended: 'Paid',
    completed_no_show: 'Paid',
    cancelled: 'Cancelled',
  };
  return map[st] || '—';
};

/** My Learning sub-tab routing (tutee sessions). */
const learningTuteeBucket = (s) => {
  const st = normalizeSessionStatus(s);
  if (st === 'cancelled') return 'cancelled';
  if (st === 'pending_tutor_selection') return 'pending';
  if (st === 'completed' || st === 'completed_attended'
    || st === 'completed_no_show') return 'past';
  // tutor_accepted, pending_confirmation, confirmed → upcoming
  return 'upcoming';
};

/** Payment / status line for tutee — distinguishes decline vs self-cancel. */
const learningTuteeStatusLabel = (s) => {
  const st = normalizeSessionStatus(s);
  if (st === 'cancelled') {
    const r = String(s.cancel_reason ?? '').toLowerCase();
    if (r.includes('tutor') || r.includes('declined')) return 'Declined by tutor';
    if (r.includes('tutee') || r.includes('student')) return 'Cancelled by you';
    return 'Cancelled';
  }
  return paymentStatusLabel(s);
};

const mapRequestToUi = (r) => ({
  id: r.session_id || r.id,
  session_id: r.session_id || r.id,
  subject: r.subject || r.subjects?.[0] || '—',
  subjects: r.subjects || [],
  topic: r.topic || r.topics?.[0] || '—',
  topics: r.topics || [],
  student: r.tutee_full_name || r.tutee_name || r.tutee?.full_name || 'Student',
  initials: getInitials(r.tutee_full_name || r.tutee_name || r.tutee?.full_name),
  date: formatDate(r.proposed_at || r.created_at || r.date),
  time: formatTime(r.proposed_at || r.created_at || r.date),
  urgency: r.urgency_category || r.urgency_level || r.urgency || '—',
  level: r.academic_level || r.level || '—',
  time_slots: r.time_slots || [],
  planning_areas: r.planning_areas || [],
  distance_bucket: r.distance_bucket || '—',
  duration_hours: r.duration_hours ?? 1,
  fee: r.fee ? `$${typeof r.fee === 'number' ? r.fee.toFixed(2) : r.fee}` : '—',
  ...r,
});

const mapSessionToIncomingRequest = (s) => {
  const needs = Array.isArray(s.learning_needs) ? s.learning_needs[0] : s.learning_needs;
  const timeSlots = needs?.time_slots || s.time_slots || s.proposed_slots || [];
  return {
    id: s.id,
    session_id: s.id,
    subject: s.academic_level || s.subject || '—',
    subjects: needs?.subjects || [],
    topic: s.topic || needs?.topics?.[0] || '—',
    topics: needs?.topics || [],
    student: s.tutee_name || s.tutee?.full_name || s.tutee || 'Student',
    initials: getInitials(s.tutee_name || s.tutee?.full_name || s.tutee),
    date: formatDate(s.created_at || s.scheduled_at),
    time: formatTime(s.created_at || s.scheduled_at),
    urgency: needs?.urgency_category || '—',
    level: s.academic_level || '—',
    time_slots: timeSlots,
    planning_areas: needs?.planning_areas || [],
    distance_bucket: s.distance_bucket || '—',
    duration_hours: s.duration_hours ?? needs?.duration_hours ?? 1,
    fee: s.fee ? `$${typeof s.fee === 'number' ? s.fee.toFixed(2) : s.fee}` : '—',
  };
};

const mapNotificationToUi = (n) => ({
  ...n,
  id: n.id ?? n.notification_id,
  icon: n.icon || '📩',
  title: n.title || n.type || 'Notification',
  message: n.message || n.body || n.content || '',
  time: formatRelativeTime(n.created_at || n.sent_at),
  unread: !n.is_read && !n.read,
});

const urgencyLabel = {
  exam_soon: '🔥 Exam Soon',
  assignment_due: '⚡ Assignment Due',
  general_study: '📚 General Study',
  urgent: '🔥 Exam Soon',
  normal: '📚 General Study'
};

// CHATS TAB (SRS 2.9) — UC-5.1, messaging tied to sessions (module scope for stable identity)
const ChatsTab = React.memo(function ChatsTab({
  chatSessions,
  selectedChatSessionId,
  setSelectedChatSessionId,
  chatMessages,
  setChatMessages,
  currentUserId,
  hovered,
  setHovered,
}) {
  const [chatInput, setChatInput] = useState('');
  const [chatInputFocus, setChatInputFocus] = useState(false);
  const selectedSession = chatSessions.find(
    (s) => (s.id ?? s.session_id) === selectedChatSessionId,
  );

  const getOtherPersonName = (s) => {
    if (!s) return 'Unknown';
    const uid = String(currentUserId ?? '');
    if (String(s.tutee_id) === uid) {
      return s.tutor_name || s.tutor_full_name || (typeof s.tutor === 'string' ? s.tutor : s.tutor?.full_name) || 'Tutor';
    }
    return s.tutee_name || s.tutee_full_name || (typeof s.tutee === 'string' ? s.tutee : s.tutee?.full_name) || 'Student';
  };

  const formatMsgTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-SG', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !selectedChatSessionId) return;
    setChatInput('');
    try {
      await api.post(
        `/sessions/${selectedChatSessionId}/messages`,
        { content: text },
      );
      const res = await api.get(
        `/sessions/${selectedChatSessionId}/messages`,
      );
      const data = res.data;
      const msgs = Array.isArray(data) ? data
        : Array.isArray(data?.messages) ? data.messages
          : Array.isArray(data?.data) ? data.data : [];
      setChatMessages(msgs);
    } catch (err) {
      console.error('[Chats] send error:', err.response?.data);
      setChatInput(text);
    }
  };

  if (chatSessions.length === 0) {
    return (
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e7e5e4', padding: '48px 24px',
        textAlign: 'center', color: '#57534e',
      }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
        <h3 style={{ fontWeight: '600', marginBottom: '8px' }}>
          No active sessions yet
        </h3>
        <p>Start a tutoring session to begin messaging.</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '320px 1fr',
      height: 'calc(100vh - 200px)', background: '#fff',
      borderRadius: '16px', border: '1px solid #e7e5e4', overflow: 'hidden',
    }}
    >
      <div style={{ borderRight: '1px solid #e7e5e4', overflowY: 'auto' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e7e5e4' }}>
          <h3 style={{
            fontSize: '18px', fontWeight: '600',
            color: '#1c1917', marginBottom: '0',
          }}
          >Messages
          </h3>
        </div>
        {chatSessions.map((s) => {
          const sid = s.id ?? s.session_id;
          const isSelected = selectedChatSessionId === sid;
          const otherName = getOtherPersonName(s);
          const initials = otherName.slice(0, 2).toUpperCase();
          const subj = Array.isArray(s.subjects) ? s.subjects[0] : s.subject;
          const sched = s.scheduled_at || s.date || s.created_at;
          return (
            <div
              key={sid}
              onClick={() => setSelectedChatSessionId(sid)}
              onMouseEnter={() => setHovered(`chat-${sid}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f5f5f4',
                cursor: 'pointer',
                background: isSelected ? '#f0fdf4'
                  : hovered === `chat-${sid}` ? '#f0fdf4' : '#fff',
                borderLeft: isSelected ? '3px solid #1a5f4a'
                  : hovered === `chat-${sid}` ? '3px solid #1a5f4a'
                    : '3px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px',
                  background: '#f59e0b', borderRadius: '12px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#fff',
                  fontWeight: 'bold', flexShrink: 0,
                }}
                >{initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: '600', color: '#1c1917',
                    fontSize: '14px', marginBottom: '4px',
                  }}
                  >{otherName}
                  </div>
                  <div style={{
                    fontSize: '12px', color: '#a8a29e',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  >
                    {subj || s.academic_level || '—'} •{' '}
                    {sched ? formatDate(sched) : 'TBD'}
                  </div>
                  <div style={{
                    fontSize: '11px', marginTop: '4px',
                    padding: '2px 8px', borderRadius: '8px', display: 'inline-block',
                    background: normalizeSessionStatus(s) === 'confirmed' ? '#dcfce7' : '#fef3c7',
                    color: normalizeSessionStatus(s) === 'confirmed' ? '#166534' : '#92400e',
                  }}
                  >
                    {(s.status || s.state || '—').replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #e7e5e4',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}
        >
          <div style={{
            width: '44px', height: '44px', background: '#f59e0b',
            borderRadius: '10px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontWeight: 'bold',
          }}
          >
            {getOtherPersonName(selectedSession).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: '600', color: '#1c1917' }}>
              {getOtherPersonName(selectedSession)}
            </div>
            <div style={{ fontSize: '13px', color: '#57534e' }}>
              {(Array.isArray(selectedSession?.subjects) ? selectedSession.subjects[0] : selectedSession?.subject) || '—'} •{' '}
              {(Array.isArray(selectedSession?.topics) ? selectedSession.topics[0] : selectedSession?.topic) || '—'}
            </div>
          </div>
        </div>

        <div style={{
          flex: 1, padding: '24px', overflowY: 'auto',
          background: '#fafaf9',
        }}
        >
          {chatMessages.length === 0 && (
            <div style={{
              textAlign: 'center', color: '#a8a29e',
              marginTop: '48px',
            }}
            >
              No messages yet. Say hello! 👋
            </div>
          )}
          {chatMessages.map((msg, idx) => {
            const isOwn = String(msg.sender_id) === String(currentUserId);
            const msgId = msg.id || msg.message_id || idx;
            return (
              <div
                key={msgId}
                style={{
                  display: 'flex',
                  marginBottom: '16px',
                  flexDirection: isOwn ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{
                  textAlign: isOwn ? 'right' : 'left',
                  maxWidth: '320px',
                }}
                >
                  {!isOwn && (
                    <div style={{ fontSize: '11px', color: '#a8a29e', marginBottom: '4px' }}>
                      {getOtherPersonName(selectedSession)}
                    </div>
                  )}
                  <div style={{
                    background: isOwn ? '#1a5f4a' : '#f5f5f4',
                    color: isOwn ? '#fff' : '#1c1917',
                    borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '12px 16px',
                    maxWidth: '320px',
                    display: 'inline-block',
                    boxShadow: isOwn ? 'none' : '0 1px 4px rgba(0,0,0,0.08)',
                  }}
                  >
                    <p style={{ fontSize: '14px', margin: 0, color: isOwn ? '#fff' : '#1c1917' }}>
                      {msg.content}
                    </p>
                  </div>
                  <div style={{ fontSize: '11px', color: '#a8a29e', marginTop: '4px' }}>
                    {formatMsgTime(msg.sent_at || msg.created_at)}
                    {isOwn && ' ✓'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e7e5e4',
          background: '#fff',
        }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{
              flex: 1, background: '#f5f5f4',
              borderRadius: '12px', padding: '12px 16px',
              border: chatInputFocus ? '1px solid #1a5f4a' : '1px solid transparent',
              transition: 'border 0.15s ease',
            }}
            >
              <textarea
                rows={1}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onFocus={() => setChatInputFocus(true)}
                onBlur={() => setChatInputFocus(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message... (Enter to send)"
                style={{
                  width: '100%', border: 'none',
                  background: 'transparent', fontSize: '14px',
                  resize: 'none', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!chatInput.trim()}
              onMouseEnter={() => setHovered('chat-send')}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '48px', height: '48px',
                background: !chatInput.trim() ? '#e7e5e4'
                  : hovered === 'chat-send' ? '#145040' : '#1a5f4a',
                border: 'none', borderRadius: '12px',
                cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                color: '#fff', fontSize: '20px',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              ➤
            </button>
          </div>
          <p style={{
            fontSize: '11px', color: '#a8a29e',
            marginTop: '8px', textAlign: 'center',
          }}
          >
            Messages are for session coordination only
          </p>
        </div>
      </div>
    </div>
  );
});

const Dashboard = () => {
  const formatSlot = (slot) => {
    if (!slot) return '';
    const dateStr = typeof slot === 'string' ? slot.split(' ')[0] : slot.date;
    const hourVal = typeof slot === 'string' ?
      parseInt(String(slot.split(' ')[1] || '')) : slot.hour_slot;
    if (!dateStr || isNaN(hourVal)) return String(slot);
    const d = new Date(dateStr + 'T00:00:00');
    const dayStr = d.toLocaleDateString('en-SG',
      { weekday: 'short', day: 'numeric', month: 'short' });
    const fmt = (n) => n === 0 ? '12AM' : n < 12 ?
      n + 'AM' : n === 12 ? '12PM' : (n - 12) + 'PM';
    return dayStr + ', ' + fmt(hourVal) + '-' + fmt(hourVal + 1);
  };

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [learningFilterTab, setLearningFilterTab] = useState('upcoming');
  const [tutoringFilterTab, setTutoringFilterTab] = useState('incoming');
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showMessaging, setShowMessaging] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  const [summary, setSummary] = useState(null);
  const [badges, setBadges] = useState({ notifications: 0, chats: 0 });
  const [learningSessions, setLearningSessions] = useState([]);
  const [openTuteeRequests, setOpenTuteeRequests] = useState([]);
  const [tutoringSessions, setTutoringSessions] = useState([]);
  const [tutorIncomingRequests, setTutorIncomingRequests] = useState([]);
  const [tutorSessionsPending, setTutorSessionsPending] = useState([]);
  const [proposingSessionId, setProposingSessionId] = useState(null);
  const [proposedSlots, setProposedSlots] = useState([]);
  const [slotsProposedSessionId, setSlotsProposedSessionId] = useState(null);
  const [tuteeSlotPick, setTuteeSlotPick] = useState({});
  const [sessionFees, setSessionFees] = useState({});
  const [paymentModalSession, setPaymentModalSession] = useState(null);
  const [paymentTab, setPaymentTab] = useState('paynow');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const pendingFeeFetchedRef = useRef(new Set());
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatPollingRef, setChatPollingRef] = useState(null);

  const stableSetChatSessionId = useCallback(
    (id) => setSelectedChatSessionId(id),
    [],
  );

  const sessionStates = {
    PENDING_TUTOR: { label: 'Pending Tutor Selection', color: '#f59e0b', bg: '#fef3c7' },
    TUTOR_ACCEPTED: { label: 'Tutor Accepted', color: '#3b82f6', bg: '#dbeafe' },
    PENDING_CONFIRM: { label: 'Pending Confirmation', color: '#f59e0b', bg: '#fef3c7' },
    CONFIRMED: { label: 'Confirmed', color: '#22c55e', bg: '#dcfce7' },
    CANCELLED: { label: 'Cancelled', color: '#ef4444', bg: '#fef2f2' },
    COMPLETED: { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' },
  };

  
  const incomingRequests = (summary?.incoming_requests || []).map(mapRequestToUi);
  const pendingActions = summary?.pending_actions || [];

  // My Tutoring: base = GET /sessions?role=tutor; overlay GET /tutor/requests/incoming when ids match
  const mergedTutorIncoming = (() => {
    const incomingMapped = tutorIncomingRequests.map(mapRequestToUi);
    const baseSessions = tutoringSessions.filter((s) => {
      const st = (s.status || s.state || '').toLowerCase().replace(/\s/g, '_');
      return st === 'pending_tutor_selection' || st === 'tutor_accepted';
    });
    if (baseSessions.length === 0 && incomingMapped.length > 0) {
      return incomingMapped;
    }
    return baseSessions.map((s) => {
      const match = incomingMapped.find((r) =>
        r.id === s.id || r.session_id === s.id || r.id === s.session_id
      );
      return match ? { ...s, ...match } : s;
    });
  })();

  const rolesLower = (Array.isArray(user?.roles) ? user.roles : []).map((r) => String(r).toLowerCase());
  const hasTutorRole = rolesLower.includes('tutor');
  const hasTuteeRole = rolesLower.length === 0 || rolesLower.includes('tutee') || rolesLower.includes('student');

  const tutoringPendingSelectionCount = mergedTutorIncoming.filter((s) => {
    const st = normalizeSessionStatus(s);
    return st === 'pending_tutor_selection';
  }).length;

  const unreadNotifications = notifications.filter((n) => n.unread);
  const unreadTotal = unreadNotifications.length;

  let tuteeUnreadNotifCount = 0;
  let tutorUnreadNotifCount = 0;
  if (hasTuteeRole && !hasTutorRole) {
    tuteeUnreadNotifCount = unreadTotal;
  } else if (hasTutorRole && !hasTuteeRole) {
    tutorUnreadNotifCount = unreadTotal;
  } else if (hasTuteeRole && hasTutorRole) {
    unreadNotifications.forEach((n) => {
      const roleHint = String(n.role || n.recipient_role || '').toLowerCase();
      if (roleHint === 'tutor') tutorUnreadNotifCount += 1;
      else if (roleHint === 'tutee' || roleHint === 'student') tuteeUnreadNotifCount += 1;
      else {
        const blob = `${n.type || ''} ${n.title || ''} ${n.message || n.content || ''}`.toLowerCase();
        if (blob.includes('incoming') || blob.includes('new request') || blob.includes('respond to')) tutorUnreadNotifCount += 1;
        else tuteeUnreadNotifCount += 1;
      }
    });
  }

  const learningBadge = hasTuteeRole
    ? learningSessions.filter((s) =>
      ['tutor_accepted', 'pending_confirmation', 'pending_tutor_selection'].includes(s.status),
    ).length
    : 0;
  const tutoringBadge = hasTutorRole ? tutoringPendingSelectionCount : 0;

  const currentUserIdForBadges = user?.id || user?.user_id;
  const chatsUnreadFromOthers = chatMessages.filter(
    (m) => m && m.is_read === false && String(m.sender_id) !== String(currentUserIdForBadges),
  ).length;
  const chatsBadge = Math.max(
    badges.chats ?? 0,
    chatSessions.length > 0 && chatsUnreadFromOthers > 0 ? Math.max(1, chatsUnreadFromOthers) : 0,
  );

  const tabBadges = {
    home: 0,
    learning: learningBadge,
    tutoring: tutoringBadge,
    chats: chatsBadge,
    notifications: badges.notifications,
  };

  const fetchSummary = async () => {
    try {
      const { data } = await api.get('/dashboard/summary');
      setSummary(data);
    } catch {
      setSummary({ upcoming_sessions: [], incoming_requests: [], pending_actions: [] });
    }
  };

  const fetchBadges = async () => {
    try {
      const { data } = await api.get('/dashboard/badges');
      setBadges({
        notifications: data.notifications ?? data.unread_notifications ?? 0,
        chats: data.chats ?? data.unread_chats ?? 0,
      });
    } catch {
      setBadges({ notifications: 0, chats: 0 });
    }
  };

  const fetchLearningSessions = async () => {
    try {
      const { data } = await api.get('/sessions', { params: { role: 'tutee' } });
      const list = Array.isArray(data) ? data : (data.sessions || data.items || []);
      setLearningSessions(list.map(mapSessionToUi));
    } catch {
      setLearningSessions([]);
    }
  };

  const fetchOpenTuteeRequests = async () => {
    try {
      const reqRes = await api.get('/requests');
      const pendingRequests = Array.isArray(reqRes.data) ? reqRes.data
        : Array.isArray(reqRes.data?.requests) ? reqRes.data.requests : [];
      const openRequests = pendingRequests.filter((r) => r.status === 'open');
      setOpenTuteeRequests(openRequests);
    } catch {
      setOpenTuteeRequests([]);
    }
  };

  const fetchTutoringSessions = async () => {
    try {
      const { data } = await api.get('/sessions', { params: { role: 'tutor' } });
      const list = Array.isArray(data) ? data : (data.sessions || data.items || []);
      setTutoringSessions(list.map(mapSessionToUi));
      console.log('[Dashboard] GET /sessions?role=tutor', data);
    } catch (e) {
      setTutoringSessions([]);
      console.error('[Dashboard] GET /sessions?role=tutor', e);
    }
  };

  const fetchTutorIncomingRequests = async () => {
    try {
      const { data } = await api.get('/tutor/requests/incoming');
      const list = Array.isArray(data) ? data : (data.items || data.requests || []);
      setTutorIncomingRequests(list);
      console.log('[Dashboard] GET /tutor/requests/incoming', data);
    } catch (e) {
      setTutorIncomingRequests([]);
      console.error('[Dashboard] GET /tutor/requests/incoming', e);
    }
  };

  const fetchTutorSessionsPending = async () => {
    try {
      const { data } = await api.get('/sessions', { params: { role: 'tutor', status: 'pending' } });
      const list = Array.isArray(data) ? data : (data.sessions || data.items || []);
      setTutorSessionsPending(list);
      console.log('[Dashboard] GET /sessions?role=tutor&status=pending', data);
    } catch (e) {
      setTutorSessionsPending([]);
      console.error('[Dashboard] GET /sessions?role=tutor&status=pending', e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      const list = Array.isArray(data) ? data : (data.notifications || data.items || []);
      setNotifications(list.map(mapNotificationToUi));
    } catch {
      setNotifications([]);
    }
  };

  const fetchFeeAndStore = async (sessionId) => {
    try {
      const { data } = await api.get('/payments/fee', { params: { session_id: sessionId } });
      const fee = data?.fee;
      if (fee != null) setSessionFees((prev) => ({ ...prev, [sessionId]: Number(fee) }));
    } catch {
      // optional: fee unavailable
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await Promise.all([
        fetchSummary(),
        fetchBadges(),
        fetchLearningSessions(),
        fetchOpenTuteeRequests(),
        fetchTutoringSessions(),
        fetchTutorIncomingRequests(),
        fetchNotifications(),
      ]);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (location?.state?.refresh) {
      // Clear the state so it doesn't trigger again
      window.history.replaceState({}, '');
      // Refetch everything
      fetchSummary();
      fetchBadges();
      fetchLearningSessions();
      fetchOpenTuteeRequests();
      fetchTutoringSessions();
      fetchTutorIncomingRequests();
      fetchNotifications();
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'learning') fetchLearningSessions();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'tutoring') {
      fetchTutoringSessions();
      fetchTutorIncomingRequests();
      fetchTutorSessionsPending();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
      fetchBadges();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'chats') return;
    const load = async () => {
      try {
        const [tuteeRes, tutorRes] = await Promise.all([
          api.get('/sessions', { params: { role: 'tutee' } }),
          api.get('/sessions', { params: { role: 'tutor' } }),
        ]);
        const rawTutee = tuteeRes.data;
        const rawTutor = tutorRes.data;
        const tutee = Array.isArray(rawTutee) ? rawTutee : (rawTutee?.sessions ?? rawTutee?.items ?? []);
        const tutor = Array.isArray(rawTutor) ? rawTutor : (rawTutor?.sessions ?? rawTutor?.items ?? []);
        const combined = [...tutee, ...tutor];
        const seen = new Set();
        const unique = combined.filter((s) => {
          const id = s.id ?? s.session_id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        const chatworthy = unique.filter((s) => {
          const st = String(s.status || s.state || '').toLowerCase().replace(/\s/g, '_');
          return !['pending_tutor_selection', 'cancelled'].includes(st);
        });
        console.log('[Chats] sessions:', chatworthy);
        setChatSessions(chatworthy);
        setSelectedChatSessionId((prev) => {
          if (prev && chatworthy.some((x) => (x.id ?? x.session_id) === prev)) return prev;
          return chatworthy[0]?.id ?? chatworthy[0]?.session_id ?? null;
        });
      } catch (err) {
        console.error('[Chats] load error:', err);
      }
    };
    load();
  }, [activeTab]);

  useEffect(() => {
    if (!selectedChatSessionId) return;
    if (activeTab !== 'chats') return;
    const fetchMessages = async () => {
      if (activeTab !== 'chats') return;
      try {
        const res = await api.get(`/sessions/${selectedChatSessionId}/messages`);
        const data = res.data;
        const msgs = Array.isArray(data) ? data
          : Array.isArray(data?.messages) ? data.messages
            : Array.isArray(data?.data) ? data.data : [];
        console.log('[Chats] messages:', msgs);
        setChatMessages(msgs);
      } catch (err) {
        console.error('[Chats] message fetch error:', err);
      }
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    setChatPollingRef(interval);
    return () => {
      clearInterval(interval);
      setChatPollingRef(null);
    };
  }, [selectedChatSessionId, activeTab]);

  useEffect(() => {
    learningSessions.forEach((sess) => {
      if (['pending_confirmation', 'confirmed'].includes(
        normalizeSessionStatus(sess),
      ) && sess.id && !pendingFeeFetchedRef.current.has(sess.id)) {
        pendingFeeFetchedRef.current.add(sess.id);
        fetchFeeAndStore(sess.id);
      }
    });
  }, [learningSessions]);

  const handleAccept = async (sessionId) => {
    try {
      await api.post(`/sessions/${sessionId}/accept`);
      setProposingSessionId(sessionId);
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'tutoring') fetchTutoringSessions();
      // Do NOT refetch incoming/pending here — card stays visible for propose-slots UI
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const handleDecline = async (sessionId) => {
    try {
      await api.post(`/sessions/${sessionId}/decline`);
      setProposingSessionId(null);
      setProposedSlots([]);
      setSlotsProposedSessionId(null);
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'tutoring') {
        fetchTutoringSessions();
        fetchTutorIncomingRequests();
        fetchTutorSessionsPending();
      }
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const slotToProposedPayload = (slot) => {
    if (typeof slot === 'string') {
      const parts = slot.trim().split(/\s+/);
      const dateStr = parts[0];
      const hourVal = parseInt(String(parts[1] || '').replace(/h$/i, ''), 10);
      if (dateStr && !isNaN(hourVal)) return { date: dateStr, hour_slot: hourVal };
      return null;
    }
    if (slot && typeof slot === 'object') {
      const d = slot.date || slot.day_of_week;
      const h = slot.hour_slot;
      if (d != null && h != null && !isNaN(Number(h))) {
        const dateStr = typeof d === 'string' ? d.split(' ')[0] : String(d);
        return { date: dateStr, hour_slot: Number(h) };
      }
    }
    return null;
  };

  const handleProposeSlots = async (sessionId) => {
    try {
      const selectedSlots = proposedSlots.map(slotToProposedPayload).filter(Boolean);
      await api.post(`/sessions/${sessionId}/propose-slots`, { proposed_slots: selectedSlots });
      setProposingSessionId(null);
      setProposedSlots([]);
      setSlotsProposedSessionId(sessionId);
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'tutoring') {
        fetchTutoringSessions();
        fetchTutorIncomingRequests();
        fetchTutorSessionsPending();
      }
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const toggleProposedSlot = (slot) => {
    setProposedSlots((prev) => {
      const exists = prev.some((s) => JSON.stringify(s) === JSON.stringify(slot));
      if (exists) return prev.filter((s) => JSON.stringify(s) !== JSON.stringify(slot));
      return [...prev, slot];
    });
  };

  const openPaymentModal = (session) => {
    if (!session?.id) return;
    setPaymentModalSession(session);
    setPaymentTab('paynow');
    setPaymentLoading(false);
    setPaymentSuccess(false);
    setPaymentError(null);
    if (normalizeSessionStatus(session) === 'pending_confirmation') {
      fetchFeeAndStore(session.id);
    }
  };

  const closePaymentModal = () => {
    setPaymentModalSession(null);
    setPaymentTab('paynow');
    setPaymentLoading(false);
    setPaymentSuccess(false);
    setPaymentError(null);
  };

  const handlePaymentModalConfirm = async () => {
    const sid = paymentModalSession?.id;
    if (!sid) return;
    setPaymentLoading(true);
    setPaymentError(null);
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await api.post('/payments/initiate', { session_id: sid });
      setPaymentLoading(false);
      setPaymentSuccess(true);
      setLearningSessions((prev) => prev.map((x) => (x.id === sid ? { ...x, state: 'CONFIRMED', status: 'confirmed' } : x)));
      if (selectedSession?.id === sid) {
        setSelectedSession((prev) => (prev && prev.id === sid ? { ...prev, state: 'CONFIRMED', status: 'confirmed' } : prev));
      }
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'learning') await fetchLearningSessions();
      setTimeout(() => {
        closePaymentModal();
      }, 2000);
    } catch (err) {
      const d = err?.response?.data?.detail;
      let msg = 'Payment failed';
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d)) msg = d.map((x) => (x.msg != null ? x.msg : String(x))).join(', ');
      else if (d && typeof d === 'object' && d.msg) msg = String(d.msg);
      else if (err?.message) msg = err.message;
      setPaymentError(msg);
      setPaymentLoading(false);
    }
  };

  const handlePay = async (sessionId) => {
    try {
      await api.post('/payments/initiate', { session_id: sessionId });
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'learning') fetchLearningSessions();
      setShowDetailPanel(false);
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const handleConfirmTuteeSlot = async (sessionId, slot) => {
    if (!slot?.date || slot.hour_slot == null) return;
    try {
      await api.post(`/sessions/${sessionId}/confirm-slot`, {
        date: slot.date,
        hour_slot: Number(slot.hour_slot),
      });
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'learning') await fetchLearningSessions();
      setTuteeSlotPick((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (selectedSession?.id === sessionId) {
        try {
          const { data } = await api.get(`/sessions/${sessionId}`);
          setSelectedSession(mapSessionToUi(data));
        } catch {
          // keep panel open with list data
        }
      }
      await fetchFeeAndStore(sessionId);
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const handleMarkOutcome = async (sessionId, outcome) => {
    try {
      await api.patch(`/sessions/${sessionId}/outcome`, { outcome });
      await fetchSummary();
      await fetchBadges();
      if (activeTab === 'learning') fetchLearningSessions();
      if (activeTab === 'tutoring') fetchTutoringSessions();
      setShowDetailPanel(false);
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const handleMarkNotificationRead = async (notif) => {
    const id = notif?.id || notif?.notification_id;
    if (!id || id === 'undefined') {
      console.warn('[notif] missing id:', notif);
      return;
    }
    try {
      await api.patch(`/notifications/${id}`, {});
      const res = await api.get('/notifications');
      const data = res.data;
      const raw = Array.isArray(data) ? data : (data?.notifications || data?.items || []);
      setNotifications(raw.map(mapNotificationToUi));
      fetchBadges();
    } catch (err) {
      console.error('[notif] mark read error:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
      fetchBadges();
    } catch {
      // error handled by api interceptor or UI
    }
  };

  const getNotificationActionLabel = (notif) => {
    const t = String(notif?.type || '').toLowerCase();
    if (t === 'tutor_matched' || t === 'match') return 'View in Pending →';
    if (t === 'slot_proposed' || t.includes('slot') || t.includes('proposed'))
      return 'Confirm your slot →';
    if (t === 'session_accepted' || t === 'tutor_accepted' || t.includes('accepted'))
      return 'View session →';
    if (t === 'request_matched') return 'View in My Tutoring →';
    if (t === 'payment_received' || t.includes('payment')) return 'View session →';
    if (t === 'new_message' || t.includes('message')) return 'View chat →';
    return 'View →';
  };

  const handleNotificationClick = async (notif) => {
    const id = notif?.id || notif?.notification_id;
    if (id && id !== 'undefined') {
      try {
        await api.patch(`/notifications/${id}`, {});
      } catch {
        // optional: still navigate
      }
      setNotifications((prev) => prev.map((n) => (
        (String(n.id) === String(id) || String(n.notification_id) === String(id))
          ? { ...n, is_read: true, unread: false }
          : n
      )));
      fetchBadges();
    }
    const type = String(notif?.type || '').toLowerCase();
    const sessionId = notif?.session_id || notif?.data?.session_id;

    if (type === 'new_message' || type.includes('message')) {
      setActiveTab('chats');
      if (sessionId) setSelectedChatSessionId(sessionId);
    } else if (type === 'tutor_matched' || type === 'match') {
      setActiveTab('learning');
      setLearningFilterTab('pending');
    } else if (type === 'slot_proposed' || type.includes('slot')
      || type.includes('proposed')) {
      setActiveTab('learning');
      setLearningFilterTab('upcoming');
    } else if (type === 'session_accepted' || type === 'tutor_accepted'
      || type.includes('accepted')) {
      setActiveTab('learning');
      setLearningFilterTab('upcoming');
    } else if (type === 'payment_received' || type.includes('payment')) {
      setActiveTab('learning');
      setLearningFilterTab('upcoming');
    } else if (type === 'request_matched' || type.includes('incoming')) {
      setActiveTab('tutoring');
    } else if (type.includes('complaint') || type.includes('appeal')) {
      // stay on notifications tab, do nothing
    } else {
      setActiveTab('learning');
    }
  };

  const StatusBadge = ({ state }) => {
    const s = sessionStates[state] || {
      label: String(state || 'Unknown').replace(/_/g, ' '),
      bg: '#f3f4f6',
      color: '#57534e',
    };
    return <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>{s.label}</span>;
  };

  // HOME TAB
  const HomeTab = () => {
    const stats = summary?.stats || {};
    console.log('[HomeTab] openRequests:', openTuteeRequests);
    console.log('[HomeTab] learningSessions:', learningSessions.map((s) => s.status));
    const pendingCount = openTuteeRequests.length
      + learningSessions.filter((s) => s.status === 'pending_tutor_selection').length;
    const tuteeUpcoming = learningSessions.filter((s) =>
      ['confirmed', 'tutor_accepted', 'pending_confirmation'].includes(s.status),
    );
    const tutorUpcoming = tutoringSessions.filter((s) =>
      s.status === 'confirmed',
    );
    const seenUpcomingIds = new Set();
    const upcomingSessionsMerged = [...tuteeUpcoming, ...tutorUpcoming].filter((s) => {
      const id = s.id || s.session_id;
      if (!id || seenUpcomingIds.has(id)) return false;
      seenUpcomingIds.add(id);
      return true;
    });
    const upcomingSessions = upcomingSessionsMerged.slice(0, 3);
    const statItems = [
      { label: 'Upcoming', value: String(upcomingSessionsMerged.length), icon: '📅' },
      { label: 'Pending', value: String(pendingCount), icon: '⏳' },
      { label: 'Hours Learned', value: String(stats.hours_learned ?? 0), icon: '📚' },
      { label: 'Hours Taught', value: String(stats.hours_taught ?? 0), icon: '🎓' },
    ];

    const tuteeNeedsSlotConfirm = hasTuteeRole && learningSessions.some((s) => {
      const st = normalizeSessionStatus(s);
      const ps = s.proposed_slots;
      return st === 'tutor_accepted' && Array.isArray(ps) && ps.length > 0;
    });
    const tuteeNeedsPayment = hasTuteeRole && learningSessions.some((s) =>
      ['pending_confirmation', 'pending_confirm'].includes(normalizeSessionStatus(s)),
    );
    const tutorHasIncomingHome = hasTutorRole && mergedTutorIncoming.length > 0;

    const hasPendingTutorSelectionSession = hasTuteeRole && learningSessions.some((s) => s.status === 'pending_tutor_selection');
    const openReqIds = new Set(openTuteeRequests.map((r) => String(r.id ?? r.request_id ?? '')));
    const hasMatchForOpenRequest = openTuteeRequests.length > 0 && learningSessions.some((s) => (
      s.status === 'pending_tutor_selection' && openReqIds.has(String(s.request_id ?? ''))
    ));

    const homePendingBlocks = [];
    if (hasTuteeRole && hasPendingTutorSelectionSession && (hasMatchForOpenRequest || openTuteeRequests.length === 0)) {
      homePendingBlocks.push(
        <div key="home-pa-tutor-matched" style={{ background: '#ecfdf5', border: '1px solid #86efac', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#166534' }}>🎓 A matching tutor has been found for your request!</div>
            <div style={{ fontSize: '13px', color: '#15803d', marginTop: '4px' }}>Review the tutor and confirm your session</div>
          </div>
          <button type="button" onClick={() => setActiveTab('learning')} onMouseEnter={() => setHovered('home-pa-view-match')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 16px', background: hovered === 'home-pa-view-match' ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>View Match →</button>
        </div>,
      );
    }
    if (hasTuteeRole && openTuteeRequests.length > 0 && !hasPendingTutorSelectionSession) {
      homePendingBlocks.push(
        <div key="home-pa-open-tutee" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#92400e' }}>📬 {openTuteeRequests.length} request(s) waiting for a tutor</div>
            <div style={{ fontSize: '13px', color: '#a16207', marginTop: '4px' }}>Your request is open — we&apos;ll notify you when a tutor accepts</div>
          </div>
          <button type="button" onClick={() => setActiveTab('learning')} onMouseEnter={() => setHovered('home-pa-open-learn')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 16px', background: hovered === 'home-pa-open-learn' ? '#f59e0b' : '#fbbf24', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>View in My Learning →</button>
        </div>,
      );
    }
    if (tuteeNeedsSlotConfirm) {
      homePendingBlocks.push(
        <div key="home-pa-slots" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#92400e' }}>📅 Your tutor proposed time slots</div>
            <div style={{ fontSize: '13px', color: '#a16207', marginTop: '4px' }}>Confirm a time slot to proceed to payment</div>
          </div>
          <button type="button" onClick={() => setActiveTab('learning')} onMouseEnter={() => setHovered('home-pa-confirm')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 16px', background: hovered === 'home-pa-confirm' ? '#f59e0b' : '#fbbf24', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>Confirm Now →</button>
        </div>,
      );
    }
    if (tuteeNeedsPayment) {
      homePendingBlocks.push(
        <div key="home-pa-pay" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#92400e' }}>💳 Payment required</div>
            <div style={{ fontSize: '13px', color: '#a16207', marginTop: '4px' }}>Complete payment to confirm your session</div>
          </div>
          <button type="button" onClick={() => setActiveTab('learning')} onMouseEnter={() => setHovered('home-pa-paybtn')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 16px', background: hovered === 'home-pa-paybtn' ? '#f59e0b' : '#fbbf24', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>Pay Now →</button>
        </div>,
      );
    }
    if (tutorHasIncomingHome) {
      homePendingBlocks.push(
        <div key="home-pa-tutor-req" style={{ background: '#ecfdf5', border: '1px solid #86efac', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#166534' }}>📩 {mergedTutorIncoming.length} incoming request(s)</div>
            <div style={{ fontSize: '13px', color: '#15803d', marginTop: '4px' }}>Students are waiting for your response</div>
          </div>
          <button type="button" onClick={() => setActiveTab('tutoring')} onMouseEnter={() => setHovered('home-pa-tutor')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 16px', background: hovered === 'home-pa-tutor' ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>View Requests →</button>
        </div>,
      );
    }

    const showIncomingBox = hasTutorRole && mergedTutorIncoming.length > 0;
    const homeIncomingPreviews = showIncomingBox ? mergedTutorIncoming.slice(0, 3) : [];

    const homeUrgencyBadge = (req) => {
      const k = String(req.urgency_category || req.urgency_level || req.urgency || '').toLowerCase().replace(/\s/g, '_');
      if (k && urgencyLabel[k]) return urgencyLabel[k];
      return getUrgency(req) || req.urgency || '—';
    };
    return (
    <div style={{ display: 'grid', gridTemplateColumns: showIncomingBox ? '2fr 1fr' : '1fr', gap: '24px' }}>
      <div>
        {/* Welcome */}
        <div style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #2d8a6e 100%)', borderRadius: '20px', padding: '32px', color: '#fff', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Welcome back, {user?.full_name || 'User'}! 👋</h1>
          <p style={{ opacity: 0.9, marginBottom: '20px' }}>Ready to learn or teach today?</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => navigate('/request-help')} onMouseEnter={() => setHovered('req-help')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'req-help' ? '#fbbf24' : '#f59e0b', border: 'none', padding: '12px 24px', borderRadius: '10px', color: '#fff', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease' }}>🎓 Request Help</button>
            <button onClick={() => navigate('/offer-tutor')} onMouseEnter={() => setHovered('offer')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'offer' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', padding: '12px 24px', borderRadius: '10px', color: '#fff', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s ease' }}>💡 Offer to Tutor</button>
          </div>
        </div>

        {/* Pending Actions (SRS 2.12.4.2 / UC-8.1) */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>⚡ Pending Actions</h3>
          {homePendingBlocks.length === 0 ? (
            <p style={{ fontSize: '14px', color: '#78716c', margin: 0 }}>✓ You&apos;re all caught up! No pending actions.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {homePendingBlocks}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {statItems.map((s, i) => (
            <div key={i} onMouseEnter={() => setHovered(`stat-${i}`)} onMouseLeave={() => setHovered(null)} style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e7e5e4', textAlign: 'center', boxShadow: hovered === `stat-${i}` ? '0 4px 16px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)', transform: hovered === `stat-${i}` ? 'translateY(-2px)' : 'none', transition: 'all 0.2s ease' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1c1917' }}>{s.value}</div>
              <div style={{ fontSize: '13px', color: '#57534e' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Upcoming Sessions */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1c1917' }}>📅 Upcoming Sessions</h3>
          {upcomingSessions.map((s, index) => {
            const subj = s.subject
              || (Array.isArray(s.subjects) ? s.subjects[0] : null)
              || '—';
            const top = s.topic
              || (Array.isArray(s.topics) ? s.topics[0] : null)
              || '—';
            const tutorName = s.tutor || s.tutor_name
              || s.tutor_full_name || 'Tutor';
            const sessionInitials = s.initials
              || tutorName.slice(0, 2).toUpperCase();
            const sessionDate = s.date
              || (s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString(
                'en-SG', { weekday: 'short', day: 'numeric', month: 'short' },
              ) : '—');
            const sessionTime = s.time
              || (s.scheduled_at ? new Date(s.scheduled_at).toLocaleTimeString(
                'en-SG', { hour: 'numeric', minute: '2-digit', hour12: true },
              ) : '—');
            const badgeState = s.state || s.status;
            const sessionSt = normalizeSessionStatus(s);
            let homeFeeLine = null;
            if (sessionSt === 'confirmed') {
              homeFeeLine = (
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a', marginTop: '8px' }}>✓ Paid</div>
              );
            } else if (sessionSt === 'pending_confirmation' || sessionSt === 'pending_confirm') {
              homeFeeLine = (
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#d97706', marginTop: '8px' }}>Payment pending</div>
              );
            } else if (sessionSt === 'tutor_accepted') {
              homeFeeLine = (
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a5f4a', marginTop: '8px' }}>Awaiting confirmation</div>
              );
            }
            return (
            <div key={s.id || index} onClick={() => { setSelectedSession(s); setShowDetailPanel(true); }} onMouseEnter={() => setHovered(`session-${s.id || index}`)} onMouseLeave={() => setHovered(null)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f5f5f4', borderRadius: '12px', marginBottom: '12px', cursor: 'pointer', boxShadow: hovered === `session-${s.id || index}` ? '0 4px 16px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)', transform: hovered === `session-${s.id || index}` ? 'translateY(-2px)' : 'none', transition: 'all 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>{sessionInitials}</div>
                <div>
                  <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>{subj}: {top}</div>
                  <div style={{ fontSize: '13px', color: '#57534e' }}>with {tutorName} • {sessionDate}, {sessionTime}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge state={badgeState} />
                {homeFeeLine}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar — tutor incoming request previews (UC-4.4) */}
      {showIncomingBox && (
      <div>
        <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #f59e0b', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1c1917', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📩 Incoming Requests
            <span style={{ background: '#ef4444', color: '#fff', padding: '2px 10px', borderRadius: '10px', fontSize: '13px' }}>{mergedTutorIncoming.length}</span>
          </h3>
          {homeIncomingPreviews.map((req) => {
            const subjR = req.subject || req.subjects?.[0] || '—';
            const topicR = req.topic || req.topics?.[0] || '—';
            const studentName = req.student || req.tutee_full_name || req.tutee_name || 'Student';
            const urgText = homeUrgencyBadge(req);
            const rid = req.id ?? req.session_id;
            return (
              <div key={rid} style={{ padding: '16px', background: '#fef3c7', borderRadius: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', color: '#1c1917', fontWeight: '600', marginBottom: '8px' }}>{subjR} • {topicR}</div>
                <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '8px' }}>{studentName}</div>
                <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '8px', background: '#fff7ed', color: '#c2410c', marginBottom: '10px' }}>{urgText}</span>
                <div>
                  <button type="button" onClick={() => setActiveTab('tutoring')} onMouseEnter={() => setHovered(`home-incoming-acc-${rid}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '8px 14px', background: hovered === `home-incoming-acc-${rid}` ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Accept →</button>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setActiveTab('tutoring')} onMouseEnter={() => setHovered('home-tutoring-link')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', marginTop: '8px', padding: '12px', background: hovered === 'home-tutoring-link' ? '#f0fdf4' : '#fff', color: '#1a5f4a', border: '1px solid #1a5f4a', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>View all in My Tutoring →</button>
        </div>
      </div>
      )}
    </div>
    );
  };

  // MY LEARNING TAB
  const LearningTab = () => {
    const learningTabKeys = [
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'pending', label: 'Pending' },
      { key: 'past', label: 'Past' },
      { key: 'cancelled', label: 'Cancelled' },
    ];
    const filteredLearningSessions = learningSessions.filter((s) => learningTuteeBucket(s) === learningFilterTab);
    const pendingTabCount = learningSessions.filter((s) =>
      learningTuteeBucket(s) === 'pending',
    ).length;
    const upcomingActionCount = learningSessions.filter((s) => {
      const st = normalizeSessionStatus(s);
      return (
        (st === 'tutor_accepted'
          && Array.isArray(s.proposed_slots)
          && s.proposed_slots.length > 0)
        || st === 'pending_confirmation'
      );
    }).length;
    return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {learningTabKeys.map(({ key, label }) => {
          const sel = learningFilterTab === key;
          const h = hovered === `learn-tab-${key}`;
          return (
            <button key={key} type="button" onClick={() => setLearningFilterTab(key)} onMouseEnter={() => setHovered(`learn-tab-${key}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 20px', background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'), color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `1px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '8px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' }}>
              {label}
              {key === 'pending' && pendingTabCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginLeft: '6px',
                }}>{pendingTabCount}</span>
              )}
              {key === 'upcoming' && upcomingActionCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginLeft: '6px',
                }}>{upcomingActionCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {filteredLearningSessions.length === 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '40px 24px', textAlign: 'center', color: '#57534e', marginBottom: '16px' }}>
          No sessions in this section.
        </div>
      )}

      {filteredLearningSessions.map((tuteeSession) => {
        const sched = learningScheduleDisplay(tuteeSession);
        const venueLine = venueDisplayForLearning(tuteeSession);
        const st = normalizeSessionStatus(tuteeSession);
        const proposed = (tuteeSession.proposed_slots || []).map((sl) => slotToProposedPayload(sl)).filter(Boolean);
        const showProposeUi = st === 'tutor_accepted' && proposed.length > 0;
        const pick = tuteeSlotPick[tuteeSession.id];
        return (
        <div
          key={tuteeSession.id}
          onMouseEnter={() => setHovered(`learn-card-${tuteeSession.id}`)}
          onMouseLeave={() => setHovered(null)}
          style={{
            background: hovered === `learn-card-${tuteeSession.id}`
              ? '#f9fafb' : '#fff',
            borderRadius: '16px',
            border: `1px solid ${hovered === `learn-card-${tuteeSession.id}`
              ? '#1a5f4a' : '#e7e5e4'}`,
            padding: '24px',
            marginBottom: '16px',
            boxShadow: hovered === `learn-card-${tuteeSession.id}`
              ? '0 4px 16px rgba(0,0,0,0.10)'
              : '0 1px 4px rgba(0,0,0,0.04)',
            transform: hovered === `learn-card-${tuteeSession.id}`
              ? 'translateY(-2px)' : 'none',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>{tuteeSession.initials}</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>
                {tuteeSession.subject || (Array.isArray(tuteeSession.subjects) ? tuteeSession.subjects[0] : null) || '—'}: {tuteeSession.topic || (Array.isArray(tuteeSession.topics) ? tuteeSession.topics[0] : null) || '—'}</h3>
                <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '8px' }}>with {tuteeSession.tutor}</p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#57534e', flexWrap: 'wrap' }}>
                  <span>📅 {sched.date}</span>
                  {sched.time ? <span>🕐 {sched.time}</span> : null}
                  <span>📍 {venueLine}</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusBadge state={tuteeSession.state} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#57534e', marginTop: '8px' }}>{learningTuteeStatusLabel(tuteeSession)}</div>
            </div>
          </div>
          {showProposeUi && (
            <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>Your tutor proposed these times — please confirm one:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {proposed.map((slot, idx) => {
                  const key = `${slot.date}-${slot.hour_slot}-${idx}`;
                  const label = formatSlot(slot);
                  const selected = pick && pick.date === slot.date && Number(pick.hour_slot) === Number(slot.hour_slot);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTuteeSlotPick((prev) => ({ ...prev, [tuteeSession.id]: slot }))}
                      style={{
                        padding: '8px 14px',
                        background: selected ? '#22c55e' : '#fff',
                        color: selected ? '#fff' : '#166534',
                        border: `1px solid ${selected ? '#16a34a' : '#86efac'}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!pick}
                onClick={() => handleConfirmTuteeSlot(tuteeSession.id, pick)}
                style={{
                  padding: '10px 20px',
                  background: pick ? '#1a5f4a' : '#e7e5e4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: pick ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                }}
              >
                Confirm
              </button>
            </div>
          )}
          {st === 'pending_confirmation' && (
            <div style={{ marginTop: '16px', padding: '16px', background: '#ecfdf5', borderRadius: '12px', border: '1px solid #6ee7b7' }}>
              <p style={{ fontSize: '14px', color: '#166534', fontWeight: '600', marginBottom: '8px' }}>✓ Slot confirmed! Complete payment to confirm your session.</p>
              <p style={{ fontSize: '14px', color: '#1c1917', marginBottom: '12px' }}>
                Session Fee:{' '}
                {sessionFees[tuteeSession.id] != null
                  ? `$${Number(sessionFees[tuteeSession.id]).toFixed(2)}`
                  : (tuteeSession.fee && tuteeSession.fee !== '—' ? tuteeSession.fee : '—')}
              </p>
              <button
                type="button"
                onClick={() => openPaymentModal(tuteeSession)}
                onMouseEnter={() => setHovered(`learn-pay-${tuteeSession.id}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: '10px 20px',
                  background: hovered === `learn-pay-${tuteeSession.id}` ? '#16a34a' : '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                }}
              >
                💳 Pay Now
              </button>
            </div>
          )}
          <div style={{ marginTop: '20px', borderTop: '1px solid #e7e5e4' }}>
            {tuteeSession.state === 'CONFIRMED' && (
              <div style={{
                textAlign: 'center',
                padding: '12px 0 0 0',
                fontSize: '15px',
                fontWeight: '700',
                color: '#16a34a',
              }}
              >
                ✓ Paid{' '}
                {sessionFees[tuteeSession.id] != null
                  ? `$${Number(sessionFees[tuteeSession.id]).toFixed(2)}`
                  : tuteeSession.fee && tuteeSession.fee !== '—'
                    ? tuteeSession.fee
                    : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', paddingTop: tuteeSession.state === 'CONFIRMED' ? '12px' : '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { setSelectedSession(tuteeSession); setShowDetailPanel(true); }}
              onMouseEnter={() => setHovered(`learn-view-${tuteeSession.id}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '10px 20px',
                background: hovered === `learn-view-${tuteeSession.id}` ? '#145040' : '#1a5f4a',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              View Details
            </button>
            <button
              type="button"
              onClick={() => navigate(`/session/${tuteeSession.id}/chat`)}
              onMouseEnter={() => setHovered(`learn-msg-${tuteeSession.id}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '10px 20px',
                background: hovered === `learn-msg-${tuteeSession.id}` ? '#eff6ff' : '#fff',
                color: '#3b82f6',
                border: `1px solid ${hovered === `learn-msg-${tuteeSession.id}` ? '#3b82f6' : '#93c5fd'}`,
                borderRadius: '8px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              💬 Message Tutor
            </button>
            {tuteeSession.state === 'CONFIRMED' && tuteeSession.scheduled_at && new Date() > new Date(tuteeSession.scheduled_at) && (
              <button
                type="button"
                onClick={() => navigate(`/feedback/${tuteeSession.id}`)}
                onMouseEnter={() => setHovered(`learn-fb-${tuteeSession.id}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: '10px 20px',
                  background: hovered === `learn-fb-${tuteeSession.id}` ? '#d97706' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                ⭐ Leave Feedback
              </button>
            )}
            <button
              type="button"
              onMouseEnter={() => setHovered(`learn-cancel-${tuteeSession.id}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '10px 20px',
                background: hovered === `learn-cancel-${tuteeSession.id}` ? '#fef2f2' : '#fff',
                color: '#ef4444',
                border: `1px solid ${hovered === `learn-cancel-${tuteeSession.id}` ? '#ef4444' : '#fecaca'}`,
                borderRadius: '8px',
                fontWeight: '500',
                cursor: 'pointer',
                marginLeft: 'auto',
                transition: 'all 0.2s ease',
              }}
            >
              Cancel
            </button>
            </div>
          </div>
        </div>
        );
      })}
    </div>
    );
  };

  // MY TUTORING TAB
  const TutoringTab = () => {
    const slotsForRequest = (req) => {
      const raw = req.time_slots || [];
      if (raw.length === 0) return [];
      return raw.map((s) => (typeof s === 'object' ? s : { date: s, hour_slot: s }));
    };

    const tutoringTabKeys = [
      { key: 'incoming', label: 'Incoming Requests' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'past', label: 'Past' },
      { key: 'cancelled', label: 'Cancelled' },
    ];
    const tutoringIncomingBadgeCount = mergedTutorIncoming.length;
    const tutoringUpcomingBadgeCount = tutoringSessions.filter((s) =>
      normalizeSessionStatus(s) === 'confirmed',
    ).length;
    const tutoringFilteredSessions = tutoringSessions.filter((s) => {
      const st = normalizeSessionStatus(s);
      if (tutoringFilterTab === 'upcoming') return st === 'confirmed';
      if (tutoringFilterTab === 'past') {
        return ['completed', 'completed_attended', 'completed_no_show'].includes(st);
      }
      if (tutoringFilterTab === 'cancelled') return st === 'cancelled';
      return false;
    });

    return (
    <div>
      {/* Tutor Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[{ label: 'Rating', value: '⭐ 4.8' }, { label: 'Weekly Hours', value: '2/5' }, { label: 'Reliability', value: '98%' }, { label: 'Total Sessions', value: '24' }].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e7e5e4', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a5f4a' }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: '#57534e' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {tutoringTabKeys.map(({ key, label }) => {
          const sel = tutoringFilterTab === key;
          const h = hovered === `tutor-tab-${key}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTutoringFilterTab(key)}
              onMouseEnter={() => setHovered(`tutor-tab-${key}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '10px 20px',
                background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'),
                color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'),
                border: `1px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`,
                borderRadius: '8px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
              {key === 'incoming' && tutoringIncomingBadgeCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginLeft: '6px',
                }}>{tutoringIncomingBadgeCount}</span>
              )}
              {key === 'upcoming' && tutoringUpcomingBadgeCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginLeft: '6px',
                }}>{tutoringUpcomingBadgeCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Incoming Requests with Accept/Decline/Message (SRS 2.12.6.3) */}
      {tutoringFilterTab === 'incoming' && (mergedTutorIncoming.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '48px 24px', textAlign: 'center', color: '#57534e' }}>
          No incoming requests at this time
        </div>
      ) : (
        mergedTutorIncoming.map((req) => {
          const incomingCardId = req.session_id || req.id;
          return (
        <div
          key={incomingCardId}
          onMouseEnter={() => setHovered(`tutor-card-${incomingCardId}`)}
          onMouseLeave={() => setHovered(null)}
          style={{
            background: hovered === `tutor-card-${incomingCardId}` ? '#f9fafb' : '#fff',
            borderRadius: '16px',
            border: hovered === `tutor-card-${incomingCardId}` ? '1px solid #1a5f4a' : '2px solid #f59e0b',
            padding: '24px',
            marginBottom: '16px',
            boxShadow: hovered === `tutor-card-${incomingCardId}`
              ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.04)',
            transform: hovered === `tutor-card-${incomingCardId}` ? 'translateY(-2px)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>{req.initials}</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>
                  {(() => {
                    const subjectDisplay = req.subject || req.subjects?.[0];
                    const topicDisplay = req.topic || req.topics?.[0];
                    if (topicDisplay) return `${subjectDisplay || '—'} • ${topicDisplay}`;
                    return subjectDisplay || '—';
                  })()}
                </h3>
                <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '4px' }}>{req.student || req.tutee_full_name || req.tutee_name || 'Student'} • {req.level || req.academic_level || '—'}</p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#57534e', flexWrap: 'wrap' }}>
                  <span>📅 Requested: {req.date || (req.created_at ? new Date(req.created_at).toLocaleDateString('en-SG', {weekday:'short', day:'numeric', month:'short'}) : '—')} at {req.time || (req.created_at ? new Date(req.created_at).toLocaleTimeString('en-SG', {hour:'numeric', minute:'2-digit', hour12:true}) : '—')} | {urgencyLabel[req.urgency] || urgencyLabel[req.urgency_level] || urgencyLabel[req.urgency_category] || req.urgency || '—'}</span>
                  {req.distance_bucket && req.distance_bucket !== '—' && <span>📍 {req.distance_bucket}</span>}
                </div>
                {(req.time_slots?.length > 0) && (
                  <div style={{ fontSize: '13px', color: '#57534e', marginTop: '8px' }}>
                    Preferred slots: {req.time_slots.map((s) => formatSlot(s)).filter(Boolean).join(', ') || '—'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(() => {
            const sid = req.session_id || req.id;
            const st = (req.status || req.state || '').toLowerCase().replace(/\s/g, '_');
            if (slotsProposedSessionId === sid) {
              return (
                <div style={{ marginTop: '12px', padding: '14px 16px', background: '#ecfdf5', borderRadius: '12px', border: '1px solid #6ee7b7', color: '#166534', fontSize: '15px', fontWeight: '600' }}>
                  ✓ Time slots proposed. Waiting for tutee to confirm.
                </div>
              );
            }
            const needsPropose = st === 'tutor_accepted' || proposingSessionId === sid;
            if (needsPropose) {
              return (
            <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px', marginTop: '12px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>Select time slots to propose to tutee:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {slotsForRequest(req).map((slot, idx) => {
                  const key = typeof slot === 'object' ? `${slot.date || slot.day_of_week}-${slot.hour_slot}-${idx}` : `slot-${idx}`;
                  const label = formatSlot(slot);
                  const isSelected = proposedSlots.some((s) => JSON.stringify(s) === JSON.stringify(slot));
                  return (
                    <button key={key} onClick={() => toggleProposedSlot(slot)} style={{ padding: '8px 14px', background: isSelected ? '#22c55e' : '#fff', color: isSelected ? '#fff' : '#166534', border: `1px solid ${isSelected ? '#16a34a' : '#86efac'}`, borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>{label}</button>
                  );
                })}
                {slotsForRequest(req).length === 0 && <span style={{ fontSize: '13px', color: '#57534e' }}>No preferred slots from tutee</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleProposeSlots(sid)} disabled={proposedSlots.length === 0} onMouseEnter={() => setHovered('propose-btn')} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 20px', background: proposedSlots.length > 0 ? (hovered === 'propose-btn' ? '#16a34a' : '#22c55e') : '#e7e5e4', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: proposedSlots.length > 0 ? 'pointer' : 'not-allowed', fontSize: '14px' }}>Propose</button>
                <button onClick={() => { setProposingSessionId(null); setProposedSlots([]); }} style={{ padding: '10px 20px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              </div>
            </div>
              );
            }
            return (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => handleAccept(sid)} onMouseEnter={() => setHovered(`tutor-accept-${req.id}`)} onMouseLeave={() => setHovered(null)} style={{ flex: 1, padding: '14px', background: hovered === `tutor-accept-${req.id}` ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>✓ Accept Request</button>
            <button onClick={() => handleDecline(sid)} onMouseEnter={() => setHovered(`tutor-decline-${req.id}`)} onMouseLeave={() => setHovered(null)} style={{ flex: 1, padding: '14px', background: hovered === `tutor-decline-${req.id}` ? '#fef2f2' : '#fff', color: '#ef4444', border: `1px solid ${hovered === `tutor-decline-${req.id}` ? '#ef4444' : '#fecaca'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>✕ Decline</button>
            <button onClick={() => navigate(`/session/${sid}/chat`)} onMouseEnter={() => setHovered(`tutor-msg-${req.id}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 24px', background: hovered === `tutor-msg-${req.id}` ? '#eff6ff' : '#fff', color: '#3b82f6', border: `1px solid ${hovered === `tutor-msg-${req.id}` ? '#3b82f6' : '#93c5fd'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>💬 Message</button>
          </div>
            );
          })()}
        </div>
          );
        })
      ))}
      {tutoringFilterTab !== 'incoming' && (
        tutoringFilteredSessions.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '48px 24px', textAlign: 'center', color: '#57534e' }}>
            No sessions in this section.
          </div>
        ) : (
          tutoringFilteredSessions.map((sess) => {
            const sid = sess.session_id || sess.id;
            const sched = learningScheduleDisplay(sess);
            const venueLine = venueDisplayForLearning(sess);
            const cardHoverId = sess.id || sid;
            return (
              <div
                key={sid}
                onMouseEnter={() => setHovered(`tutor-card-${cardHoverId}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: hovered === `tutor-card-${cardHoverId}` ? '#f9fafb' : '#fff',
                  borderRadius: '16px',
                  border: hovered === `tutor-card-${cardHoverId}` ? '1px solid #1a5f4a' : '1px solid #e7e5e4',
                  padding: '24px',
                  marginBottom: '16px',
                  boxShadow: hovered === `tutor-card-${cardHoverId}`
                    ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.04)',
                  transform: hovered === `tutor-card-${cardHoverId}` ? 'translateY(-2px)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ width: '56px', height: '56px', background: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>{sess.initials}</div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>{sess.subject}: {sess.topic}</h3>
                      <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '8px' }}>{sess.tutee || 'Student'}</p>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#57534e', flexWrap: 'wrap' }}>
                        <span>📅 {sched.date}</span>
                        {sched.time ? <span>🕐 {sched.time}</span> : null}
                        <span>📍 {venueLine}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge state={sess.state} />
                    <button
                      type="button"
                      onClick={() => navigate(`/session/${sid}/chat`)}
                      onMouseEnter={() => setHovered(`tutor-msg-card-${cardHoverId}`)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        marginTop: '12px',
                        padding: '10px 16px',
                        background: hovered === `tutor-msg-card-${cardHoverId}` ? '#eff6ff' : '#fff',
                        color: '#3b82f6',
                        border: `1px solid ${hovered === `tutor-msg-card-${cardHoverId}` ? '#3b82f6' : '#93c5fd'}`,
                        borderRadius: '8px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      💬 Message
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )
      )}
    </div>
    );
  };

  // NOTIFICATIONS TAB
  const NotificationsTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          {['All', 'Reminders', 'Requests', 'Feedback', 'System'].map((filter, i) => {
            const sel = i === 0;
            const h = hovered === `notif-${filter}`;
            return (
              <button key={filter} onMouseEnter={() => setHovered(`notif-${filter}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 20px', background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'), color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `1px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '8px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' }}>{filter}</button>
            );
          })}
        </div>
        {notifications.some((n) => n.unread) && (
          <button onClick={handleMarkAllNotificationsRead} style={{ padding: '10px 20px', background: '#fff', color: '#1a5f4a', border: '1px solid #1a5f4a', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}>Mark all read</button>
        )}
      </div>

      {notifications.map((notif) => {
        const nid = notif.id ?? notif.notification_id;
        const rowHover = hovered === `notif-card-${nid}`;
        return (
          <div
            key={nid}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(notif); } }}
            onClick={() => handleNotificationClick(notif)}
            onMouseEnter={() => setHovered(`notif-card-${nid}`)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: rowHover ? '#f0faf5' : '#fff',
              borderRadius: '12px',
              border: `1px solid ${notif.unread ? '#bbf7d0' : '#e7e5e4'}`,
              padding: '20px',
              marginBottom: '12px',
              display: 'flex',
              gap: '16px',
              alignItems: 'stretch',
              borderLeft: notif.unread ? '4px solid #22c55e' : 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <div style={{ width: '48px', height: '48px', background: notif.unread ? '#dcfce7' : '#f5f5f4', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>{notif.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '8px' }}>
                <h4 style={{ fontWeight: '600', color: '#1c1917', margin: 0 }}>{notif.title}</h4>
                {notif.unread && <span style={{ width: '10px', height: '10px', background: '#22c55e', borderRadius: '50%', flexShrink: 0, marginTop: '6px' }}></span>}
              </div>
              <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '8px' }}>{notif.message}</p>
              <span style={{ fontSize: '13px', color: '#a8a29e' }}>{notif.time}</span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
              flexShrink: 0,
              gap: '4px',
            }}
            >
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a5f4a', whiteSpace: 'nowrap' }}>{getNotificationActionLabel(notif)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // MESSAGING CHANNEL UI (SRS 2.9)
  const MessagingPanel = () => (
    <div style={{ position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh', background: '#fff', boxShadow: '-10px 0 40px rgba(0,0,0,0.1)', zIndex: 1001, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a5f4a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>ST</div>
          <div>
            <div style={{ fontWeight: '600', color: '#fff' }}>Sarah Tan</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Calculus Session • Tue 3 PM</div>
          </div>
        </div>
        <button onClick={() => setShowMessaging(false)} onMouseEnter={() => setHovered('msg-close')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'msg-close' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', color: '#fff', fontSize: '16px', transition: 'all 0.15s ease' }}>✕</button>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#f5f5f4' }}>
        {/* System Message */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{ background: '#e7e5e4', padding: '6px 12px', borderRadius: '12px', fontSize: '12px', color: '#57534e' }}>Session confirmed • Jan 14, 2025</span>
        </div>

        {/* Received Message */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div style={{ width: '32px', height: '32px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '12px', flexShrink: 0 }}>ST</div>
          <div>
            <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '12px 12px 12px 4px', maxWidth: '260px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: '14px', color: '#1c1917', margin: 0 }}>Hi! Looking forward to our session. Should we meet at the library entrance?</p>
            </div>
            <span style={{ fontSize: '11px', color: '#a8a29e', marginTop: '4px', display: 'block' }}>10:30 AM</span>
          </div>
        </div>

        {/* Sent Message */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexDirection: 'row-reverse' }}>
          <div style={{ width: '32px', height: '32px', background: '#1a5f4a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '12px', flexShrink: 0 }}>JD</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#1a5f4a', padding: '12px 16px', borderRadius: '12px 12px 4px 12px', maxWidth: '260px', display: 'inline-block' }}>
              <p style={{ fontSize: '14px', color: '#fff', margin: 0 }}>Sounds good! I'll be there 5 mins early. See you then!</p>
            </div>
            <span style={{ fontSize: '11px', color: '#a8a29e', marginTop: '4px', display: 'block' }}>10:35 AM ✓</span>
          </div>
        </div>

        {/* Received Message */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div style={{ width: '32px', height: '32px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '12px', flexShrink: 0 }}>ST</div>
          <div>
            <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '12px 12px 12px 4px', maxWidth: '260px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: '14px', color: '#1c1917', margin: 0 }}>Perfect! Also, please bring your lecture notes if you have them 📚</p>
            </div>
            <span style={{ fontSize: '11px', color: '#a8a29e', marginTop: '4px', display: 'block' }}>10:36 AM</span>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #e7e5e4', background: '#fff' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, background: '#f5f5f4', borderRadius: '12px', padding: '12px 16px' }}>
            <textarea rows={1} placeholder="Type a message..." style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <button onMouseEnter={() => setHovered('msg-send')} onMouseLeave={() => setHovered(null)} style={{ width: '44px', height: '44px', background: hovered === 'msg-send' ? '#2d7a61' : '#1a5f4a', border: 'none', borderRadius: '12px', cursor: 'pointer', color: '#fff', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>➤</button>
        </div>
        <p style={{ fontSize: '11px', color: '#a8a29e', marginTop: '8px', textAlign: 'center' }}>Messages are for session coordination only</p>
      </div>
    </div>
  );

  // SESSION DETAIL PANEL (SRS 2.9: Messaging Channel)
  const DetailPanel = () => {
    const s = selectedSession || {};
    const sched = learningScheduleDisplay(s);
    const venueLine = venueDisplayForLearning(s);
    const st = normalizeSessionStatus(s);
    const proposed = (s.proposed_slots || []).map((sl) => slotToProposedPayload(sl)).filter(Boolean);
    const showTuteeProposeUi = activeTab === 'learning' && st === 'tutor_accepted' && proposed.length > 0;
    const pick = s.id ? tuteeSlotPick[s.id] : null;
    return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh', overflowY: 'auto', zIndex: 1000, background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1c1917' }}>Session Details</h2>
        <button onClick={() => { setShowDetailPanel(false); setSelectedSession(null); }} style={{ background: '#f5f5f4', border: 'none', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>
      <div style={{ padding: '24px' }}>
        <StatusBadge state={s.state || 'CONFIRMED'} />
        <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917', marginTop: '16px', marginBottom: '8px' }}>{s.subject || '—'}: {s.topic || '—'}</h3>
        <p style={{ color: '#57534e', marginBottom: '24px' }}>{s.academic_level || '—'}</p>

        <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Tutor</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>{s.initials || '??'}</div>
            <div>
              <div style={{ fontWeight: '600', color: '#1c1917' }}>{s.tutor || '—'}</div>
              <div style={{ fontSize: '13px', color: '#57534e' }}>⭐ 4.9 • 98% reliable</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Date & Time</div>
          <div style={{ fontWeight: '600', color: '#1c1917' }}>📅 {sched.date || '—'}</div>
          {sched.time ? <div style={{ color: '#57534e' }}>🕐 {sched.time}</div> : null}
        </div>

        <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Venue</div>
          <div style={{ fontWeight: '600', color: '#1c1917' }}>📍 {venueLine}</div>
          <div style={{ background: '#e7e5e4', height: '120px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a8a29e', marginTop: '12px' }}>🗺️ OneMap</div>
        </div>

        {showTuteeProposeUi && (
          <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>Your tutor proposed these times — please confirm one:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {proposed.map((slot, idx) => {
                const key = `${slot.date}-${slot.hour_slot}-${idx}`;
                const label = formatSlot(slot);
                const selected = pick && pick.date === slot.date && Number(pick.hour_slot) === Number(slot.hour_slot);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => s.id && setTuteeSlotPick((prev) => ({ ...prev, [s.id]: slot }))}
                    style={{
                      padding: '8px 14px',
                      background: selected ? '#22c55e' : '#fff',
                      color: selected ? '#fff' : '#166534',
                      border: `1px solid ${selected ? '#16a34a' : '#86efac'}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!pick}
              onClick={() => s.id && pick && handleConfirmTuteeSlot(s.id, pick)}
              style={{
                padding: '10px 20px',
                background: pick ? '#1a5f4a' : '#e7e5e4',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: pick ? 'pointer' : 'not-allowed',
                fontSize: '14px',
              }}
            >
              Confirm
            </button>
          </div>
        )}

        <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Payment</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#57534e' }}>{activeTab === 'learning' ? learningTuteeStatusLabel(s) : paymentStatusLabel(s)}</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#1a5f4a' }}>{s.fee || '—'}</span>
          </div>
        </div>

        {/* Action Buttons with Messaging (SRS 2.9) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => setShowMessaging(true)} onMouseEnter={() => setHovered('detail-msg')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-msg' ? '#2563eb' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>💬 Message Tutor</button>
          {activeTab === 'learning' && s.state === 'PENDING_CONFIRM' && <button onClick={() => openPaymentModal(s)} onMouseEnter={() => setHovered('detail-pay')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-pay' ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>💳 Pay Now</button>}
          {(s.state === 'CONFIRMED' || s.state === 'COMPLETED') && <button onClick={() => handleMarkOutcome(s.id, 'attended')} onMouseEnter={() => setHovered('detail-done')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-done' ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>✓ Mark as Completed</button>}
          {(activeTab !== 'learning' || s.state !== 'CONFIRMED' || (s.scheduled_at && new Date() > new Date(s.scheduled_at))) && (
          <button onClick={() => s.id && navigate(`/feedback/${s.id}`)} onMouseEnter={() => setHovered('detail-fb')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-fb' ? '#d97706' : '#f59e0b', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>⭐ Leave Feedback</button>
          )}
          <button onMouseEnter={() => setHovered('detail-res')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-res' ? '#f0faf5' : '#fff', color: '#1c1917', border: `1px solid ${hovered === 'detail-res' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>📅 Reschedule</button>
          <button onMouseEnter={() => setHovered('detail-cancel')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'detail-cancel' ? '#fef2f2' : '#fff', color: '#ef4444', border: `1px solid ${hovered === 'detail-cancel' ? '#ef4444' : '#fecaca'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>Cancel Session</button>
        </div>
      </div>
    </div>
    );
  };

return (
    <>
      <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab} badges={tabBadges}>
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'learning' && <LearningTab />}
        {activeTab === 'tutoring' && <TutoringTab />}
        {activeTab === 'chats' && (
          <ChatsTab
            chatSessions={chatSessions}
            selectedChatSessionId={selectedChatSessionId}
            setSelectedChatSessionId={stableSetChatSessionId}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            currentUserId={user?.id || user?.user_id}
            hovered={hovered}
            setHovered={setHovered}
          />
        )}
        {activeTab === 'notifications' && <NotificationsTab />}
      </DashboardLayout>
      {showDetailPanel && <div onClick={() => { setShowDetailPanel(false); setSelectedSession(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }}></div>}
      {showDetailPanel && <DetailPanel />}
      {paymentModalSession && (() => {
        const ps = paymentModalSession;
        const modalFeeNum = ps?.id != null && sessionFees[ps.id] != null ? sessionFees[ps.id] : null;
        const modalFeeStr = modalFeeNum != null ? `$${Number(modalFeeNum).toFixed(2)}` : '—';
        const schedM = learningScheduleDisplay(ps);
        const dtLine = [schedM.date, schedM.time].filter(Boolean).join(', ');
        const dur = ps.duration_hours ?? ps.duration ?? 1;
        const bankRef = ps.id ? String(ps.id).slice(0, 8).toUpperCase() : '—';
        const subjTopic = `${ps.subject || '—'} • ${ps.topic || '—'}`;
        return (
          <div
            role="presentation"
            onClick={(e) => { if (e.target === e.currentTarget && !paymentLoading) closePaymentModal(); }}
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'relative', background: '#fff', borderRadius: '24px', maxWidth: '480px', width: '100%', padding: '32px', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}
            >
              {!paymentSuccess && (
                <button
                  type="button"
                  disabled={paymentLoading}
                  onClick={() => !paymentLoading && closePaymentModal()}
                  onMouseEnter={() => setHovered('modal-close')}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: hovered === 'modal-close' ? '#e7e5e4' : '#f5f5f4',
                    border: 'none',
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    cursor: paymentLoading ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✕
                </button>
              )}
              {paymentSuccess ? (
                <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                  <div style={{ fontSize: '56px', marginBottom: '16px' }}>✓</div>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>Payment Successful! 🎉</h2>
                  <p style={{ color: '#57534e', fontSize: '15px' }}>Your session is confirmed. Good luck with your studies!</p>
                </div>
              ) : paymentError ? (
                <div style={{ textAlign: 'center', padding: '16px 8px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px', color: '#ef4444' }}>✗</div>
                  <p style={{ color: '#b91c1c', marginBottom: '20px', fontSize: '15px' }}>{paymentError}</p>
                  <button
                    type="button"
                    onClick={() => setPaymentError(null)}
                    onMouseEnter={() => setHovered('pay-retry')}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      padding: '12px 24px',
                      background: hovered === 'pay-retry' ? '#145040' : '#1a5f4a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917', marginBottom: '8px', paddingRight: '40px' }}>💳 Complete Payment</h2>
                  <p style={{ color: '#57534e', marginBottom: '20px', fontSize: '14px' }}>Secure payment for your tutoring session</p>
                  <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '20px', fontSize: '14px', color: '#1c1917' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '600' }}>{subjTopic}</div>
                    <div style={{ marginBottom: '4px' }}>Tutor: {ps.tutor || '—'}</div>
                    <div style={{ marginBottom: '4px' }}>Date &amp; time: {dtLine || '—'}</div>
                    <div style={{ marginBottom: '4px' }}>Duration: {dur} hour(s)</div>
                    <div style={{ fontWeight: '700', color: '#1a5f4a' }}>Amount: {modalFeeStr}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e7e5e4', paddingBottom: '8px' }}>
                    {[
                      { id: 'paynow', label: 'PayNow QR' },
                      { id: 'card', label: 'Credit/Debit Card' },
                      { id: 'bank', label: 'Bank Transfer' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPaymentTab(t.id)}
                        onMouseEnter={() => setHovered(`pay-tab-${t.id}`)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: paymentTab === t.id ? '#1a5f4a' : hovered === `pay-tab-${t.id}` ? '#e7e5e4' : '#f5f5f4',
                          color: paymentTab === t.id ? '#fff' : '#57534e',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {paymentTab === 'paynow' && (
                    <div>
                      <div style={{ width: '200px', height: '200px', margin: '0 auto 12px', background: '#e7e5e4', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>📱</div>
                      <p style={{ textAlign: 'center', color: '#57534e', marginBottom: '12px', fontSize: '14px' }}>Scan with your banking app</p>
                      <p style={{ textAlign: 'center', marginBottom: '4px', fontSize: '14px' }}>UEN: <strong>PEERLEARN2024UEN</strong></p>
                      <p style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>Amount: <strong>{modalFeeStr}</strong></p>
                      <button
                        type="button"
                        disabled={paymentLoading}
                        onClick={handlePaymentModalConfirm}
                        onMouseEnter={() => setHovered('pay-paynow-btn')}
                        onMouseLeave={() => setHovered(null)}
                        style={{ width: '100%', padding: '14px', background: paymentLoading ? '#86efac' : hovered === 'pay-paynow-btn' ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: paymentLoading ? 'wait' : 'pointer', transition: 'all 0.2s ease' }}
                      >
                        {paymentLoading ? '⏳ Processing...' : '✓ I have completed payment'}
                      </button>
                    </div>
                  )}
                  {paymentTab === 'card' && (
                    <div>
                      <input placeholder="1234 5678 9012 3456" style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px' }} />
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                        <input placeholder="MM/YY" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px' }} />
                        <input placeholder="CVV" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px' }} />
                      </div>
                      <input placeholder="Cardholder name" style={{ width: '100%', padding: '12px', marginBottom: '8px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px' }} />
                      <p style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '12px' }}>(Demo only — no real charge)</p>
                      <button
                        type="button"
                        disabled={paymentLoading}
                        onClick={handlePaymentModalConfirm}
                        onMouseEnter={() => setHovered('pay-card-btn')}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: paymentLoading ? '#86efac' : hovered === 'pay-card-btn' ? '#16a34a' : '#22c55e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: '700',
                          cursor: paymentLoading ? 'wait' : 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {paymentLoading ? '⏳ Processing...' : `Pay ${modalFeeStr}`}
                      </button>
                    </div>
                  )}
                  {paymentTab === 'bank' && (
                    <div style={{ fontSize: '14px', color: '#1c1917' }}>
                      <p style={{ marginBottom: '8px' }}>Bank: <strong>DBS Bank</strong></p>
                      <p style={{ marginBottom: '8px' }}>Account No: <strong>123-456789-0</strong></p>
                      <p style={{ marginBottom: '8px' }}>Reference: <strong>{bankRef}</strong></p>
                      <p style={{ marginBottom: '16px', color: '#57534e', fontSize: '13px' }}>Transfer within 24 hours to secure your slot</p>
                      <button
                        type="button"
                        disabled={paymentLoading}
                        onClick={handlePaymentModalConfirm}
                        onMouseEnter={() => setHovered('pay-bank-btn')}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: paymentLoading ? '#86efac' : hovered === 'pay-bank-btn' ? '#16a34a' : '#22c55e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: '700',
                          cursor: paymentLoading ? 'wait' : 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {paymentLoading ? 'Processing...' : '✓ I have transferred the payment'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}
      {showMessaging && <MessagingPanel />}
      {showMessaging && <div onClick={() => setShowMessaging(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 }}></div>}
    </>
  );
};

export default Dashboard;
