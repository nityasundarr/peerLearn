import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ============================================================
// SECTION 4: OFFER TO TUTOR FLOW (UPDATED)
// Changes per SRS 2.2.2
// ============================================================

const DAY_TO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
const TIME_TO_HOUR = { '9 AM': 9, '10 AM': 10, '11 AM': 11, '12 PM': 12, '1 PM': 13, '2 PM': 14, '3 PM': 15, '4 PM': 16, '5 PM': 17, '6 PM': 18, '7 PM': 19, '8 PM': 20 };

// Stable components at module level to prevent remount-on-typing (which caused scroll-to-top)
const OfferFlowHeader = ({ onCancel }) => (
  <header style={{ background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)', padding: '0 32px', height: '72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>P</div>
      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>PeerLearn</span>
    </div>
    <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>✕ Cancel</button>
  </header>
);

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
  const [selectedSubjects, setSelectedSubjects] = useState(['Mathematics']);
  const [selectedTopics, setSelectedTopics] = useState(['Calculus', 'Integration']);
  const [showOtherSubject, setShowOtherSubject] = useState(false);
  const [showOtherArea, setShowOtherArea] = useState(false);
  const [tutorModeActive, setTutorModeActive] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState(['Tue-3 PM', 'Tue-4 PM', 'Thu-3 PM', 'Thu-4 PM', 'Sat-10 AM']);

  const [maxWeeklyHours, setMaxWeeklyHours] = useState(5);
  const [planningAreas, setPlanningAreas] = useState(['Clementi', 'Jurong East']);
  const [otherArea, setOtherArea] = useState('');
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [accessibilityNotes, setAccessibilityNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const allSubjects = [
    { name: 'Mathematics', topics: ['Calculus', 'Integration', 'Differentiation', 'Linear Algebra', 'Statistics'] },
    { name: 'Physics', topics: ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics'] },
    { name: 'Chemistry', topics: ['Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry'] },
    { name: 'Biology', topics: ['Cell Biology', 'Genetics', 'Ecology', 'Human Anatomy'] },
    { name: 'Computer Science', topics: ['Data Structures', 'Algorithms', 'Programming', 'Databases'] },
    { name: 'Economics', topics: ['Microeconomics', 'Macroeconomics', 'Econometrics'] },
    { name: 'English', topics: ['Essay Writing', 'Literature', 'Grammar'] },
  ];

  const buildTutorTopics = () => {
    const topics = [];
    const predefinedTopics = new Set();
    selectedSubjects.forEach((subj) => {
      const subject = allSubjects.find((s) => s.name === subj);
      if (subject) {
        subject.topics.forEach((t) => {
          predefinedTopics.add(t);
          if (selectedTopics.includes(t)) topics.push({ subject: subj, topic: t });
        });
      }
    });
    // Include custom topics (in selectedTopics but not predefined) — assign to first selected subject
    const firstSubject = selectedSubjects[0] || 'Other';
    selectedTopics.forEach((t) => {
      if (!predefinedTopics.has(t)) {
        topics.push({ subject: firstSubject, topic: t });
      }
    });
    return topics;
  };

  const slotsToAvailability = () => {
    return selectedSlots.map((slotId) => {
      const [day, time] = slotId.split('-');
      return { day_of_week: DAY_TO_DOW[day] ?? 0, hour_slot: TIME_TO_HOUR[time] ?? 9 };
    });
  };

  const handleTutorModeToggle = async () => {
    const next = !tutorModeActive;
    setTutorModeActive(next);
    setError(null);
    try {
      await api.patch('/tutor-profile/mode', { is_active_mode: next });
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to update mode');
      setTutorModeActive(!next);
    }
  };

  const handleFormSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const areas = showOtherArea && otherArea ? [otherArea] : planningAreas;
      await api.post('/tutor-profile', {
        academic_levels: ['Primary', 'Secondary', 'Junior College', 'Polytechnic', 'ITE', 'University'],
        subjects: selectedSubjects,
        tutor_topics: buildTutorTopics(),
        planning_areas: areas,
        max_weekly_hours: maxWeeklyHours,
        accessibility_capabilities: [],
        accessibility_notes: accessibilityNotes || null,
        is_active_mode: tutorModeActive,
      });
      await api.put('/tutor-profile/availability', { slots: slotsToAvailability() });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to activate profile');
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
          {['Primary', 'Secondary', 'Junior College', 'Polytechnic', 'ITE', 'University'].map(level => (
            <button key={level} style={{ padding: '12px 20px', background: '#fff', color: '#57534e', border: '2px solid #e7e5e4', borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Selection with "Other" (SRS 2.2.2.3) */}
      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
          Select Subjects <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {allSubjects.map(subject => (
            <button key={subject.name} onClick={() => selectedSubjects.includes(subject.name) ? setSelectedSubjects(selectedSubjects.filter(s => s !== subject.name)) : setSelectedSubjects([...selectedSubjects, subject.name])} style={{ padding: '12px 20px', background: selectedSubjects.includes(subject.name) ? '#1a5f4a' : '#fff', color: selectedSubjects.includes(subject.name) ? '#fff' : '#57534e', border: `2px solid ${selectedSubjects.includes(subject.name) ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
              {selectedSubjects.includes(subject.name) && '✓ '}{subject.name}
            </button>
          ))}
          <button onClick={() => setShowOtherSubject(!showOtherSubject)} style={{ padding: '12px 20px', background: showOtherSubject ? '#1a5f4a' : '#fff', color: showOtherSubject ? '#fff' : '#57534e', border: `2px solid ${showOtherSubject ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
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
      {selectedSubjects.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>
            Select Topics <span style={{ color: '#ef4444' }}>*</span>
            <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(1-100 characters each)</span>
          </label>
          {selectedSubjects.map(subjectName => {
            const subject = allSubjects.find(s => s.name === subjectName);
            if (!subject) return null;
            return (
              <div key={subjectName} style={{ background: '#f5f5f4', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', color: '#1c1917', marginBottom: '12px' }}>📚 {subjectName}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {subject.topics.map(topic => (
                    <button key={topic} onClick={() => selectedTopics.includes(topic) ? setSelectedTopics(selectedTopics.filter(t => t !== topic)) : setSelectedTopics([...selectedTopics, topic])} style={{ padding: '8px 14px', background: selectedTopics.includes(topic) ? '#1a5f4a' : '#fff', color: selectedTopics.includes(topic) ? '#fff' : '#57534e', border: `1px solid ${selectedTopics.includes(topic) ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
                      {selectedTopics.includes(topic) && '✓ '}{topic}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Topic */}
      <div style={{ marginBottom: '40px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>
          Add Custom Topic <span style={{ fontWeight: '400', color: '#a8a29e' }}>(optional, 1-100 chars)</span>
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input type="text" placeholder="Type a topic..." maxLength={100} value={customTopicInput} onChange={(e) => setCustomTopicInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = customTopicInput.trim(); if (t) { setSelectedTopics((prev) => [...prev, t]); setCustomTopicInput(''); } } }} style={{ flex: 1, padding: '14px 16px', borderRadius: '10px', border: '1px solid #e7e5e4', fontSize: '15px', boxSizing: 'border-box' }} />
          <button type="button" onClick={() => { const t = customTopicInput.trim(); if (t) { setSelectedTopics((prev) => [...prev, t]); setCustomTopicInput(''); } }} style={{ padding: '14px 24px', background: '#f5f5f4', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', cursor: 'pointer', fontWeight: '500' }}>+ Add</button>
        </div>
      </div>

      {/* Selected Summary — grouped by subject */}
      {selectedTopics.length > 0 && (() => {
        const grouped = buildTutorTopics().reduce((acc, { subject, topic }) => {
          if (!acc[subject]) acc[subject] = [];
          acc[subject].push(topic);
          return acc;
        }, {});
        return (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>For confirmation, you&apos;ll teach:</div>
            {Object.entries(grouped).map(([subject, topics]) => (
              <div key={subject} style={{ fontSize: '14px', color: '#166534', marginBottom: '4px' }}>
                <strong>{subject}</strong>: {topics.join(', ')}
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setCurrentStep(2)} disabled={selectedTopics.length === 0} style={{ padding: '14px 32px', background: selectedTopics.length > 0 ? '#1a5f4a' : '#e7e5e4', color: selectedTopics.length > 0 ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed' }}>Continue →</button>
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
                  <div key={slotId} onClick={() => toggleSlot(day, time)} style={{ padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <div style={{ width: '100%', height: '28px', background: isSelected ? '#1a5f4a' : '#f5f5f4', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#fff' : 'transparent', fontSize: '11px' }}>
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
          <button onClick={() => setCurrentStep(1)} style={{ padding: '14px 24px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '10px', fontWeight: '500', cursor: 'pointer' }}>← Back</button>
          <button onClick={() => setCurrentStep(3)} disabled={selectedSlots.length === 0} style={{ padding: '14px 32px', background: selectedSlots.length > 0 ? '#1a5f4a' : '#e7e5e4', color: selectedSlots.length > 0 ? '#fff' : '#a8a29e', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: selectedSlots.length > 0 ? 'pointer' : 'not-allowed' }}>Continue →</button>
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
        <div onClick={handleTutorModeToggle} style={{ width: '50px', height: '28px', background: tutorModeActive ? '#22c55e' : '#e7e5e4', borderRadius: '14px', position: 'relative', cursor: 'pointer' }}>
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
          {[2, 3, 5, 8, 10].map((hrs) => (
            <button key={hrs} onClick={() => setMaxWeeklyHours(hrs)} style={{ padding: '12px 20px', background: maxWeeklyHours === hrs ? '#1a5f4a' : '#fff', color: maxWeeklyHours === hrs ? '#fff' : '#57534e', border: `2px solid ${maxWeeklyHours === hrs ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '500' }}>{hrs} hrs</button>
          ))}
        </div>
      </div>

      {/* Preferred Areas with "Other" (SRS 2.2.2.5) */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>Preferred tutoring areas</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {['Clementi', 'Jurong East', 'Jurong West', 'Bukit Batok', 'Queenstown'].map((area) => {
            const isSelected = !showOtherArea && planningAreas.includes(area);
            return (
              <button key={area} onClick={() => { setShowOtherArea(false); setPlanningAreas(planningAreas.includes(area) ? planningAreas.filter((a) => a !== area) : [...planningAreas.filter((a) => !['Clementi', 'Jurong East', 'Jurong West', 'Bukit Batok', 'Queenstown'].includes(a)), area]); }} style={{ padding: '10px 16px', background: isSelected ? '#1a5f4a' : '#fff', color: isSelected ? '#fff' : '#57534e', border: `1px solid ${isSelected ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{isSelected && '✓ '}{area}</button>
            );
          })}
          <button onClick={() => { setShowOtherArea(true); setPlanningAreas([]); }} style={{ padding: '10px 16px', background: showOtherArea ? '#1a5f4a' : '#fff', color: showOtherArea ? '#fff' : '#57534e', border: `1px solid ${showOtherArea ? '#1a5f4a' : '#e7e5e4'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{showOtherArea && '✓ '}Other</button>
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
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={i === 3} style={{ width: '20px', height: '20px', accentColor: '#1a5f4a' }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Subjects</div><div style={{ fontWeight: '600' }}>{selectedSubjects.join(', ')}</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Topics</div><div style={{ fontWeight: '600' }}>{selectedTopics.length} topics</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Availability</div><div style={{ fontWeight: '600' }}>{selectedSlots.length} time slots</div></div>
          <div><div style={{ opacity: 0.8, marginBottom: '4px' }}>Max hours/week</div><div style={{ fontWeight: '600' }}>{maxWeeklyHours} hours</div></div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>{error}</div>
      )}
      {/* Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button onClick={handleFormSubmit} disabled={loading} style={{ width: '100%', padding: '16px', background: loading ? '#e7e5e4' : '#1a5f4a', color: loading ? '#a8a29e' : '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px' }}>{loading ? 'Activating...' : '✓ Activate Tutor Profile'}</button>
        <button onClick={() => setCurrentStep(2)} style={{ width: '100%', padding: '14px', background: '#fff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: '12px', fontWeight: '500', cursor: 'pointer' }}>← Back to Edit</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <OfferFlowHeader onCancel={() => navigate('/dashboard')} />
      <OfferStepIndicator currentStep={currentStep} />
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
    </div>
  );
};

export default OfferToTutorFlow;
