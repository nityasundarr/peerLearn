import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

const getInitials = (name) =>
  (name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

const mapTutorToUi = (t) => ({
  id: t.tutor_id ?? t.id,
  name: t.full_name ?? t.name ?? 'Tutor',
  initials: getInitials(t.full_name ?? t.name),
  rating: t.avg_rating ?? t.rating ?? 0,
  sessions: t.completed_sessions ?? t.total_sessions ?? 0,
  reliability: t.reliability_score ?? 0,
  distance: t.distance_bucket ?? 'Unknown',
  areas: t.planning_areas ?? [],
  availableSlots: t.available_slot_count ?? 0,
  matchScore: t.match_score ?? t.score ?? 0,
  scoreComponents: t.score_components ?? null,
});

const TutorRecommendations = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [awaitingAccept, setAwaitingAccept] = useState(false);
  const [selectedTutorName, setSelectedTutorName] = useState('');

  const fetchRecommendations = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/matching/recommendations', {
        params: { request_id: requestId },
      });
      const list = Array.isArray(data) ? data : (data.recommendations ?? data.tutors ?? []);
      setTutors(list.map(mapTutorToUi));
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

  const handleSelectTutor = async () => {
    if (!selectedTutor) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post('/sessions', {
        request_id: requestId,
        tutor_id: selectedTutor,
      });
      const status = String(data.status ?? '').toLowerCase().replace(/\s/g, '_');
      if (status === 'pending_tutor_selection') {
        const tutorObj = tutors.find((t) => String(t.id) === String(selectedTutor));
        setSelectedTutorName(tutorObj?.name ?? 'your tutor');
        setAwaitingAccept(true);
      } else {
        navigate(`/session/${data.id ?? data.session_id}/coordinate`);
      }
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  if (awaitingAccept) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
        </header>
        <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>✓</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#166534', marginBottom: '20px' }}>Request Sent!</h1>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', marginBottom: '28px', textAlign: 'left' }}>
            <p style={{ color: '#166534', fontSize: '15px', lineHeight: 1.65, margin: 0 }}>
              Your request has been sent to <strong>{selectedTutorName}</strong>. You'll be notified when they accept and propose time slots.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard?tab=learning')}
            style={{ width: '100%', padding: '14px 24px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' }}
          >
            🏠 Go to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')}
        >
          <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px 6px 6px', borderRadius: '10px' }}>
          <div style={{ width: '34px', height: '34px', background: '#f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
            {getInitials(user?.full_name)}
          </div>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{user?.full_name || 'User'}</span>
        </div>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate('/dashboard?tab=learning')}
          style={{ background: 'none', border: 'none', color: '#1a5f4a', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '24px', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ← Back to Dashboard
        </button>

        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Updated Tutor Recommendations 🎓</h1>
        <p style={{ color: '#57534e', marginBottom: '28px', fontSize: '15px' }}>
          New tutors matching your request have been found. Select one to proceed.
        </p>

        {loading && (
          <div style={{ textAlign: 'center', color: '#78716c', padding: '48px' }}>Loading recommendations…</div>
        )}

        {!loading && error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px', color: '#b91c1c', fontSize: '14px' }}>{error}</div>
        )}

        {!loading && !error && tutors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#78716c' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <p style={{ fontSize: '16px' }}>No tutors found matching your request yet.</p>
            <button
              type="button"
              onClick={() => navigate('/dashboard?tab=learning')}
              style={{ marginTop: '20px', padding: '12px 24px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
            >
              Back to Dashboard
            </button>
          </div>
        )}

        {!loading && !error && tutors.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
              {tutors.map((tutor, index) => {
                const selected = selectedTutor === tutor.id;
                const h = hovered === `tutor-${tutor.id}`;
                return (
                  <div
                    key={tutor.id}
                    onClick={() => setSelectedTutor(tutor.id)}
                    onMouseEnter={() => setHovered(`tutor-${tutor.id}`)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      background: '#fff',
                      borderRadius: '16px',
                      border: selected ? '3px solid #1a5f4a' : '1px solid #e7e5e4',
                      padding: '24px',
                      cursor: 'pointer',
                      position: 'relative',
                      boxShadow: h ? '0 4px 16px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)',
                      transform: h ? 'translateY(-2px)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {index === 0 && (
                      <div style={{ position: 'absolute', top: '-12px', right: '20px', background: '#f59e0b', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                        ⭐ Best Match
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                      <div style={{ width: '60px', height: '60px', background: '#f59e0b', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px', flexShrink: 0 }}>
                        {tutor.initials}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '17px', color: '#1c1917' }}>{tutor.name}</div>
                            <div style={{ fontSize: '13px', color: '#78716c', marginTop: '2px' }}>
                              {tutor.areas.join(', ') || 'Area not specified'} · {tutor.distance}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: '700', fontSize: '20px', color: '#1a5f4a' }}>{tutor.matchScore.toFixed(0)}</div>
                            <div style={{ fontSize: '11px', color: '#a8a29e' }}>match score</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#57534e' }}>
                          <span>⭐ {tutor.rating.toFixed(1)} rating</span>
                          <span>🎓 {tutor.sessions} sessions</span>
                          <span>✅ {tutor.reliability.toFixed(0)}% reliability</span>
                          <span>📅 {tutor.availableSlots} slot{tutor.availableSlots !== 1 ? 's' : ''} overlap</span>
                        </div>
                      </div>
                    </div>
                    {selected && (
                      <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', gap: '8px', color: '#1a5f4a', fontSize: '14px', fontWeight: '600' }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => navigate('/dashboard?tab=learning')}
                style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer', fontSize: '15px' }}
              >
                Decide Later
              </button>
              <button
                type="button"
                onClick={handleSelectTutor}
                disabled={!selectedTutor || submitting}
                style={{
                  padding: '14px 32px',
                  background: (!selectedTutor || submitting) ? '#e7e5e4' : '#1a5f4a',
                  color: (!selectedTutor || submitting) ? '#a8a29e' : '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                  cursor: (!selectedTutor || submitting) ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  transition: 'all 0.2s ease',
                }}
              >
                {submitting ? 'Sending…' : 'Send Request to Tutor →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TutorRecommendations;
