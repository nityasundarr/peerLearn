import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const CATEGORIES = [
  { value: 'misconduct', label: 'Misconduct' },
  { value: 'no_show', label: 'No-show' },
  { value: 'payment', label: 'Payment issue' },
  { value: 'other', label: 'Other' },
];

const formatSession = (s) => {
  const date = s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date TBD';
  const subject = s.subjects?.[0] || '—';
  return `${date} · ${subject} (${s.status})`;
};

const Complaints = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(state?.preselectedSessionId ?? '');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [complaintRef, setComplaintRef] = useState('');
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    api.get('/sessions')
      .then(({ data }) => setSessions(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (!sessionId || !category || !description.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/complaints', { session_id: sessionId, category, description: description.trim() });
      const ref = data?.complaint_id ? `CPL-${data.complaint_id.slice(0, 8).toUpperCase()}` : '';
      setComplaintRef(ref);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to submit complaint.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={PeerLearnLogo}
            alt="PeerLearn"
            style={{ height: '36px', objectFit: 'contain' }}
          />
        </div>
        <button onClick={() => navigate('/dashboard')} onMouseEnter={() => setHovered('back')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'back' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', padding: '10px 20px', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' }}>← Dashboard</button>
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ background: '#fff', borderRadius: '24px', padding: '40px', maxWidth: '560px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Complaint Submitted</h2>
              {complaintRef && (
                <div style={{ display: 'inline-block', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#166534', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference Number</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#14532d', fontFamily: 'monospace' }}>{complaintRef}</div>
                </div>
              )}
              <p style={{ color: '#57534e', marginBottom: '32px' }}>Our team will review your complaint and follow up within 3 business days.</p>
              <button onClick={() => navigate('/dashboard')} onMouseEnter={() => setHovered('done')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: hovered === 'done' ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>Back to Dashboard</button>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚨</div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Submit a Complaint</h1>
                <p style={{ color: '#57534e', fontSize: '15px' }}>Report an issue with a session or user</p>
              </div>

              {error && <p style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}

              {/* Session picker */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Session <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', background: '#fff', color: sessionId ? '#1c1917' : '#a8a29e' }}>
                  <option value="">Select a session…</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{formatSession(s)}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Category <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {CATEGORIES.map((c) => {
                    const sel = category === c.value;
                    return (
                      <button key={c.value} onClick={() => setCategory(c.value)} onMouseEnter={() => setHovered(`cat-${c.value}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '10px 18px', background: sel ? '#1a5f4a' : (hovered === `cat-${c.value}` ? '#f0faf5' : '#fff'), color: sel ? '#fff' : '#57534e', border: `1px solid ${sel ? '#1a5f4a' : (hovered === `cat-${c.value}` ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: 'all 0.15s ease' }}>{c.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
                  Description <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(1–500 characters)</span>
                </label>
                <textarea rows={5} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened in detail…" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
                <div style={{ textAlign: 'right', fontSize: '12px', color: description.length > 450 ? '#f59e0b' : '#a8a29e', marginTop: '4px', fontWeight: description.length > 450 ? '500' : '400' }}>{description.length} / 500</div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => navigate(-1)} onMouseEnter={() => setHovered('cancel')} onMouseLeave={() => setHovered(null)} style={{ flex: 1, padding: '14px', background: hovered === 'cancel' ? '#f5f5f4' : '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={loading} onMouseEnter={() => !loading && setHovered('submit')} onMouseLeave={() => setHovered(null)} style={{ flex: 2, padding: '14px', background: loading ? '#1a5f4a' : (hovered === 'submit' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}>
                  {loading ? 'Submitting…' : 'Submit Complaint'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Complaints;
