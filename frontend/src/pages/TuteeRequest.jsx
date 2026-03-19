import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ============================================================
// SECTION 3: REQUEST HELP FLOW (UPDATED)
// Changes per SRS:
// - Added Academic Level (2.2.3.3)
// - Subject with "Other" option (2.2.3.4)
// - Multiple topics (2.2.3.5)
// - Planning area with "Other" (2.2.3.7)
// - Accessibility notes (2.2.3.8)
// - Payment step (2.8)
// - Session states displayed (2.7)
// ============================================================

const ACADEMIC_LEVEL_MAP = { primary: 'Primary', secondary: 'Secondary', jc: 'Junior College', poly: 'Polytechnic', ite: 'ITE', uni: 'University' };
const URGENCY_MAP = { exam: 'exam_soon', assignment: 'assignment_due', general: 'general_study' };
const DURATION_HOURS_MAP = { '1 hour': 1, '2 hours': 2, '4 hours': 4 };

const getInitials = (name) => (name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

// Stable components at module level to prevent remount-on-typing (which caused scroll-to-top)
const TuteeFlowHeader = ({ onCancel }) => (
  <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
    </div>
    <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>✕ Cancel Request</button>
  </header>
);

const TuteeStepIndicator = ({ currentStep }) => (
  <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e7e5e4' }}>
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '18px', left: '40px', right: '40px', height: '4px', background: '#e7e5e4', zIndex: 1 }}>
          <div style={{ width: `${((currentStep - 1) / 5) * 100}%`, height: '100%', background: '#1a5f4a', transition: 'width 0.3s' }}></div>
        </div>
        {[
          { num: 1, label: 'Details' },
          { num: 2, label: 'Schedule' },
          { num: 3, label: 'Tutor' },
          { num: 4, label: 'Venue' },
          { num: 5, label: 'Payment' },
          { num: 6, label: 'Confirm' },
        ].map(step => (
          <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '70px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: currentStep >= step.num ? '#1a5f4a' : '#fff', border: `3px solid ${currentStep >= step.num ? '#1a5f4a' : '#e7e5e4'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentStep >= step.num ? '#fff' : '#a8a29e', fontWeight: '600', fontSize: '14px', marginBottom: '8px' }}>
              {currentStep > step.num ? '✓' : step.num}
            </div>
            <span style={{ fontSize: '11px', fontWeight: currentStep === step.num ? '600' : '400', color: currentStep >= step.num ? '#1c1917' : '#a8a29e', textAlign: 'center' }}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const RequestHelpFlow = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [selectedSubjects, setSelectedSubjects] = useState(['Mathematics']);
  const [showOtherSubject, setShowOtherSubject] = useState(false);
  const [showOtherArea, setShowOtherArea] = useState(false);
  const [topicsBySubject, setTopicsBySubject] = useState({ Mathematics: ['Integration'] });

  const [academicLevel, setAcademicLevel] = useState('uni');
  const [urgency, setUrgency] = useState('exam');
  const [selectedDates, setSelectedDates] = useState([{ day: 'Tue', date: '14' }, { day: 'Thu', date: '16' }]);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState([6, 7]);
  const [durationHours, setDurationHours] = useState(1);
  const [planningAreas, setPlanningAreas] = useState(['Clementi']);
  const [otherArea, setOtherArea] = useState('');
  const [otherSubject, setOtherSubject] = useState('');
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [accessibilityNotes, setAccessibilityNotes] = useState('');

  const [requestId, setRequestId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [recommendedTutors, setRecommendedTutors] = useState([]);
  const [recommendedVenues, setRecommendedVenues] = useState([]);
  const [sessionFee, setSessionFee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Predefined subjects and topics (matching Tutor flow)
  const allSubjects = [
    { name: 'Mathematics', topics: ['Calculus', 'Integration', 'Differentiation', 'Linear Algebra', 'Statistics', 'Probability', 'Trigonometry'] },
    { name: 'Physics', topics: ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Quantum Physics', 'Waves'] },
    { name: 'Chemistry', topics: ['Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry', 'Biochemistry'] },
    { name: 'Biology', topics: ['Cell Biology', 'Genetics', 'Ecology', 'Human Anatomy', 'Microbiology'] },
    { name: 'Computer Science', topics: ['Data Structures', 'Algorithms', 'Programming', 'Databases', 'Web Development', 'Machine Learning'] },
    { name: 'Economics', topics: ['Microeconomics', 'Macroeconomics', 'Econometrics', 'Finance'] },
    { name: 'English', topics: ['Essay Writing', 'Literature', 'Grammar', 'Creative Writing'] },
  ];

  const mapTutorToUi = (t) => ({
    id: t.tutor_id ?? t.id,
    name: t.full_name ?? t.name ?? 'Tutor',
    initials: getInitials(t.full_name ?? t.name),
    rating: t.avg_rating ?? t.rating ?? 0,
    sessions: t.total_sessions ?? t.sessions ?? 0,
    topics: t.topics ?? t.tutor_topics ?? [],
    availability: t.availability ?? 'Medium',
    distance: t.distance_bucket ?? t.distance ?? 'Medium',
    workload: t.workload ?? 'Medium',
    matchScore: t.score ?? t.match_score ?? 0,
    reliabilityScore: t.reliability_score ?? t.score ?? 0,
    explanation: t.explanation ?? t.reason ?? '',
  });

  const mapVenueToUi = (v) => ({
    id: v.id,
    name: v.name ?? '—',
    type: v.venue_type ?? 'Library',
    address: v.address ?? v.planning_area ?? '—',
    distanceStudent: v.distance_student ?? v.distance_bucket ?? '—',
    distanceTutor: v.distance_tutor ?? v.distance_bucket ?? '—',
    accessibility: v.accessibility_features ?? v.accessibility ?? [],
    amenities: v.amenities ?? [],
    hours: v.hours ?? '—',
    matchScore: v.score ?? v.match_score ?? 0,
    explanation: v.explanation ?? '',
  });

  const getNextDateForWeekday = (dayName) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const targetDow = days.indexOf(dayName);
    const today = new Date();
    const currentDow = today.getDay();
    let diff = targetDow - currentDow;
    if (diff <= 0) diff += 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diff);
    return next.toISOString().slice(0, 10);
  };

  const getAllTopics = () => Object.values(topicsBySubject).flat();
  const hasAnyTopics = () => getAllTopics().length > 0;

  const toggleTopic = (subjectKey, topic) => {
    setTopicsBySubject((prev) => {
      const current = prev[subjectKey] || [];
      const has = current.includes(topic);
      const next = { ...prev };
      if (has) {
        const filtered = current.filter((t) => t !== topic);
        if (filtered.length === 0) delete next[subjectKey];
        else next[subjectKey] = filtered;
      } else {
        next[subjectKey] = [...current, topic];
      }
      return next;
    });
  };

  const addCustomTopic = (topic) => {
    const targetKey = showOtherSubject ? (otherSubject || 'Other') : (selectedSubjects[0] || 'Other');
    setTopicsBySubject((prev) => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), topic],
    }));
  };

  const handleSubjectToggle = (subjectName) => {
    if (selectedSubjects.includes(subjectName)) {
      setSelectedSubjects(selectedSubjects.filter((s) => s !== subjectName));
      setTopicsBySubject((prev) => {
        const next = { ...prev };
        delete next[subjectName];
        return next;
      });
    } else {
      setSelectedSubjects([...selectedSubjects, subjectName]);
    }
  };

  const handleOtherSubjectToggle = () => {
    setShowOtherSubject(!showOtherSubject);
    if (showOtherSubject) {
      setTopicsBySubject((prev) => {
        const next = { ...prev };
        delete next['Other'];
        if (otherSubject) delete next[otherSubject];
        return next;
      });
    }
  };

  const buildRequestPayload = () => {
    const subjects = [...selectedSubjects, ...(showOtherSubject && otherSubject ? [otherSubject] : [])].filter(Boolean);
    const areas = showOtherArea ? (otherArea ? [otherArea] : planningAreas) : planningAreas;
    const timeSlots = selectedDates.flatMap((d) => {
      const isoDate = getNextDateForWeekday(d.day);
      return selectedTimeSlots.map((h) => ({ date: isoDate, hour_slot: h + 9 }));
    });
    const payload = {
      academic_level: ACADEMIC_LEVEL_MAP[academicLevel] || 'University',
      subjects,
      topics: getAllTopics(),
      planning_areas: areas,
      time_slots: timeSlots,
      duration_hours: Number(durationHours),
      urgency_category: URGENCY_MAP[urgency] || 'general_study',
      accessibility_needs: [],
      accessibility_notes: accessibilityNotes?.trim() || '',
    };
    return payload;
  };

  const handleFindTutors = async () => {
    setError(null);
    setLoading(true);
    setRecommendedTutors([]);
    try {
      const payload = buildRequestPayload();
      console.log('[TuteeRequest] POST /requests payload:', JSON.stringify(payload, null, 2));
      const { data: reqData } = await api.post('/requests', payload);
      const rid = reqData.id ?? reqData.request_id;
      setRequestId(rid);

      const { data: matchData } = await api.get('/matching/recommendations', { params: { request_id: rid } });
      const list = Array.isArray(matchData) ? matchData : (matchData.recommendations ?? matchData.tutors ?? []);
      setRecommendedTutors(list.map(mapTutorToUi));
      setCurrentStep(3);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTutorAndProceed = async () => {
    if (!selectedTutor || !requestId) return;
    setError(null);
    setLoading(true);
    setRecommendedVenues([]);
    try {
      const tutorId = typeof selectedTutor === 'object' ? selectedTutor.id : selectedTutor;
      const { data } = await api.post('/sessions', { request_id: requestId, tutor_id: tutorId });
      const sid = data.id ?? data.session_id;
      setSessionId(sid);
      setCurrentStep(4);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToPayment = () => {
    setError(null);
    setCurrentStep(5);
  };

  const handlePay = async () => {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await api.post('/payments/initiate', { session_id: sessionId });
      setCurrentStep(6);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep === 4 && sessionId && selectedTutor) {
      const tutorId = typeof selectedTutor === 'object' ? selectedTutor.id : selectedTutor;
      api.get('/venues/recommend', { params: { request_id: requestId, tutor_id: tutorId } })
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : (data.venues ?? data.recommendations ?? []);
          setRecommendedVenues(list.map(mapVenueToUi));
        })
        .catch(() => setRecommendedVenues([]));
    }
  }, [currentStep, sessionId, selectedTutor, requestId]);

  useEffect(() => {
    if (currentStep === 5 && sessionId) {
      api.get('/payments/fee', { params: { session_id: sessionId } })
        .then(({ data }) => setSessionFee(data.fee ?? data.amount ?? null))
        .catch(() => setSessionFee(null));
    }
  }, [currentStep, sessionId]);

  // STEP 1: Subject, Academic Level & Topics (UPDATED - matching Tutor UI)
  const renderStep1 = () => (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>What do you need help with? 🎓</h1>
      <p style={{ color: '#57534e', marginBottom: '36px' }}>Tell us about the subject and topics you're struggling with.</p>

      {/* Academic Level (SRS 2.2.3.3) — pill/chip buttons matching OfferToTutor */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Academic Level <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {[
            { value: 'primary', label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
            { value: 'jc', label: 'Junior College' },
            { value: 'poly', label: 'Polytechnic' },
            { value: 'ite', label: 'ITE' },
            { value: 'uni', label: 'University' },
          ].map(({ value, label }) => {
            const isSelected = academicLevel === value;
            return (
              <button key={value} onClick={() => setAcademicLevel(value)} style={{ padding: '12px 20px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `2px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
                {isSelected && '✓ '}{label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Selection - multi-select matching OfferToTutor */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Select Subjects <span style={{ color: '#ef4444' }}>*</span>
          <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(select one or more)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {allSubjects.map(subject => (
            <button key={subject.name} onClick={() => handleSubjectToggle(subject.name)} style={{ padding: '12px 20px', background: selectedSubjects.includes(subject.name) ? '#1a5f4a' : '#fff', color: selectedSubjects.includes(subject.name) ? '#fff' : '#57534e', border: `2px solid ${selectedSubjects.includes(subject.name) ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
              {selectedSubjects.includes(subject.name) && '✓ '}{subject.name}
            </button>
          ))}
          <button onClick={handleOtherSubjectToggle} style={{ padding: '12px 20px', background: showOtherSubject ? '#1a5f4a' : '#fff', color: showOtherSubject ? '#fff' : '#57534e', border: `2px solid ${showOtherSubject ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
            {showOtherSubject && '✓ '}Other
          </button>
        </div>

        {/* Other Subject Input */}
        {showOtherSubject && (
          <div style={{ marginTop: '12px' }}>
            <input type="text" placeholder="Enter subject name (1-100 characters)" maxLength={100} value={otherSubject} onChange={(e) => setOtherSubject(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
            <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>1-100 characters</p>
          </div>
        )}
      </div>

      {/* Topic Selection - one section per selected subject (matching OfferToTutor) */}
      {(selectedSubjects.length > 0 || showOtherSubject) && (
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
            Select Topics <span style={{ color: '#ef4444' }}>*</span>
            <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(select one or more)</span>
          </label>

          {selectedSubjects.map(subjectName => {
            const subject = allSubjects.find(s => s.name === subjectName);
            if (!subject) return null;
            const subjectTopics = topicsBySubject[subjectName] || [];
            return (
              <div key={subjectName} style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '12px' }}>📚 {subjectName} Topics</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {subject.topics.map(topic => {
                    const isSelected = subjectTopics.includes(topic);
                    return (
                      <button key={topic} onClick={() => toggleTopic(subjectName, topic)} style={{ padding: '10px 16px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `1px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
                        {isSelected && '✓ '}{topic}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {showOtherSubject && (
            <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '12px' }}>📚 {otherSubject || 'Other'} Topics</div>
              <p style={{ fontSize: '13px', color: '#57534e', marginBottom: '8px' }}>Add custom topics below.</p>
            </div>
          )}

          {/* Custom Topic Input */}
          <div>
            <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '8px' }}>Add custom topic:</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Type a topic (1-100 characters)" maxLength={100} value={customTopicInput} onChange={(e) => setCustomTopicInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = customTopicInput.trim(); if (t) { addCustomTopic(t); setCustomTopicInput(''); } } }} style={{ flex: 1, padding: '12px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '14px', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => { const t = customTopicInput.trim(); if (t) { addCustomTopic(t); setCustomTopicInput(''); } }} style={{ padding: '12px 20px', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: '10px', cursor: 'pointer', fontWeight: '500', color: '#1a5f4a', fontSize: '14px' }}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          What specifically are you struggling with? <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional)</span>
        </label>
        <textarea rows={3} placeholder="Describe what you need help with..." style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>

      {/* Urgency (SRS 2.2.3.9) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          How urgent is this? <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { id: 'exam', icon: '🔥', label: 'Exam Soon', desc: 'Upcoming examination' },
            { id: 'assignment', icon: '📝', label: 'Assignment Due', desc: 'Near-term deadline' },
            { id: 'general', icon: '📚', label: 'General Study', desc: 'Ongoing learning' },
          ].map(opt => (
            <label key={opt.id} onClick={() => setUrgency(opt.id)} style={{ background: urgency === opt.id ? '#fef2f2' : '#fff', border: `2px solid ${urgency === opt.id ? '#fecaca' : '#e7e5e4'}`, borderRadius: '12px', padding: '20px 16px', cursor: 'pointer', textAlign: 'center' }}>
              <input type="radio" name="urgency" checked={urgency === opt.id} readOnly style={{ display: 'none' }} />
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{opt.icon}</div>
              <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '4px', fontSize: '14px' }}>{opt.label}</div>
              <div style={{ fontSize: '12px', color: '#a8a29e' }}>{opt.desc}</div>
            </label>
          ))}
        </div>
      </div>

      {/* Confirmation Summary — grouped by subject (matching OfferToTutor style) */}
      {hasAnyTopics() && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>For confirmation, you need help with:</div>
          {Object.entries(topicsBySubject).map(([subject, topics]) => (
            topics.length > 0 && (
              <div key={subject} style={{ fontSize: '14px', color: '#166534', marginBottom: '4px' }}>
                <strong>{subject}</strong>: {topics.join(', ')}
              </div>
            )
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setCurrentStep(2)} disabled={!hasAnyTopics()} style={{ padding: '14px 32px', background: hasAnyTopics() ? '#1a5f4a' : '#e7e5e4', color: hasAnyTopics() ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: hasAnyTopics() ? 'pointer' : 'not-allowed', fontSize: '15px' }}>Continue →</button>
      </div>
    </div>
  );

  // STEP 2: Schedule & Location
  const renderStep2 = () => (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>When and where works for you? 📅</h1>
      <p style={{ color: '#57534e', marginBottom: '36px' }}>Select your preferred time slots and location.</p>

      {/* Date Selection */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Preferred Dates <span style={{ color: '#ef4444' }}>*</span> <span style={{ fontWeight: '400', color: '#a8a29e' }}>(select multiple)</span>
        </label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[{ day: 'Mon', date: '13', selected: false }, { day: 'Tue', date: '14', selected: true }, { day: 'Wed', date: '15', selected: false }, { day: 'Thu', date: '16', selected: true }, { day: 'Fri', date: '17', selected: false }, { day: 'Sat', date: '18', selected: false }, { day: 'Sun', date: '19', selected: false }].map((d, i) => (
            <button key={i} style={{ padding: '12px 16px', background: d.selected ? '#1a5f4a' : '#fff', color: d.selected ? '#fff' : '#57534e', border: `2px solid ${d.selected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', minWidth: '70px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>{d.day}</div>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>{d.date}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Time Slots (1-hour intervals per SRS 2.2.3.6.2) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Preferred Time Slots <span style={{ color: '#ef4444' }}>*</span> <span style={{ fontWeight: '400', color: '#a8a29e' }}>(1-hour intervals)</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'].map((time, i) => (
            <button key={i} style={{ padding: '12px', background: [6, 7].includes(i) ? '#1a5f4a' : '#fff', color: [6, 7].includes(i) ? '#fff' : '#57534e', border: `1px solid ${[6, 7].includes(i) ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>{time}</button>
          ))}
        </div>
      </div>

      {/* Duration (SRS 2.2.3.6: exactly 1h, 2h, 4h) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Session Duration</label>
        <div style={{ display: 'flex', gap: '12px' }}>
          {['1 hour', '2 hours', '4 hours'].map((dur) => {
            const hrs = DURATION_HOURS_MAP[dur] ?? 1;
            const isSelected = durationHours === hrs;
            return (
              <button key={dur} onClick={() => setDurationHours(hrs)} style={{ padding: '12px 24px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `2px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500' }}>{dur}</button>
            );
          })}
        </div>
      </div>

      {/* Planning Area with buttons + "Other" (matching Tutor UI) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Preferred Area <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {['Ang Mo Kio', 'Bedok', 'Bishan', 'Boon Lay', 'Bukit Batok', 'Bukit Merah', 'Bukit Panjang', 'Bukit Timah', 'Central Area', 'Choa Chu Kang', 'Clementi', 'Geylang', 'Hougang', 'Jurong East', 'Jurong West', 'Kallang', 'Marine Parade', 'Novena', 'Pasir Ris', 'Punggol', 'Queenstown', 'Sembawang', 'Sengkang', 'Serangoon', 'Tampines', 'Toa Payoh', 'Woodlands', 'Yishun'].map((area) => {
            const isSelected = !showOtherArea && planningAreas.includes(area);
            return (
              <button key={area} onClick={() => { setShowOtherArea(false); setPlanningAreas([area]); }} style={{ padding: '10px 16px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `1px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{isSelected && '✓ '}{area}</button>
            );
          })}
          <button onClick={() => { setShowOtherArea(true); setPlanningAreas([]); }} style={{ padding: '10px 16px', background: showOtherArea ? '#1a5f4a' : '#fff', color: showOtherArea ? '#fff' : '#57534e', border: `1px solid ${showOtherArea ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{showOtherArea && '✓ '}Other</button>
        </div>
        {showOtherArea && (
          <input type="text" placeholder="Enter planning area (1-100 characters)" maxLength={100} value={otherArea} onChange={(e) => setOtherArea(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
        )}
      </div>

      {/* Accessibility Needs with checkboxes + optional textbox (matching Tutor UI) */}
      <div style={{ marginBottom: '40px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Accessibility Needs <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional)</span>
        </label>
        <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '12px' }}>Select any accessibility requirements for the venue.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {['Wheelchair accessible venue required', 'Ground floor / lift access required', 'Hearing assistance / quiet environment needed', 'Visual aids / good lighting required'].map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
              <span style={{ fontSize: '14px', color: '#57534e' }}>{opt}</span>
            </label>
          ))}
        </div>
        <textarea rows={2} maxLength={256} placeholder="Additional accessibility notes (optional, max 256 characters)" value={accessibilityNotes} onChange={(e) => setAccessibilityNotes(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>{accessibilityNotes.length} / 256</div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setCurrentStep(1)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
        <button onClick={handleFindTutors} disabled={loading} style={{ padding: '14px 32px', background: loading ? '#e7e5e4' : '#1a5f4a', color: loading ? '#a8a29e' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Finding...' : 'Find Tutors →'}</button>
      </div> 

      {/* Planning Area with "Other" (SRS 2.2.3.7)
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Preferred Area <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <select onChange={(e) => setShowOtherArea(e.target.value === 'other')} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', background: '#fff' }}>
          <option value="">Select planning area</option>
          <option>Ang Mo Kio</option>
          <option>Bedok</option>
          <option>Bishan</option>
          <option>Bukit Batok</option>
          <option>Clementi</option>
          <option>Jurong East</option>
          <option>Jurong West</option>
          <option>Tampines</option>
          <option>Woodlands</option>
          <option>Yishun</option>
          <option value="other">Other (specify below)</option>
        </select>
        {showOtherArea && (
          <input type="text" placeholder="Enter planning area (1-100 characters)" maxLength={100} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', marginTop: '10px' }} />
        )}
      </div>

      {/* Accessibility Notes (SRS 2.2.3.8) */}
      {/* <div style={{ marginBottom: '40px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Accessibility Notes <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional, max 256 characters)</span>
        </label>
        <textarea rows={2} maxLength={256} placeholder="e.g., Wheelchair accessible venue required, hearing loop needed..." style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>0 / 256</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setCurrentStep(1)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
        <button onClick={() => setCurrentStep(3)} style={{ padding: '14px 32px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>Find Tutors →</button>
      </div>  */}
    </div>
  );

  // STEP 3: Choose Tutor
  const renderStep3 = () => (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Choose your tutor 🎓</h1>
      <p style={{ color: '#57534e', marginBottom: '24px' }}>We found {recommendedTutors.length} tutors matching your request.</p>

      {/* Request Summary */}
      <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '24px', fontSize: '14px', flexWrap: 'wrap' }}>
        <span><strong>Level:</strong> University</span>
        <span><strong>Subject:</strong> Mathematics</span>
        <span><strong>Topics:</strong> {getAllTopics().join(', ')}</span>
        <span><strong>Time:</strong> Tue/Thu, 3-4 PM</span>
      </div>

      {/* Sort Options */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['Best Match', 'Highest Rated', 'Nearest', 'Most Reliable'].map((opt, i) => (
          <button key={opt} style={{ padding: '8px 16px', background: i === 0 ? '#1a5f4a' : '#fff', color: i === 0 ? '#fff' : '#57534e', border: `1px solid ${i === 0 ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', fontWeight: '500', cursor: 'pointer', fontSize: '13px' }}>{opt}</button>
        ))}
      </div>

      {/* Tutor Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {recommendedTutors.map((tutor, index) => (
          <div key={tutor.id} onClick={() => setSelectedTutor(tutor.id)} style={{ background: '#fff', borderRadius: '16px', border: selectedTutor === tutor.id ? '3px solid #1a5f4a' : '1px solid #e7e5e4', padding: '24px', cursor: 'pointer', position: 'relative' }}>
            {index === 0 && <div style={{ position: 'absolute', top: '-12px', right: '20px', background: '#f59e0b', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>⭐ Best Match</div>}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ width: '64px', height: '64px', background: '#f59e0b', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px', flexShrink: 0 }}>{tutor.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>{tutor.name}</h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '14px', color: '#57534e' }}>
                      <span>⭐ {tutor.rating}</span>
                      <span>📚 {tutor.sessions} sessions</span>
                      <span>✓ {tutor.reliabilityScore}% reliable</span>
                    </div>
                  </div>
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '6px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: '600' }}>{tutor.matchScore}% Match</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {tutor.topics.map(topic => <span key={topic} style={{ background: '#f5f5f4', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', color: '#57534e' }}>{topic}</span>)}
                </div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '13px' }}>
                  <span style={{ color: tutor.availability === 'High' ? '#22c55e' : '#f59e0b' }}>📅 {tutor.availability}</span>
                  <span style={{ color: tutor.distance === 'Near' ? '#22c55e' : '#f59e0b' }}>📍 {tutor.distance}</span>
                  <span style={{ color: tutor.workload === 'Low' ? '#22c55e' : '#f59e0b' }}>⚖️ {tutor.workload}</span>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#166534' }}>
                  💡 <strong>Why:</strong> {tutor.explanation}
                </div>
              </div>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: selectedTutor === tutor.id ? 'none' : '2px solid #e7e5e4', background: selectedTutor === tutor.id ? '#1a5f4a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', flexShrink: 0, alignSelf: 'center' }}>
                {selectedTutor === tutor.id && '✓'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setCurrentStep(2)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
        <button onClick={handleSelectTutorAndProceed} disabled={!selectedTutor || loading} style={{ padding: '14px 32px', background: selectedTutor && !loading ? '#1a5f4a' : '#e7e5e4', color: selectedTutor && !loading ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: selectedTutor && !loading ? 'pointer' : 'not-allowed' }}>{loading ? 'Creating...' : 'Choose Venue →'}</button>
      </div>
    </div>
  );

  // STEP 4: Choose Venue
  const renderStep4 = () => (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Choose a meeting venue 📍</h1>
      <p style={{ color: '#57534e', marginBottom: '24px' }}>Safe public venues near both you and your tutor.</p>

      {/* Session State: Tutor Accepted (SRS 2.7.2) */}
      <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '24px' }}>ℹ️</div>
        <div>
          <div style={{ fontWeight: '600', color: '#1d4ed8', fontSize: '14px' }}>Status: Tutor Accepted</div>
          <div style={{ fontSize: '13px', color: '#3b82f6' }}>Choose a venue to proceed to payment.</div>
        </div>
      </div>

      {/* Tutor Summary */}
      <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', border: '1px solid #bbf7d0' }}>
        <div style={{ width: '48px', height: '48px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>ST</div>
        <div>
          <div style={{ fontWeight: '600', color: '#1c1917' }}>Tutor: Sarah Tan</div>
          <div style={{ fontSize: '14px', color: '#57534e' }}>Tue, 14 Jan • 3:00 PM - 4:00 PM</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#22c55e', fontWeight: '500' }}>✓ Selected</span>
      </div>

      {/* Venue Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {recommendedVenues.map((venue, index) => (
          <div key={venue.id} onClick={() => setSelectedVenue(venue.id)} style={{ background: '#fff', borderRadius: '16px', border: selectedVenue === venue.id ? '3px solid #1a5f4a' : '1px solid #e7e5e4', padding: '24px', cursor: 'pointer', position: 'relative' }}>
            {index === 0 && <div style={{ position: 'absolute', top: '-12px', right: '20px', background: '#1a5f4a', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>🏆 Recommended</div>}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ width: '64px', height: '64px', background: venue.type === 'Library' ? '#dbeafe' : '#fef3c7', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>{venue.type === 'Library' ? '📚' : '🏢'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>{venue.name}</h3>
                    <p style={{ fontSize: '14px', color: '#57534e' }}>{venue.address}</p>
                  </div>
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '6px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: '600' }}>{venue.matchScore}%</div>
                </div>
                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '14px', color: '#57534e' }}>
                  <span>📍 You: {venue.distanceStudent}</span>
                  <span>📍 Tutor: {venue.distanceTutor}</span>
                  <span>🕐 {venue.hours}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {venue.accessibility.map(a => <span key={a} style={{ background: '#dbeafe', color: '#1d4ed8', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>♿ {a}</span>)}
                  {venue.amenities.map(a => <span key={a} style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>{a}</span>)}
                </div>
              </div>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: selectedVenue === venue.id ? 'none' : '2px solid #e7e5e4', background: selectedVenue === venue.id ? '#1a5f4a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', alignSelf: 'center' }}>
                {selectedVenue === venue.id && '✓'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setCurrentStep(3)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
        <button onClick={handleProceedToPayment} disabled={!selectedVenue} style={{ padding: '14px 32px', background: selectedVenue ? '#1a5f4a' : '#e7e5e4', color: selectedVenue ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: selectedVenue ? 'pointer' : 'not-allowed' }}>Proceed to Payment →</button>
      </div>
    </div>
  );

  // STEP 5: Payment (NEW per SRS 2.8)
  const renderStep5 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Payment 💳</h1>
      <p style={{ color: '#57534e', marginBottom: '32px' }}>Complete payment to confirm your session.</p>

      {/* Session State: Pending Confirmation (SRS 2.7.3) */}
      <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '24px' }}>⏳</span>
        <div>
          <div style={{ fontWeight: '600', color: '#92400e', fontSize: '14px' }}>Status: Pending Confirmation</div>
          <div style={{ fontSize: '13px', color: '#a16207' }}>Complete payment to confirm your session.</div>
        </div>
      </div>

      {/* Fee Breakdown (SRS 2.8.1-2) */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1c1917' }}>Session Fee</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: '#57534e' }}>Academic Level</span><span style={{ color: '#1c1917', fontWeight: '500' }}>University</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: '#57534e' }}>Duration</span><span style={{ color: '#1c1917', fontWeight: '500' }}>1 hour</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: '#57534e' }}>Base Rate</span><span style={{ color: '#1c1917', fontWeight: '500' }}>$25.00</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: '#57534e' }}>Platform Fee</span><span style={{ color: '#1c1917', fontWeight: '500' }}>$2.50</span></div>
        </div>
        <div style={{ borderTop: '2px solid #e7e5e4', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '18px' }}>
          <span style={{ fontWeight: '600', color: '#1c1917' }}>Total</span>
          <span style={{ fontWeight: '700', color: '#1a5f4a' }}>${sessionFee != null ? Number(sessionFee).toFixed(2) : '27.50'}</span>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
      )}
      {/* Pricing Tiers Info (SRS 2.8.4) */}
      <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '24px', fontSize: '13px', color: '#57534e' }}>
        <strong>Pricing by Level:</strong> Primary $15/hr • Secondary $18/hr • JC/Poly/ITE $22/hr • University $25/hr
      </div>

      {/* Payment Method */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Payment Method</label>
        {[{ id: 'card', label: 'Credit / Debit Card', icon: '💳', selected: true }, { id: 'paynow', label: 'PayNow', icon: '📱', selected: false }].map(m => (
          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: m.selected ? '#f0fdf4' : '#fff', border: `2px solid ${m.selected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '12px', cursor: 'pointer', marginBottom: '12px' }}>
            <input type="radio" name="payment" defaultChecked={m.selected} style={{ display: 'none' }} />
            <span style={{ fontSize: '24px' }}>{m.icon}</span>
            <span style={{ fontWeight: '500', color: '#1c1917' }}>{m.label}</span>
            {m.selected && <span style={{ marginLeft: 'auto', color: '#1a5f4a' }}>✓</span>}
          </label>
        ))}
      </div>

      {/* Card Details */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', padding: '24px', marginBottom: '32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Card Number</label>
          <input type="text" placeholder="1234 5678 9012 3456" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>Expiry</label>
            <input type="text" placeholder="MM/YY" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>CVV</label>
            <input type="text" placeholder="123" style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setCurrentStep(4)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
        <button onClick={handlePay} disabled={loading} style={{ padding: '14px 32px', background: loading ? '#e7e5e4' : '#1a5f4a', color: loading ? '#a8a29e' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Processing...' : `Pay $${sessionFee != null ? Number(sessionFee).toFixed(2) : '27.50'} →`}</button>
      </div>
    </div>
  );

  // STEP 6: Confirmation (SRS 2.7.4)
  const renderStep6 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ width: '80px', height: '80px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '40px' }}>✓</div>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Session Confirmed! 🎉</h1>
        <p style={{ color: '#57534e' }}>Your tutoring session has been booked.</p>
      </div>

      {/* Status Badge */}
      <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'center' }}>
        <span style={{ background: '#22c55e', color: '#fff', padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600' }}>Status: CONFIRMED</span>
      </div>

      {/* Session Summary */}
      <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #2d8a6e 100%)', padding: '24px', color: '#fff' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>University • Mathematics</div>
          <h2 style={{ fontSize: '24px', fontWeight: '700' }}>{getAllTopics().join(', ')}</h2>
        </div>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e7e5e4' }}>
            <div style={{ width: '56px', height: '56px', background: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>ST</div>
            <div>
              <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600' }}>Tutor</div>
              <div style={{ fontWeight: '600', color: '#1c1917', fontSize: '16px' }}>Sarah Tan</div>
              <div style={{ fontSize: '13px', color: '#57534e' }}>⭐ 4.9 • 98% reliable</div>
            </div>
          </div>
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e7e5e4' }}>
            <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Date & Time</div>
            <div style={{ fontWeight: '600', color: '#1c1917' }}>📅 Tuesday, 14 January 2025</div>
            <div style={{ color: '#57534e', marginTop: '4px' }}>🕐 3:00 PM - 4:00 PM (1 hour)</div>
          </div>
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e7e5e4' }}>
            <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Venue</div>
            <div style={{ fontWeight: '600', color: '#1c1917' }}>📍 Clementi Public Library</div>
            <div style={{ color: '#57534e', marginTop: '4px' }}>3155 Commonwealth Ave West</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#a8a29e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>Payment</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#57534e' }}>Session Fee Paid</span>
              <span style={{ fontWeight: '700', color: '#1a5f4a', fontSize: '18px' }}>$27.50</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button style={{ width: '100%', padding: '16px', background: '#1a5f4a', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' }}>📅 Add to Calendar</button>
        <button style={{ width: '100%', padding: '14px', background: '#fff', color: '#1a5f4a', border: '2px solid #1a5f4a', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>💬 Message Tutor</button>
        <button onClick={() => navigate('/dashboard')} style={{ width: '100%', padding: '14px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '12px', fontWeight: '500', cursor: 'pointer' }}>← Back to Dashboard</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <TuteeFlowHeader onCancel={() => navigate('/dashboard')} />
      <TuteeStepIndicator currentStep={currentStep} />
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}
      {currentStep === 5 && renderStep5()}
      {currentStep === 6 && renderStep6()}
    </div>
  );
};

export default RequestHelpFlow;
