import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const formatDate = (d) => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:00 ${ampm}`;
};

// Full journey steps: tutee request (1-3 complete) + coordination (4-7)
const ALL_STEPS = [
  { num: 1, label: 'Details' },
  { num: 2, label: 'Schedule' },
  { num: 3, label: 'Tutor' },
  { num: 4, label: 'Time Slot' },
  { num: 5, label: 'Venue' },
  { num: 6, label: 'Payment' },
  { num: 7, label: 'Confirmed' },
];

// coordStep 1-4 maps to overall step 4-7
const StepIndicator = ({ currentStep }) => {
  const overallStep = currentStep + 3;
  return (
    <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e7e5e4' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '18px', left: '24px', right: '24px', height: '4px', background: '#e7e5e4', zIndex: 1 }}>
            <div style={{ width: `${((overallStep - 1) / 6) * 100}%`, height: '100%', background: '#1a5f4a', transition: 'width 0.3s' }} />
          </div>
          {ALL_STEPS.map((step) => {
            const done = overallStep > step.num;
            const active = overallStep === step.num;
            const past = step.num <= 3; // tutee request steps always complete
            return (
              <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '48px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: done || past || active ? '#1a5f4a' : '#fff',
                  border: `3px solid ${done || past || active ? '#1a5f4a' : '#e7e5e4'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: done || past || active ? '#fff' : '#a8a29e',
                  fontWeight: '600', fontSize: '13px', marginBottom: '6px',
                }}>
                  {done || past ? '✓' : step.num}
                </div>
                <span style={{ fontSize: '10px', fontWeight: active ? '700' : '400', color: done || past || active ? '#1c1917' : '#a8a29e', textAlign: 'center', lineHeight: '1.2' }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SessionCoordination = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(null); // null = loading
  const [hovered, setHovered] = useState(null);

  // Step 1 — Slot state
  const [slotPick, setSlotPick] = useState(null);
  const [slotSubmitting, setSlotSubmitting] = useState(false);
  const [slotError, setSlotError] = useState(null);

  // Step 2 — Venue state
  const [venueRecs, setVenueRecs] = useState(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueError, setVenueError] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState(null); // full venue object
  const [manualVenue, setManualVenue] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [venueSubmitting, setVenueSubmitting] = useState(false);
  const [venueSubmitError, setVenueSubmitError] = useState(null);

  // Step 3 — Payment state
  const [sessionFee, setSessionFee] = useState(null);
  const [payMethod, setPayMethod] = useState(null); // 'paynow' | 'card' | 'bank'
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState(null);

  // ── Load session and determine starting step ─────────────────────────────
  const loadSession = useCallback(async () => {
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      setSession(data);
      // Determine step from session status
      const status = data.status;
      const hasVenue = !!(data.venue_id || data.venue_manual);
      if (status === 'confirmed') {
        setCurrentStep(4);
      } else if (status === 'pending_confirmation' && hasVenue) {
        setCurrentStep(3);
      } else if (status === 'pending_confirmation' && !hasVenue) {
        setCurrentStep(2);
      } else if (status === 'tutor_accepted') {
        // Slot still needs confirming
        setCurrentStep(1);
      } else {
        // cancelled or unknown — send back to dashboard
        navigate('/dashboard');
      }
    } catch {
      setError('Could not load session details.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // Auto-load venue recs when reaching step 2
  useEffect(() => {
    if (currentStep === 2 && session && venueRecs === null && !venueLoading) {
      fetchVenueRecs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, session]);

  // Auto-load fee when reaching step 3
  useEffect(() => {
    if (currentStep === 3 && session && sessionFee === null) {
      api.get('/payments/fee', { params: { session_id: sessionId } })
        .then(({ data }) => setSessionFee(data.fee ?? data.amount ?? null))
        .catch(() => setSessionFee(null));
    }
  }, [currentStep, session, sessionFee, sessionId]);

  // ── Step 1: Confirm slot ──────────────────────────────────────────────────
  const handleConfirmSlot = async () => {
    if (!slotPick || slotSubmitting) return;
    setSlotSubmitting(true);
    setSlotError(null);
    try {
      await api.post(`/sessions/${sessionId}/confirm-slot`, {
        date: slotPick.date,
        hour_slot: Number(slotPick.hour_slot),
      });
      await loadSession();
      setCurrentStep(2);
    } catch (err) {
      setSlotError(err.response?.data?.detail ?? 'Failed to confirm slot.');
    } finally {
      setSlotSubmitting(false);
    }
  };

  // ── Step 2: Fetch + confirm venue ─────────────────────────────────────────
  const fetchVenueRecs = async () => {
    if (!session) return;
    setVenueLoading(true);
    setVenueError(null);
    try {
      const params = new URLSearchParams();
      if (session.request_id) params.set('request_id', session.request_id);
      if (session.tutor_id) params.set('tutor_id', session.tutor_id);
      const { data } = await api.get(`/venues/recommend?${params.toString()}`);
      setVenueRecs(data?.venues ?? []);
    } catch (err) {
      setVenueError(err.response?.data?.detail ?? 'Could not load venue recommendations.');
    } finally {
      setVenueLoading(false);
    }
  };

  // UUID v4 pattern — only real DB venue IDs match this
  const isRealUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const handleConfirmVenue = async () => {
    if (venueSubmitting) return;
    if (!useManual && !selectedVenue) return;
    if (useManual && !manualVenue.trim()) return;
    setVenueSubmitting(true);
    setVenueSubmitError(null);
    try {
      let body;
      if (useManual) {
        body = { venue_manual: manualVenue.trim() };
      } else if (isRealUuid(selectedVenue.venue_id)) {
        body = { venue_id: selectedVenue.venue_id };
      } else {
        // OneMap live result — fake ID, send name+address as manual text instead
        body = { venue_manual: `${selectedVenue.name}, ${selectedVenue.address}` };
      }
      await api.post(`/sessions/${sessionId}/venue`, body);
      await loadSession();
      setCurrentStep(3);
    } catch (err) {
      setVenueSubmitError(err.response?.data?.detail ?? 'Failed to confirm venue.');
    } finally {
      setVenueSubmitting(false);
    }
  };

  // ── Step 3: Payment ───────────────────────────────────────────────────────
  const handlePay = async () => {
    if (paySubmitting) return;
    setPaySubmitting(true);
    setPayError(null);
    try {
      await api.post('/payments/initiate', { session_id: sessionId });
      await loadSession(); // reload so session.fee is populated on step 4
      setCurrentStep(4);
    } catch (err) {
      setPayError(err.response?.data?.detail ?? 'Payment failed. Please try again.');
    } finally {
      setPaySubmitting(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const subjects = Array.isArray(session?.subjects) ? session.subjects.join(', ') : (session?.subject || '—');
  const topics = Array.isArray(session?.topics) ? session.topics.join(', ') : (session?.topic || '');
  const tutorName = session?.tutor_name || session?.tutor_full_name || 'Tutor';
  const proposedSlots = session?.proposed_slots ?? [];
  const venueName = session?.venue_name || session?.venue_manual || '—';
  const venueAddress = session?.venue_address || '';

  // ── Renders ───────────────────────────────────────────────────────────────
  const renderStep1 = () => {
    if (proposedSlots.length === 0) {
      return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Waiting for Tutor</h1>
          <p style={{ color: '#57534e', marginBottom: '32px' }}>Your tutor hasn't proposed any time slots yet. You'll be notified once they do.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            style={{ padding: '12px 28px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '15px' }}
          >
            ← Back to Dashboard
          </button>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Choose a Time Slot</h1>
        <p style={{ color: '#57534e', marginBottom: '32px' }}>Your tutor has proposed these times. Pick one to continue.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {proposedSlots.map((slot, idx) => {
            const key = `${slot.date}-${slot.hour_slot}-${idx}`;
            const isSelected = slotPick && slotPick.date === slot.date && Number(slotPick.hour_slot) === Number(slot.hour_slot);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSlotPick(slot)}
                onMouseEnter={() => !isSelected && setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '18px 20px',
                  background: isSelected ? '#f0fdf4' : (hovered === key ? '#fafaf9' : '#fff'),
                  border: `2px solid ${isSelected ? '#16a34a' : (hovered === key ? '#d1d5db' : '#e7e5e4')}`,
                  borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s ease', boxShadow: isSelected ? '0 0 0 4px rgba(22,163,74,0.1)' : 'none',
                }}
              >
                <div style={{ width: '44px', height: '44px', background: isSelected ? '#dcfce7' : '#f5f5f4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  📅
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1c1917' }}>{formatDate(slot.date)}</div>
                  <div style={{ fontSize: '13px', color: '#57534e', marginTop: '2px' }}>{formatHour(slot.hour_slot)} – {formatHour(slot.hour_slot + 1)}</div>
                </div>
                {isSelected && (
                  <span style={{ marginLeft: 'auto', background: '#16a34a', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>

        {slotError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{slotError}</div>
        )}

        <button
          type="button"
          onClick={handleConfirmSlot}
          disabled={!slotPick || slotSubmitting}
          onMouseEnter={() => slotPick && !slotSubmitting && setHovered('slot-next')}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: '100%', padding: '16px',
            background: slotPick && !slotSubmitting ? (hovered === 'slot-next' ? '#145040' : '#1a5f4a') : '#e7e5e4',
            color: slotPick && !slotSubmitting ? '#fff' : '#a8a29e',
            border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '16px',
            cursor: slotPick && !slotSubmitting ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease',
          }}
        >
          {slotSubmitting ? 'Confirming…' : 'Confirm Slot → '}
        </button>
      </div>
    );
  };

  const renderStep2 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Select a Venue 📍</h1>
      <p style={{ color: '#57534e', marginBottom: '32px' }}>
        Choose a public study venue convenient for both you and your tutor. Venues are ranked by how close they are to both parties.
      </p>

      {venueLoading && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#57534e' }}>Loading recommendations…</div>
      )}
      {venueError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{venueError}</div>
      )}

      {!venueLoading && !useManual && venueRecs !== null && (
        <>
          {venueRecs.length === 0 ? (
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'center', color: '#92400e', fontSize: '14px' }}>
              No venues found near your selected planning areas. Use the manual option below.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {venueRecs.map((v) => {
                const isSelected = selectedVenue?.venue_id === v.venue_id;
                const bucketColor = v.distance_bucket === 'Near' ? '#166534' : v.distance_bucket === 'Medium' ? '#854d0e' : '#991b1b';
                const bucketBg = v.distance_bucket === 'Near' ? '#dcfce7' : v.distance_bucket === 'Medium' ? '#fef9c3' : '#fee2e2';
                return (
                  <button
                    key={v.venue_id}
                    type="button"
                    onClick={() => setSelectedVenue(v)}
                    onMouseEnter={() => !isSelected && setHovered(`venue-${v.venue_id}`)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: isSelected ? '#f0fdf4' : (hovered === `venue-${v.venue_id}` ? '#fafaf9' : '#fff'),
                      border: `2px solid ${isSelected ? '#16a34a' : (hovered === `venue-${v.venue_id}` ? '#d1d5db' : '#e7e5e4')}`,
                      borderRadius: '12px', padding: '16px 20px', cursor: 'pointer',
                      transition: 'all 0.15s ease', boxShadow: isSelected ? '0 0 0 4px rgba(22,163,74,0.1)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, marginRight: '12px' }}>
                        <div style={{ fontWeight: '600', fontSize: '15px', color: '#1c1917', marginBottom: '4px' }}>{v.name}</div>
                        <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '4px' }}>{v.address}</div>
                        <div style={{ fontSize: '12px', color: '#a8a29e' }}>
                          {v.venue_type.replace('_', ' ')} · {v.planning_area}
                          {v.accessibility_features?.length > 0 && ` · ♿ ${v.accessibility_features.slice(0, 2).join(', ')}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                        <span style={{ background: bucketBg, color: bucketColor, fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '6px' }}>
                          {v.distance_bucket}
                        </span>
                        {isSelected && (
                          <span style={{ background: '#16a34a', color: '#fff', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✓</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Manual venue input */}
      {useManual && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', fontSize: '13px', color: '#92400e' }}>
            ⚠️ Must be a public place (library, community centre, study area) — not a home address.
          </div>
          <input
            type="text"
            placeholder="e.g. Bishan Public Library, 5 Bishan Place"
            value={manualVenue}
            onChange={(e) => setManualVenue(e.target.value)}
            maxLength={200}
            style={{ width: '100%', padding: '14px 16px', border: '1px solid #e7e5e4', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px', textAlign: 'right' }}>{manualVenue.length}/200</div>
        </div>
      )}

      {/* Toggle between recommendations and manual */}
      {!venueLoading && (
        <button
          type="button"
          onClick={() => { setUseManual((p) => !p); setSelectedVenue(null); }}
          style={{ fontSize: '14px', color: '#1a5f4a', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', marginBottom: '24px', display: 'block' }}
        >
          {useManual ? '← Back to recommendations' : 'Enter a venue manually instead'}
        </button>
      )}

      {venueSubmitError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px', color: '#b91c1c' }}>{venueSubmitError}</div>
      )}

      <button
        type="button"
        onClick={handleConfirmVenue}
        disabled={venueSubmitting || (!useManual && !selectedVenue) || (useManual && !manualVenue.trim())}
        onMouseEnter={() => setHovered('venue-next')}
        onMouseLeave={() => setHovered(null)}
        style={{
          width: '100%', padding: '16px',
          background: ((!useManual && selectedVenue) || (useManual && manualVenue.trim())) && !venueSubmitting
            ? (hovered === 'venue-next' ? '#145040' : '#1a5f4a') : '#e7e5e4',
          color: ((!useManual && selectedVenue) || (useManual && manualVenue.trim())) && !venueSubmitting ? '#fff' : '#a8a29e',
          border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '16px',
          cursor: ((!useManual && selectedVenue) || (useManual && manualVenue.trim())) && !venueSubmitting ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
        }}
      >
        {venueSubmitting ? 'Confirming…' : 'Proceed to Payment →'}
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Payment 💳</h1>
      <p style={{ color: '#57534e', marginBottom: '32px' }}>Complete payment to confirm your session.</p>

      {/* Session summary */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '12px' }}>Session Summary</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>Subject</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>{subjects}{topics ? ` · ${topics}` : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>Duration</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>{session?.duration_hours || 1} hour{session?.duration_hours !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>Level</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>{session?.academic_level || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>Venue</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>{venueName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>When</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>
              {session?.scheduled_at ? (() => {
                const dt = new Date(session.scheduled_at);
                const endHour = dt.getHours() + (session.duration_hours || 1);
                const endDt = new Date(dt);
                endDt.setHours(endHour);
                return `${formatDate(dt)}, ${formatHour(dt.getHours())} – ${formatHour(endHour)}`;
              })() : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Fee breakdown */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1c1917' }}>Session Fee</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#57534e' }}>Tutor rate × duration</span>
            <span style={{ color: '#1c1917', fontWeight: '500' }}>
              {sessionFee != null ? `$${Number(sessionFee).toFixed(2)}` : '…'}
            </span>
          </div>
        </div>
        <div style={{ borderTop: '2px solid #e7e5e4', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '20px' }}>
          <span style={{ fontWeight: '600', color: '#1c1917' }}>Total</span>
          <span style={{ fontWeight: '700', color: '#1a5f4a' }}>
            {sessionFee != null ? `$${Number(sessionFee).toFixed(2)}` : '…'}
          </span>
        </div>
      </div>

      <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '14px 16px', marginBottom: '24px', fontSize: '13px', color: '#57534e' }}>
        <strong>Pricing by Level:</strong> Primary $15/hr · Secondary $18/hr · JC/Poly/ITE $22/hr · University $25/hr
      </div>

      {/* Payment method selection */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#1c1917' }}>Payment Method</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { key: 'paynow', icon: '📱', label: 'PayNow QR', desc: 'Scan QR code with your banking app' },
            { key: 'card', icon: '💳', label: 'Credit / Debit Card', desc: 'Visa, Mastercard, Amex accepted' },
            { key: 'bank', icon: '🏦', label: 'Bank Transfer', desc: 'Direct transfer via internet banking' },
          ].map(({ key, icon, label, desc }) => {
            const sel = payMethod === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPayMethod(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  background: sel ? '#f0fdf4' : '#fff',
                  border: `2px solid ${sel ? '#1a5f4a' : '#e7e5e4'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '22px' }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1c1917' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>{desc}</div>
                </div>
                {sel && <span style={{ marginLeft: 'auto', color: '#1a5f4a', fontWeight: '700' }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {payError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{payError}</div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="button"
          onClick={() => setCurrentStep(2)}
          onMouseEnter={() => setHovered('pay-back')}
          onMouseLeave={() => setHovered(null)}
          style={{ padding: '14px 24px', background: hovered === 'pay-back' ? '#f0faf5' : '#fff', color: '#57534e', border: `1px solid ${hovered === 'pay-back' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', flexShrink: 0 }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handlePay}
          disabled={paySubmitting || sessionFee === null || !payMethod}
          onMouseEnter={() => !paySubmitting && setHovered('pay-confirm')}
          onMouseLeave={() => setHovered(null)}
          style={{
            flex: 1, padding: '14px',
            background: paySubmitting || sessionFee === null || !payMethod ? '#e7e5e4' : (hovered === 'pay-confirm' ? '#145040' : '#1a5f4a'),
            color: paySubmitting || sessionFee === null || !payMethod ? '#a8a29e' : '#fff',
            border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '16px',
            cursor: paySubmitting || sessionFee === null || !payMethod ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease',
          }}
        >
          {paySubmitting ? 'Processing…' : `Pay ${sessionFee != null ? `$${Number(sessionFee).toFixed(2)}` : ''} →`}
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ width: '80px', height: '80px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '40px' }}>✓</div>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Session Confirmed!</h1>
        <p style={{ color: '#57534e' }}>Your tutoring session is booked and paid for.</p>
      </div>

      <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: '32px' }}>
        <div style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #2d8a6e 100%)', padding: '24px', color: '#fff' }}>
          <div style={{ fontSize: '13px', opacity: 0.85, marginBottom: '4px' }}>{session?.academic_level} · {subjects}</div>
          {topics && <div style={{ fontSize: '16px', fontWeight: '600' }}>{topics}</div>}
        </div>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: 'Tutor', value: tutorName },
              { label: 'Date', value: session?.scheduled_at ? formatDate(session.scheduled_at) : '—' },
              { label: 'Duration', value: `${session?.duration_hours || 1}h` },
              { label: 'Venue', value: venueName },
              venueAddress && { label: 'Address', value: venueAddress },
              session?.fee != null && { label: 'Amount Paid', value: `$${Number(session.fee).toFixed(2)}` },
            ].filter(Boolean).map(({ label, value }, i, arr) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#a8a29e' }}>{label}</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#1c1917' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          onMouseEnter={() => setHovered('conf-dash')}
          onMouseLeave={() => setHovered(null)}
          style={{ width: '100%', padding: '16px', background: hovered === 'conf-dash' ? '#2d7a61' : '#1a5f4a', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s ease' }}
        >
          Go to Dashboard →
        </button>
        <button
          type="button"
          onClick={() => navigate(`/session/${sessionId}`)}
          onMouseEnter={() => setHovered('conf-chat')}
          onMouseLeave={() => setHovered(null)}
          style={{ width: '100%', padding: '14px', background: hovered === 'conf-chat' ? '#f0faf5' : '#fff', color: '#57534e', border: `1px solid ${hovered === 'conf-chat' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '12px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}
        >
          💬 Message Tutor
        </button>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  if (loading || currentStep === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#78716c', fontSize: '16px' }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', gap: '16px' }}>
        <div style={{ color: '#ef4444', fontSize: '16px' }}>{error}</div>
        <button type="button" onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>← Dashboard</button>
      </div>
    );
  }

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
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          onMouseEnter={() => setHovered('header-back')}
          onMouseLeave={() => setHovered(null)}
          style={{ background: hovered === 'header-back' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}
        >
          ← Dashboard
        </button>
      </header>

      <StepIndicator currentStep={currentStep} />

      {/* Step content */}
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}
    </div>
  );
};

export default SessionCoordination;
