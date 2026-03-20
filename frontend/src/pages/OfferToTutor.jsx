import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ============================================================
// SECTION 4: OFFER TO TUTOR FLOW (UPDATED)
// Changes per SRS 2.2.2
// ============================================================

const DAY_TO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
const DOW_TO_DAY = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
const TIME_TO_HOUR = { '9 AM': 9, '10 AM': 10, '11 AM': 11, '12 PM': 12, '1 PM': 13, '2 PM': 14, '3 PM': 15, '4 PM': 16, '5 PM': 17, '6 PM': 18, '7 PM': 19, '8 PM': 20 };
const HOUR_TO_TIME = Object.fromEntries(Object.entries(TIME_TO_HOUR).map(([label, h]) => [h, label]));

const SINGAPORE_AREAS = [
  'Ang Mo Kio', 'Bedok', 'Bishan', 'Boon Lay', 'Bukit Batok',
  'Bukit Merah', 'Bukit Panjang', 'Bukit Timah', 'Central Area',
  'Choa Chu Kang', 'Clementi', 'Geylang', 'Hougang', 'Jurong East',
  'Jurong West', 'Kallang', 'Marine Parade', 'Novena', 'Pasir Ris',
  'Punggol', 'Queenstown', 'Sembawang', 'Sengkang', 'Serangoon',
  'Tampines', 'Toa Payoh', 'Woodlands', 'Yishun',
];

// Stable components at module level to prevent remount-on-typing (which caused scroll-to-top)
const OfferFlowHeader = ({ onCancel }) => {
  const [h, setH] = useState(false);
  return (
    <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
        <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
      </div>
      <button onClick={onCancel} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ background: h ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}>✕ Cancel</button>
    </header>
  );
};

