import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const PenaltyAppeal = () => {
  const navigate = useNavigate();
  const { recordId } = useParams();
  const { state } = useLocation();

  // Optional context passed via router state from the dashboard/notification
  const penaltyType = state?.penalty_type ?? null;
  const issuedAt = state?.issued_at ?? null;
  const appealDeadline = state?.appeal_deadline ?? null;

  const [appealText, setAppealText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const penaltyLabel = {
    warning: 'Warning',
    suspension: 'Suspension',
    ban: 'Ban',
  }[penaltyType] ?? penaltyType ?? 'Penalty';

  const penaltyColor = {
    warning: '#f59e0b',
    suspension: '#ef4444',
    ban: '#7f1d1d',
  }[penaltyType] ?? '#ef4444';

  const handleSubmit = async () => {
    setError(null);
    if (!appealText.trim()) {
      setError('Please provide your appeal statement.');
      return;
    }
    if (!recordId) {
      setError('No disciplinary record ID found. Please navigate here from your notification.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/appeals', { disciplinary_record_id: recordId, appeal_text: appealText.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to submit appeal.');
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
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>📨</div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Appeal Submitted</h2>
              <p style={{ color: '#57534e', marginBottom: '32px' }}>Our admin team will review your appeal. You will be notified of the outcome.</p>
              <button onClick={() => navigate('/dashboard')} onMouseEnter={() => setHovered('done')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: hovered === 'done' ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>Back to Dashboard</button>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚖️</div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Appeal a Penalty</h1>
                <p style={{ color: '#57534e', fontSize: '15px' }}>Explain why you believe this penalty should be reconsidered</p>
              </div>

              {/* Penalty summary card */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 20px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: penaltyType ? '8px' : '0' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Record ID</span>
                  <span style={{ fontSize: '13px', color: '#1c1917', fontFamily: 'monospace' }}>{recordId || '—'}</span>
                </div>
                {penaltyType && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Penalty type</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: penaltyColor }}>{penaltyLabel}</span>
                  </div>
                )}
                {issuedAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Issued on</span>
                    <span style={{ fontSize: '13px', color: '#1c1917' }}>{formatDate(issuedAt)}</span>
                  </div>
                )}
                {appealDeadline && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Appeal deadline</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444' }}>{formatDate(appealDeadline)}</span>
                  </div>
                )}
              </div>

              {error && <p style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}

              {/* Appeal text */}
              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
                  Your Appeal Statement <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(1–500 characters)</span>
                </label>
                <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '10px' }}>Clearly explain the context, any relevant evidence, and why the penalty should be reconsidered.</p>
                <textarea rows={6} maxLength={500} value={appealText} onChange={(e) => setAppealText(e.target.value)} placeholder="Describe your case…" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
                <div style={{ textAlign: 'right', fontSize: '12px', color: appealText.length > 450 ? '#f59e0b' : '#a8a29e', marginTop: '4px', fontWeight: appealText.length > 450 ? '500' : '400' }}>{appealText.length} / 500</div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => navigate(-1)} onMouseEnter={() => setHovered('cancel')} onMouseLeave={() => setHovered(null)} style={{ flex: 1, padding: '14px', background: hovered === 'cancel' ? '#f5f5f4' : '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s ease' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={loading} onMouseEnter={() => !loading && setHovered('submit')} onMouseLeave={() => setHovered(null)} style={{ flex: 2, padding: '14px', background: loading ? '#1a5f4a' : (hovered === 'submit' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}>
                  {loading ? 'Submitting…' : 'Submit Appeal'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PenaltyAppeal;
