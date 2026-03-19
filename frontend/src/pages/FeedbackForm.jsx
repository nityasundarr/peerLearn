import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

// ============================================================
// SECTION 5: SESSION FEEDBACK FORM (UPDATED)
// Changes per SRS 2.10.3:
// - Rating 1-5 stars (2.10.3.1)
// - Written review optional, 1-100 chars (2.10.3.2-3)
// - Feedback optional, 1-100 chars (2.8.5.1-2)
// ============================================================

const TRAIT_OPTIONS = ['Patient', 'Clear explanations', 'Well prepared', 'Encouraging', 'Good examples', 'Thorough'];

// Stable component at module level to prevent remount-on-typing (which caused scroll-to-top)
const FeedbackNavHeader = ({ hovered, setHovered }) => (
  <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
    </div>
    <nav style={{ display: 'flex', gap: '8px' }}>
      {['🏠 Dashboard', '🎓 Get Help', '💡 Offer Help'].map((item, i) => (
        <button key={i} onMouseEnter={() => setHovered(`nav-${i}`)} onMouseLeave={() => setHovered(null)} style={{ background: hovered === `nav-${i}` ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', padding: '10px 20px', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' }}>{item}</button>
      ))}
    </nav>
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <button onMouseEnter={() => setHovered('bell')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'bell' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', width: '44px', height: '44px', borderRadius: '10px', cursor: 'pointer', fontSize: '20px', transition: 'all 0.15s ease' }}>🔔</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px', borderRadius: '10px' }}>
        <div style={{ width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>JD</div>
        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>John Doe</span>
      </div>
    </div>
  </header>
);

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

const FeedbackForm = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [traits, setTraits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    api.get(`/sessions/${sessionId}`)
      .then(({ data }) => setSession(data))
      .catch(() => setSession(null));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    api.get(`/sessions/${sessionId}/rating`)
      .then(({ data }) => { if (data) setAlreadyRated(true); })
      .catch(() => {});
  }, [sessionId]);

  const handleSubmitRating = async () => {
    if (!sessionId || rating === 0) return;
    setError(null);
    setLoading(true);
    try {
      await api.post(`/sessions/${sessionId}/rating`, {
        score: rating,
        standout_traits: traits,
        review_text: reviewText || undefined,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkNoShow = async () => {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await api.patch(`/sessions/${sessionId}/outcome`, { outcome: 'no_show' });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const toggleTrait = (trait) => {
    setTraits((prev) => prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]);
  };

  const tutorName = session?.tutor_name || session?.tutor?.full_name || 'Tutor';
  const subject = session?.subjects?.[0] || session?.subject || '—';
  const topic = session?.topics?.[0] || session?.topic || '—';
  const scheduledAt = session?.scheduled_at || session?.date;
  const level = session?.academic_level || '—';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafaf9',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <FeedbackNavHeader />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}>
        <div style={{
        background: '#fff',
        borderRadius: '24px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>
            How was your session?
          </h1>
          <p style={{ color: '#57534e', fontSize: '15px' }}>
            Your feedback helps improve the TutorMatch community
          </p>
        </div>

        {/* Session Summary */}
        <div style={{
          background: '#f5f5f4',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            background: '#f59e0b',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '18px',
          }}>{tutorName.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>Session with {tutorName}</div>
            <div style={{ fontSize: '14px', color: '#57534e' }}>{topic} • {subject}</div>
            <div style={{ fontSize: '13px', color: '#a8a29e' }}>{formatDate(scheduledAt)} • {formatTime(scheduledAt)} • {level}</div>
          </div>
        </div>

        {alreadyRated && <p style={{ color: '#22c55e', marginBottom: '16px', textAlign: 'center' }}>You&apos;ve already submitted feedback for this session.</p>}
        {error && <p style={{ color: '#ef4444', marginBottom: '16px', textAlign: 'center' }}>{error}</p>}

        {/* Rating Stars (SRS 2.10.3.1: 1-5 stars) */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917', textAlign: 'center' }}>
            Overall Rating <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => !alreadyRated && setRating(star)}
                onMouseEnter={() => !alreadyRated && setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                disabled={alreadyRated}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '40px',
                  cursor: alreadyRated ? 'default' : 'pointer',
                  transition: 'transform 0.1s',
                  transform: (hoveredRating >= star || rating >= star) ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {(hoveredRating >= star || rating >= star) ? '⭐' : '☆'}
              </button>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '14px', color: '#57534e' }}>
            {rating === 0 && 'Select a rating'}
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Very Good'}
            {rating === 5 && 'Excellent!'}
          </div>
        </div>

        {/* Specific Aspect Ratings */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: '#1c1917' }}>
            Rate specific aspects
          </label>
          {[
            { label: 'Knowledge of subject', emoji: '🧠' },
            { label: 'Communication', emoji: '💬' },
            { label: 'Punctuality', emoji: '⏰' },
            { label: 'Helpfulness', emoji: '🤝' },
          ].map((aspect, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < 3 ? '1px solid #e7e5e4' : 'none',
            }}>
              <span style={{ fontSize: '14px', color: '#57534e' }}>
                {aspect.emoji} {aspect.label}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <span key={star} style={{ fontSize: '20px', cursor: 'pointer' }}>
                    {star <= 4 ? '⭐' : '☆'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
            What stood out? <span style={{ fontWeight: '400', color: '#a8a29e' }}>(select all that apply)</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {TRAIT_OPTIONS.map((label) => {
              const selected = traits.includes(label);
              return (
                <button key={label} onClick={() => !alreadyRated && toggleTrait(label)} onMouseEnter={() => !alreadyRated && setHovered(`trait-${label}`)} onMouseLeave={() => setHovered(null)} style={{
                  padding: '8px 14px',
                  background: selected ? (hovered === `trait-${label}` ? '#145040' : '#1a5f4a') : (hovered === `trait-${label}` ? '#f0faf5' : '#fff'),
                  color: selected ? '#fff' : '#57534e',
                  border: `1px solid ${selected ? '#1a5f4a' : (hovered === `trait-${label}` ? '#1a5f4a' : '#e7e5e4')}`,
                  borderRadius: '20px',
                  fontSize: '13px',
                  cursor: alreadyRated ? 'default' : 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.15s ease',
                }}>{selected && '✓ '}{label}</button>
              );
            })}
          </div>
        </div>

        {/* Written Review (SRS 2.10.3.2-3: optional, 1-500 chars) */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
            Written Review
            <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(optional, 1-500 characters)</span>
          </label>
          <textarea
            rows={3}
            maxLength={500}
            value={reviewText}
            onChange={(e) => !alreadyRated && setReviewText(e.target.value)}
            disabled={alreadyRated}
            placeholder="Share your experience to help other students..."
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #e7e5e4',
              fontSize: '15px',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              lineHeight: '1.5',
            }}
          />
          {/* Character Counter */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginTop: '6px' 
          }}>
            <span style={{ fontSize: '12px', color: reviewText.length > 0 && reviewText.length < 1 ? '#ef4444' : '#a8a29e' }}>
              {reviewText.length > 0 && reviewText.length < 1 && 'Minimum 1 character required'}
            </span>
            <span style={{ 
              fontSize: '12px', 
              color: reviewText.length > 450 ? '#f59e0b' : '#a8a29e',
              fontWeight: reviewText.length > 450 ? '500' : '400'
            }}>
              {reviewText.length} / 500
            </span>
          </div>
        </div>

        {/* Anonymous Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          background: '#f5f5f4',
          borderRadius: '10px',
          marginBottom: '24px',
        }}>
          <span style={{ fontSize: '14px', color: '#1c1917' }}>Submit feedback anonymously</span>
          <div style={{
            width: '50px',
            height: '28px',
            background: '#e7e5e4',
            borderRadius: '14px',
            position: 'relative',
            cursor: 'pointer',
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              background: '#fff',
              borderRadius: '50%',
              position: 'absolute',
              top: '2px',
              left: '2px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}></div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmitRating}
          disabled={rating === 0 || loading || alreadyRated}
          onMouseEnter={() => rating > 0 && !loading && !alreadyRated && setHovered('submit')}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: '100%',
            padding: '16px',
            background: rating > 0 && !alreadyRated ? (hovered === 'submit' ? '#2d7a61' : '#1a5f4a') : '#e7e5e4',
            color: rating > 0 && !alreadyRated ? '#fff' : '#a8a29e',
            border: 'none',
            borderRadius: '12px',
            fontWeight: '600',
            cursor: rating > 0 && !loading && !alreadyRated ? 'pointer' : 'not-allowed',
            fontSize: '16px',
            marginBottom: '12px',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.2s ease',
          }}
        >
          Submit Feedback
        </button>

        {/* Skip / Mark no-show */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => navigate('/dashboard')} onMouseEnter={() => setHovered('skip')} onMouseLeave={() => setHovered(null)} style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: '#57534e',
            border: 'none',
            fontSize: '14px',
            cursor: 'pointer',
            opacity: hovered === 'skip' ? 0.85 : 1,
            transition: 'all 0.15s ease',
          }}>
            Skip for now
          </button>
          <button onClick={handleMarkNoShow} disabled={loading || alreadyRated} onMouseEnter={() => !loading && !alreadyRated && setHovered('noshow')} onMouseLeave={() => setHovered(null)} style={{
            background: 'transparent',
            color: '#ef4444',
            border: 'none',
            fontSize: '13px',
            cursor: loading || alreadyRated ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            opacity: hovered === 'noshow' ? 0.85 : 1,
            transition: 'all 0.2s ease',
          }}>
            Mark as no-show
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackForm;