const OfferStepIndicator = ({ currentStep }) => (
  <div style={{ background: '#fff', padding: '28px 32px', borderBottom: '1px solid #e7e5e4' }}>
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '20px', left: '80px', right: '80px', height: '4px', background: '#e7e5e4', zIndex: 1 }}>
          <div style={{ width: `${((currentStep - 1) / 2) * 100}%`, height: '100%', background: '#1a5f4a', transition: 'width 0.3s' }}></div>
        </div>
        {[{ num: 1, label: 'Subjects & Topics' }, { num: 2, label: 'Availability' }, { num: 3, label: 'Preferences' }].map(step => (
          <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '120px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: currentStep >= step.num ? '#1a5f4a' : '#fff', border: `3px solid ${currentStep >= step.num ? '#1a5f4a' : '#e7e5e4'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentStep >= step.num ? '#fff' : '#a8a29e', fontWeight: '600', marginBottom: '10px' }}>
              {currentStep > step.num ? '✓' : step.num}
            </div>
            <span style={{ fontSize: '13px', fontWeight: currentStep === step.num ? '600' : '400', color: currentStep >= step.num ? '#1c1917' : '#a8a29e', textAlign: 'center' }}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const OfferToTutorFlow = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAcademicLevels, setSelectedAcademicLevels] = useState(['Secondary', 'Junior College']);
  const [selectedSubjects, setSelectedSubjects] = useState(['Mathematics']);
  const [topicsBySubject, setTopicsBySubject] = useState({ Mathematics: ['Calculus', 'Integration'] });
  const [showOtherSubject, setShowOtherSubject] = useState(false);
  const [showOtherArea, setShowOtherArea] = useState(false);
  const [tutorModeActive, setTutorModeActive] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState(['Tue-3 PM', 'Tue-4 PM', 'Thu-3 PM', 'Thu-4 PM', 'Sat-10 AM']);

  const [maxWeeklyHours, setMaxWeeklyHours] = useState(5);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [otherArea, setOtherArea] = useState('');
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [customTopicWarning, setCustomTopicWarning] = useState('');
  const [customTopicTargetSubject, setCustomTopicTargetSubject] = useState(null);
  const [accessibilityNotes, setAccessibilityNotes] = useState('');
  const [accessibilityAccommodations, setAccessibilityAccommodations] = useState(['I am flexible with venue accessibility requirements']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [planningAreasHover, setPlanningAreasHover] = useState(null);
  const [existingProfile, setExistingProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const allSubjects = [
    { name: 'Mathematics', topics: ['Calculus', 'Integration', 'Differentiation', 'Linear Algebra', 'Statistics'] },
    { name: 'Physics', topics: ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics'] },
    { name: 'Chemistry', topics: ['Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry'] },
    { name: 'Biology', topics: ['Cell Biology', 'Genetics', 'Ecology', 'Human Anatomy'] },
    { name: 'Computer Science', topics: ['Data Structures', 'Algorithms', 'Programming', 'Databases'] },
    { name: 'Economics', topics: ['Microeconomics', 'Macroeconomics', 'Econometrics'] },
    { name: 'English', topics: ['Essay Writing', 'Literature', 'Grammar'] },
  ];

  const slotsFromAvailability = (slots) => {
    if (!Array.isArray(slots)) return [];
    return slots
      .map(({ day_of_week, hour_slot }) => {
        const day = DOW_TO_DAY[day_of_week];
        const time = HOUR_TO_TIME[hour_slot];
        if (!day || !time) return null;
        return `${day}-${time}`;
      })
      .filter(Boolean);
  };

  const applyProfileFromApi = (profile) => {
    const known = new Set(allSubjects.map((s) => s.name));
    const nextTopics = {};
    (profile.topics || []).forEach(({ subject, topic }) => {
      if (!nextTopics[subject]) nextTopics[subject] = [];
      nextTopics[subject].push(topic);
    });

    const selectedSubs = [];
    let showOther = false;
    for (const s of profile.subjects || []) {
      if (s === 'Other') showOther = true;
      else if (known.has(s)) selectedSubs.push(s);
      else {
        showOther = true;
        const orphaned = nextTopics[s];
        if (orphaned?.length) {
          nextTopics.Other = [...(nextTopics.Other || []), ...orphaned];
          delete nextTopics[s];
        }
      }
    }

    const areas = profile.planning_areas || [];
    const inStd = areas.filter((a) => SINGAPORE_AREAS.includes(a));
    const custom = areas.filter((a) => !SINGAPORE_AREAS.includes(a));
    if (custom.length > 0) {
      setShowOtherArea(true);
      setSelectedAreas([]);
      setOtherArea(custom.join(', '));
    } else {
      setShowOtherArea(false);
      setSelectedAreas(inStd.length ? [...inStd] : []);
      setOtherArea('');
    }

    setSelectedAcademicLevels(profile.academic_levels?.length ? [...profile.academic_levels] : []);
    setSelectedSubjects(selectedSubs);
    setTopicsBySubject(nextTopics);
    setShowOtherSubject(showOther);
    setMaxWeeklyHours([2, 3, 5, 8, 10].includes(profile.max_weekly_hours) ? profile.max_weekly_hours : 5);
    setTutorModeActive(!!profile.is_active_mode);
    setAccessibilityNotes(profile.accessibility_notes || '');
    const caps = profile.accessibility_capabilities || [];
    const checkboxOpts = [
      'I can accommodate wheelchair users',
      'I can use hearing assistance devices',
      'I can provide visual aids/large print materials',
      'I am flexible with venue accessibility requirements',
    ];
    const matched = caps.filter((c) => checkboxOpts.includes(c));
    setAccessibilityAccommodations(matched.length ? matched : ['I am flexible with venue accessibility requirements']);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const { data: profile } = await api.get('/tutor-profile');
        if (cancelled) return;
        setExistingProfile(profile);
        applyProfileFromApi(profile);
        try {
          const { data: avail } = await api.get('/tutor-profile/availability');
          if (cancelled) return;
          const sl = slotsFromAvailability(avail.slots);
          if (sl.length) setSelectedSlots(sl);
        } catch {
          // ignore availability load errors
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setExistingProfile(null);
        } else {
          const d = err.response?.data?.detail;
          setError(typeof d === 'string' ? d : 'Failed to load tutor profile');
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const getAllTopics = () => Object.values(topicsBySubject).flat();
  const hasAnyTopics = () => getAllTopics().length > 0;

  const togglePlanningArea = (area) => {
    setShowOtherArea(false);
    setSelectedAreas((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(area)
        ? arr.filter((a) => a !== area)
        : [...arr, area];
    });
  };

  const toggleTopic = (subjectKey, topic) => {
    setCustomTopicTargetSubject(subjectKey);
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

  const CUSTOM_TOPIC_REGEX = /^[a-zA-Z0-9\s\-']+$/;

  const handleAddCustomTopic = () => {
    setCustomTopicWarning('');
    const trimmed = customTopicInput.trim();
    if (selectedSubjects.length === 0 && !showOtherSubject) {
      setCustomTopicWarning('Please select a subject first');
      return;
    }
    if (!trimmed) {
      setCustomTopicWarning('Please type a topic name before clicking Add');
      return;
    }
    if (trimmed.length > 100) {
      setCustomTopicWarning('Topic must be 1-100 characters');
      return;
    }
    if (!CUSTOM_TOPIC_REGEX.test(trimmed)) {
      setCustomTopicWarning('Topic must use only letters, numbers, spaces, hyphens, apostrophes');
      return;
    }
    const availableSubjects = [...selectedSubjects, ...(showOtherSubject ? ['Other'] : [])].filter(Boolean);
    const targetKey = availableSubjects.length === 1
      ? availableSubjects[0]
      : (availableSubjects.includes(customTopicTargetSubject) ? customTopicTargetSubject : availableSubjects[0]);
    setTopicsBySubject((prev) => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), trimmed],
    }));
    setCustomTopicInput('');
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

  const handleAcademicLevelToggle = (level) => {
    setSelectedAcademicLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const handleOtherSubjectToggle = () => {
    setShowOtherSubject(!showOtherSubject);
    if (showOtherSubject) {
      setTopicsBySubject((prev) => {
        const next = { ...prev };
        delete next['Other'];
        return next;
      });
    }
  };

  const buildTutorTopics = () =>
    Object.entries(topicsBySubject).flatMap(([subject, topics]) =>
      topics.map((topic) => ({ subject, topic }))
    );

  const formatTopicsSummary = () =>
    Object.entries(topicsBySubject)
      .filter(([, topics]) => topics.length > 0)
      .map(([subject, topics]) => `${subject}: ${topics.join(', ')}`)
      .join(' | ');

  const formatAvailabilitySummary = () => {
    const timesOrder = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM'];
    const byDay = {};
    for (const slotId of selectedSlots) {
      const [day, time] = slotId.split('-');
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(time);
    }
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fmt = (t) => {
      const h = TIME_TO_HOUR[t] ?? 9;
      if (h === 12) return '12pm';
      if (h > 12) return `${h - 12}pm`;
      return `${h}am`;
    };
    return dayOrder
      .filter((d) => byDay[d])
      .map((day) => {
        const times = byDay[day].sort((a, b) => timesOrder.indexOf(a) - timesOrder.indexOf(b));
        const first = times[0];
        const last = times[times.length - 1];
        return `${day} ${fmt(first)}-${fmt(last)}`;
      })
      .join(', ');
  };

  const slotsToAvailability = () => {
    return selectedSlots.map((slotId) => {
      const [day, time] = slotId.split('-');
      return { day_of_week: DAY_TO_DOW[day] ?? 0, hour_slot: TIME_TO_HOUR[time] ?? 9 };
    });
  };

  const handleTutorModeToggle = () => {
    setTutorModeActive((prev) => !prev);
  };

  const handleFormSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const areas = showOtherArea && otherArea ? [otherArea] : selectedAreas;
      const subjects = [...selectedSubjects, ...(showOtherSubject && (topicsBySubject['Other']?.length ?? 0) > 0 ? ['Other'] : [])];
      const payload = {
        academic_levels: selectedAcademicLevels,
        subjects,
        tutor_topics: buildTutorTopics(),
        planning_areas: areas,
        max_weekly_hours: maxWeeklyHours,
        accessibility_capabilities: accessibilityAccommodations,
        accessibility_notes: accessibilityNotes || null,
        is_active_mode: tutorModeActive,
      };
      if (existingProfile) {
        await api.put('/tutor-profile', payload);
      } else {
        await api.post('/tutor-profile', payload);
      }
      await api.put('/tutor-profile/availability', { slots: slotsToAvailability() });
      await api.patch('/tutor-profile/mode', { is_active_mode: tutorModeActive });
      navigate('/dashboard');
    } catch (err) {
      const d = err.response?.data?.detail;
      let msg = err.message ?? 'Failed to save tutor profile';
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d)) msg = d.map((x) => (x.msg != null ? x.msg : JSON.stringify(x))).join(', ');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // STEP 1: Subjects & Topics (SRS 2.2.2.2-3)
  const renderStep1 = () => (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>What can you teach? 💡</h1>
      <p style={{ color: '#57534e', marginBottom: '36px' }}>Select the subjects and specific topics you're confident teaching.</p>

      {/* Academic Levels (SRS 2.2.2.2: multi-select) */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Academic Levels you can teach <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {['Primary', 'Secondary', 'Junior College', 'Polytechnic', 'ITE', 'University'].map(level => {
            const sel = selectedAcademicLevels.includes(level);
            const h = hovered === `acad-${level}`;
            return (
              <button key={level} onClick={() => handleAcademicLevelToggle(level)} onMouseEnter={() => setHovered(`acad-${level}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 20px', background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'), color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `2px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: 'all 0.15s ease' }}>
                {sel && '✓ '}{level}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Selection with "Other" (SRS 2.2.2.3) */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Select Subjects <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {allSubjects.map(subject => {
            const sel = selectedSubjects.includes(subject.name);
            const h = hovered === `subj-${subject.name}`;
            return (
              <button key={subject.name} onClick={() => handleSubjectToggle(subject.name)} onMouseEnter={() => setHovered(`subj-${subject.name}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 20px', background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'), color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `2px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: 'all 0.15s ease' }}>
                {sel && '✓ '}{subject.name}
              </button>
            );
          })}
          <button onClick={handleOtherSubjectToggle} onMouseEnter={() => setHovered('subj-other')} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 20px', background: hovered === 'subj-other' ? (showOtherSubject ? '#145040' : '#f0faf5') : (showOtherSubject ? '#1a5f4a' : '#fff'), color: showOtherSubject ? '#fff' : (hovered === 'subj-other' ? '#1a5f4a' : '#57534e'), border: `2px solid ${hovered === 'subj-other' ? '#1a5f4a' : (showOtherSubject ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: 'all 0.15s ease' }}>
            {showOtherSubject && '✓ '}Other
          </button>
        </div>
        
        {/* Other Subject Input (SRS 2.2.2.2.3-5: 1-100 chars) */}
        {showOtherSubject && (
          <div style={{ marginTop: '12px' }}>
            <input type="text" placeholder="Enter subject name (1-100 characters)" maxLength={100} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
            <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>Optional description for custom subject</p>
          </div>
        )}
      </div>

      {/* Topic Selection (SRS 2.2.2.3: 1-100 chars each) */}
      {(selectedSubjects.length > 0 || showOtherSubject) && (
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
            Select Topics <span style={{ color: '#ef4444' }}>*</span>
            <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(1-100 characters each)</span>
          </label>
          {selectedSubjects.map(subjectName => {
            const subject = allSubjects.find(s => s.name === subjectName);
            if (!subject) return null;
            const subjectTopics = topicsBySubject[subjectName] || [];
            const customTopics = subjectTopics.filter((t) => !subject.topics.includes(t));
            return (
              <div key={subjectName} style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '12px' }}>📚 {subjectName}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {subject.topics.map(topic => {
                    const isSelected = subjectTopics.includes(topic);
                    return (
                      <button key={topic} type="button" onClick={() => toggleTopic(subjectName, topic)} style={{ padding: '8px 14px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `1px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
                        {isSelected && '✓ '}{topic}
                      </button>
                    );
                  })}
                  {customTopics.map(topic => (
                    <button key={topic} type="button" onClick={() => toggleTopic(subjectName, topic)} style={{ padding: '8px 14px', background: '#1a5f4a', color: '#fff', border: '1px solid #1a5f4a', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
                      ✓ {topic}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {showOtherSubject && (
            <div style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '12px' }}>📚 Other Topics</div>
              <p style={{ fontSize: '13px', color: '#57534e', marginBottom: '8px' }}>Add custom topics below.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {(topicsBySubject['Other'] || []).map(topic => (
                  <button key={topic} type="button" onClick={() => toggleTopic('Other', topic)} onMouseEnter={() => setHovered(`otopic-${topic}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '8px 14px', background: hovered === `otopic-${topic}` ? '#145040' : '#1a5f4a', color: '#fff', border: '1px solid #1a5f4a', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px', transition: 'all 0.15s ease' }}>
                    ✓ {topic}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Topic */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Add Custom Topic <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional, 1-100 chars)</span>
        </div>
        {(selectedSubjects.length > 0 || showOtherSubject) && (() => {
          const availableSubjects = [...selectedSubjects, ...(showOtherSubject ? ['Other'] : [])].filter(Boolean);
          const showDropdown = availableSubjects.length > 1;
          const effectiveTarget = availableSubjects.length === 1 ? availableSubjects[0] : (availableSubjects.includes(customTopicTargetSubject) ? customTopicTargetSubject : availableSubjects[0]);
          return (
            <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Add custom topic to:</span>
              {showDropdown ? (
                <select value={effectiveTarget} onChange={(e) => setCustomTopicTargetSubject(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', background: '#fff', cursor: 'pointer' }}>
                  {availableSubjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontWeight: '600', color: '#1c1917' }}>{effectiveTarget}</span>
              )}
            </div>
          );
        })()}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <input type="text" placeholder="Type a topic..." maxLength={100} value={customTopicInput} onChange={(e) => { setCustomTopicInput(e.target.value); setCustomTopicWarning(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTopic(); } }} style={{ flex: 1, padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          <button type="button" onClick={handleAddCustomTopic} onMouseEnter={() => setHovered('add-custom')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 24px', background: hovered === 'add-custom' ? '#1a5f4a' : '#f5f5f4', color: hovered === 'add-custom' ? '#fff' : '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s ease' }}>+ Add</button>
        </div>
        {customTopicWarning && <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '8px' }}>{customTopicWarning}</p>}
      </div>

      {/* Selected Summary — grouped by subject */}
      {hasAnyTopics() && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>For confirmation, you&apos;ll teach:</div>
          {selectedAcademicLevels.length > 0 && (
            <div style={{ fontSize: '14px', color: '#166534', marginBottom: '8px' }}>
              <strong>Levels:</strong> {selectedAcademicLevels.join(', ')}
            </div>
          )}
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
        <button onClick={() => setCurrentStep(2)} disabled={!hasAnyTopics() || selectedAcademicLevels.length === 0} onMouseEnter={() => hasAnyTopics() && selectedAcademicLevels.length > 0 && setHovered('cont1')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: hasAnyTopics() && selectedAcademicLevels.length > 0 ? (hovered === 'cont1' ? '#14583e' : '#1a5f4a') : '#e7e5e4', color: hasAnyTopics() && selectedAcademicLevels.length > 0 ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: hasAnyTopics() && selectedAcademicLevels.length > 0 ? 'pointer' : 'not-allowed', boxShadow: hasAnyTopics() && selectedAcademicLevels.length > 0 && hovered === 'cont1' ? '0 4px 14px rgba(26, 95, 74, 0.35)' : 'none', transition: 'all 0.2s ease' }}>Continue →</button>
      </div>
    </div>
  );

  // STEP 2: Availability (SRS 2.2.2.4: 1-hour intervals)
  const renderStep2 = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const times = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM'];

    const toggleSlot = (day, time) => {
      const slotId = `${day}-${time}`;
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots(selectedSlots.filter(s => s !== slotId));
      } else {
        setSelectedSlots([...selectedSlots, slotId]);
      }
    };

    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>When are you available? 📅</h1>
        <p style={{ color: '#57534e', marginBottom: '36px' }}>Click time slots when you're free. (1-hour intervals)</p>

        {/* Weekly Grid */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', background: '#f5f5f4', borderBottom: '1px solid #e7e5e4' }}>
            <div style={{ padding: '14px' }}></div>
            {days.map(day => <div key={day} style={{ padding: '14px', textAlign: 'center', fontWeight: '600', color: '#1c1917', fontSize: '13px' }}>{day}</div>)}
          </div>
          {times.map(time => (
            <div key={time} style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', borderBottom: '1px solid #f5f5f4' }}>
              <div style={{ padding: '10px', fontSize: '12px', color: '#57534e', fontWeight: '500', display: 'flex', alignItems: 'center' }}>{time}</div>
              {days.map(day => {
                const slotId = `${day}-${time}`;
                const isSelected = selectedSlots.includes(slotId);
                return (
                  <div key={slotId} onClick={() => toggleSlot(day, time)} onMouseEnter={() => setHovered(`slot-${slotId}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <div style={{ width: '100%', height: '28px', background: hovered === `slot-${slotId}` ? (isSelected ? '#2d7a61' : '#e8f5e9') : (isSelected ? '#1a5f4a' : '#f5f5f4'), borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#fff' : 'transparent', fontSize: '11px', transition: 'all 0.2s ease' }}>
                      {isSelected && '✓'}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#57534e' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '16px', height: '16px', background: '#1a5f4a', borderRadius: '3px', display: 'inline-block' }}></span> Available</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '16px', height: '16px', background: '#f5f5f4', borderRadius: '3px', display: 'inline-block' }}></span> Not available</span>
          </div>
          <div style={{ background: '#f0fdf4', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', color: '#166534', fontWeight: '500' }}>✓ {selectedSlots.length} slots</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => setCurrentStep(1)} onMouseEnter={() => setHovered('back2')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 24px', background: hovered === 'back2' ? '#f0faf5' : '#fff', color: '#57534e', border: `1px solid ${hovered === 'back2' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>← Back</button>
          <button onClick={() => setCurrentStep(3)} disabled={selectedSlots.length === 0} onMouseEnter={() => selectedSlots.length > 0 && setHovered('cont2')} onMouseLeave={() => setHovered(null)} style={{ padding: '14px 32px', background: selectedSlots.length > 0 ? (hovered === 'cont2' ? '#2d7a61' : '#1a5f4a') : '#e7e5e4', color: selectedSlots.length > 0 ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: selectedSlots.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease' }}>Continue →</button>
        </div>
      </div>
    );
  };

  // STEP 3: Preferences (SRS 2.2.2.5-9)
  const renderStep3 = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Set your preferences ⚙️</h1>
      <p style={{ color: '#57534e', marginBottom: '36px' }}>Configure your tutoring limits and preferences.</p>

      {/* Tutor Mode Toggle (SRS 2.2.2.9) */}
      <div style={{ background: tutorModeActive ? '#f0fdf4' : '#f5f5f4', border: `1px solid ${tutorModeActive ? '#bbf7d0' : '#e7e5e4'}`, borderRadius: '16px', padding: '20px', marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '32px' }}>🎓</div>
          <div>
            <div style={{ fontWeight: '600', color: tutorModeActive ? '#166534' : '#57534e' }}>{tutorModeActive ? 'Tutor Mode Active' : 'Tutor Mode Inactive'}</div>
            <div style={{ fontSize: '13px', color: '#57534e' }}>{tutorModeActive ? "You're visible in recommendations" : "You won't appear in searches"}</div>
          </div>
        </div>
        <div onClick={handleTutorModeToggle} onMouseEnter={() => setHovered('toggle')} onMouseLeave={() => setHovered(null)} style={{ width: '50px', height: '28px', background: tutorModeActive ? (hovered === 'toggle' ? '#16a34a' : '#22c55e') : '#e7e5e4', borderRadius: '14px', position: 'relative', cursor: 'pointer', transition: 'all 0.15s ease' }}>
          <div style={{ width: '24px', height: '24px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: tutorModeActive ? 'auto' : '2px', right: tutorModeActive ? '2px' : 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
        </div>
      </div>

      {/* Max Hours Per Week (SRS 2.2.2.6: 2h, 3h, 5h, 8h, 10h) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Maximum hours per week <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '12px' }}>Helps prevent burnout.</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[2, 3, 5, 8, 10].map((hrs) => {
            const sel = maxWeeklyHours === hrs;
            const h = hovered === `hrs-${hrs}`;
            return (
              <button key={hrs} onClick={() => setMaxWeeklyHours(hrs)} onMouseEnter={() => setHovered(`hrs-${hrs}`)} onMouseLeave={() => setHovered(null)} style={{ padding: '12px 20px', background: h ? (sel ? '#145040' : '#f0faf5') : (sel ? '#1a5f4a' : '#fff'), color: sel ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `2px solid ${h ? '#1a5f4a' : (sel ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}>{hrs} hrs</button>
            );
          })}
        </div>
      </div>

      {/* Preferred Areas with buttons + "Other" (matching TuteeRequest.jsx) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Preferred Areas <span style={{ color: '#ef4444' }}>*</span>
          <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(select one or more)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {SINGAPORE_AREAS.map((area) => {
            const isSelected = Array.isArray(selectedAreas) && !showOtherArea && selectedAreas.includes(area);
            const h = planningAreasHover === `area-${area}`;
            return (
              <button key={area} type="button" onClick={() => togglePlanningArea(area)} onMouseEnter={() => setPlanningAreasHover(`area-${area}`)} onMouseLeave={() => setPlanningAreasHover(null)} style={{ padding: '10px 16px', background: h ? (isSelected ? '#145040' : '#f0faf5') : (isSelected ? '#1a5f4a' : '#fff'), color: isSelected ? '#fff' : (h ? '#1a5f4a' : '#57534e'), border: `1px solid ${h ? '#1a5f4a' : (isSelected ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}>{isSelected && '✓ '}{area}</button>
            );
          })}
          <button type="button" onClick={() => { setShowOtherArea(true); setSelectedAreas([]); }} onMouseEnter={() => setPlanningAreasHover('area-other')} onMouseLeave={() => setPlanningAreasHover(null)} style={{ padding: '10px 16px', background: planningAreasHover === 'area-other' ? (showOtherArea ? '#145040' : '#f0faf5') : (showOtherArea ? '#1a5f4a' : '#fff'), color: showOtherArea ? '#fff' : (planningAreasHover === 'area-other' ? '#1a5f4a' : '#57534e'), border: `1px solid ${planningAreasHover === 'area-other' ? '#1a5f4a' : (showOtherArea ? '#1a5f4a' : '#e7e5e4')}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.15s ease' }}>{showOtherArea && '✓ '}Other</button>
        </div>
        {showOtherArea && (
          <input type="text" placeholder="Enter planning area (1-100 characters)" maxLength={100} value={otherArea} onChange={(e) => setOtherArea(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
        )}
      </div>

      {/* Accessibility Accommodation (SRS 2.2.2.7) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Accessibility Accommodation
          <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(optional, 1-100 chars)</span>
        </label>
        <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '12px' }}>
          Indicate if you can cater to tutees with accessibility needs.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {[
            'I can accommodate wheelchair users',
            'I can use hearing assistance devices',
            'I can provide visual aids/large print materials',
            'I am flexible with venue accessibility requirements'
          ].map((opt, i) => (
            <label key={i} onClick={() => setAccessibilityAccommodations((prev) => prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt])} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={accessibilityAccommodations.includes(opt)} readOnly style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
              <span style={{ fontSize: '14px', color: '#57534e' }}>{opt}</span>
            </label>
          ))}
        </div>
        <textarea rows={2} maxLength={100} placeholder="Additional accessibility notes (optional, 1-100 characters)" value={accessibilityNotes} onChange={(e) => setAccessibilityNotes(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>{accessibilityNotes.length} / 100</div>
      </div>

      {/* Preferences */}
      {/* <div style={{ marginBottom: '40px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Additional preferences</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: 'Only accept requests from verified students', checked: false },
            { label: 'Allow students to message me before booking', checked: true },
            { label: 'Show my rating publicly', checked: true },
            { label: 'Receive email notifications for new requests', checked: true },
          ].map((pref, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#f5f5f4', borderRadius: '10px', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={pref.checked} style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
              <span style={{ fontSize: '14px', color: '#1c1917' }}>{pref.label}</span>
            </label>
          ))}
        </div>
      </div> */}

      {/* Summary Card */}
      <div style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #2d8a6e 100%)', borderRadius: '16px', padding: '24px', color: '#fff', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>📋 Your Tutor Profile Summary</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
          {selectedAcademicLevels.length > 0 && (
            <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Academic levels</div><div style={{ fontWeight: '600' }}>{selectedAcademicLevels.join(', ')}</div></div>
          )}
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Subjects</div><div style={{ fontWeight: '600' }}>{selectedSubjects.join(', ')}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Topics</div><div style={{ fontWeight: '600' }}>{formatTopicsSummary() || '—'}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Availability</div><div style={{ fontWeight: '600' }}>{formatAvailabilitySummary() || '—'}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Planning areas</div><div style={{ fontWeight: '600' }}>{(showOtherArea && otherArea ? [otherArea] : selectedAreas).join(', ') || '—'}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Accessibility accommodations</div><div style={{ fontWeight: '600' }}>{accessibilityAccommodations.length > 0 ? accessibilityAccommodations.map((a) => ({ 'I can accommodate wheelchair users': 'Wheelchair', 'I can use hearing assistance devices': 'Hearing assistance', 'I can provide visual aids/large print materials': 'Visual aids', 'I am flexible with venue accessibility requirements': 'Venue flexibility' }[a] || a)).join(', ') : 'None specified'}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Max hours/week</div><div style={{ fontWeight: '600' }}>{maxWeeklyHours} hours</div></div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
      )}
      {/* Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button onClick={handleFormSubmit} disabled={loading} onMouseEnter={() => !loading && setHovered('activate')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '16px', background: loading ? '#e7e5e4' : (hovered === 'activate' ? '#14583e' : '#1a5f4a'), color: loading ? '#a8a29e' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px', boxShadow: !loading && hovered === 'activate' ? '0 4px 14px rgba(26, 95, 74, 0.35)' : 'none', transition: 'all 0.2s ease' }}>{loading ? 'Activating...' : '✓ Activate Tutor Profile'}</button>
        <button onClick={() => setCurrentStep(2)} onMouseEnter={() => setHovered('back3')} onMouseLeave={() => setHovered(null)} style={{ width: '100%', padding: '14px', background: hovered === 'back3' ? '#f0faf5' : '#fff', color: '#57534e', border: `1px solid ${hovered === 'back3' ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '12px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}>← Back to Edit</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' }}>
      {profileLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(250,250,249,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '36px' }}>⏳</span>
          <span style={{ fontSize: '15px', color: '#57534e', fontWeight: '500' }}>Loading your tutor profile…</span>
        </div>
      )}
      <OfferFlowHeader onCancel={() => navigate('/dashboard')} />
      <OfferStepIndicator currentStep={currentStep} />
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
    </div>
  );
};

export default OfferToTutorFlow;
