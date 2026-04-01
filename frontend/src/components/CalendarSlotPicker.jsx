import { useState } from 'react';

/**
 * Shared calendar + time-slot picker.
 *
 * Props:
 *   selectedDates : Set<string>   — ISO date strings "YYYY-MM-DD"
 *   selectedHours : Set<number>   — hour numbers 9–20
 *   onToggleDate(isoDate)         — called when a date cell is clicked
 *   onToggleHour(hour)            — called when a time button is clicked
 *   hovered / setHovered          — shared hover state from parent (optional)
 *   accentColor                   — primary colour (default #1a5f4a)
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const HOUR_LABELS = [
  '9 AM', '10 AM', '11 AM', '12 PM',
  '1 PM', '2 PM', '3 PM', '4 PM',
  '5 PM', '6 PM', '7 PM', '8 PM',
];

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Monday-first: Mon=0 … Sun=6
function mondayFirstDow(date) {
  return (date.getDay() + 6) % 7;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export default function CalendarSlotPicker({
  selectedDates,
  selectedHours,
  onToggleDate,
  onToggleHour,
  accentColor = '#1a5f4a',
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [localHovered, setLocalHovered] = useState(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Can we go back? Don't allow going before current month
  const canGoPrev = viewYear > today.getFullYear() || viewMonth > today.getMonth();

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDow = mondayFirstDow(new Date(viewYear, viewMonth, 1)); // 0=Mon

  // Build calendar grid cells
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);   // leading blanks
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const accent = accentColor;
  const accentDark = '#145040';
  const accentLight = '#f0fdf4';

  const totalSlots = selectedDates.size * selectedHours.size;

  return (
    <div>
      {/* ── Month navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          style={{
            background: 'none', border: '1px solid #e7e5e4', borderRadius: '8px',
            width: '36px', height: '36px', cursor: canGoPrev ? 'pointer' : 'not-allowed',
            fontSize: '16px', color: canGoPrev ? '#1c1917' : '#d6d3d1', transition: 'all 0.15s',
          }}
        >‹</button>
        <span style={{ fontWeight: '700', fontSize: '16px', color: '#1c1917' }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          style={{
            background: 'none', border: '1px solid #e7e5e4', borderRadius: '8px',
            width: '36px', height: '36px', cursor: 'pointer',
            fontSize: '16px', color: '#1c1917', transition: 'all 0.15s',
          }}
        >›</button>
      </div>

      {/* ── Calendar grid ── */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: '20px' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f4', borderBottom: '1px solid #e7e5e4' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: d === 'Sat' || d === 'Sun' ? '#1a5f4a' : '#57534e' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Date cells — 7-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#e7e5e4' }}>
          {cells.map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} style={{ background: '#fafaf9', minHeight: '44px' }} />;
            }
            const iso = toISO(viewYear, viewMonth, day);
            const cellDate = new Date(viewYear, viewMonth, day);
            const isPast = cellDate < today;
            const isSelected = selectedDates.has(iso);
            const isToday = cellDate.getTime() === today.getTime();
            const hKey = `cal-${iso}`;
            const isHov = localHovered === hKey;
            const dow = (cellDate.getDay() + 6) % 7; // 0=Mon
            const isWeekend = dow === 5 || dow === 6;

            let bg = '#fff';
            if (isPast) bg = '#fafaf9';
            else if (isSelected) bg = accent;
            else if (isHov) bg = accentLight;

            return (
              <button
                key={iso}
                type="button"
                disabled={isPast}
                onClick={() => !isPast && onToggleDate(iso)}
                onMouseEnter={() => !isPast && setLocalHovered(hKey)}
                onMouseLeave={() => setLocalHovered(null)}
                style={{
                  background: bg,
                  border: isToday ? `2px solid ${accent}` : 'none',
                  minHeight: '44px',
                  cursor: isPast ? 'default' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  transition: 'background 0.15s',
                  padding: '4px 0',
                }}
              >
                <span style={{
                  fontSize: '14px',
                  fontWeight: isToday ? '700' : '500',
                  color: isPast ? '#d6d3d1'
                    : isSelected ? '#fff'
                    : isWeekend ? accent
                    : '#1c1917',
                }}>
                  {day}
                </span>
                {isToday && !isSelected && (
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: accent, display: 'block' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Time slots ── */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1c1917', marginBottom: '10px' }}>
          Preferred Times <span style={{ fontWeight: '400', color: '#a8a29e', fontSize: '13px' }}>(select one or more)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {HOURS.map((h, i) => {
            const isSelH = selectedHours.has(h);
            const hKey = `hour-${h}`;
            const isHov = localHovered === hKey;
            return (
              <button
                key={h}
                type="button"
                onClick={() => onToggleHour(h)}
                onMouseEnter={() => setLocalHovered(hKey)}
                onMouseLeave={() => setLocalHovered(null)}
                style={{
                  padding: '9px 4px',
                  background: isHov ? (isSelH ? accentDark : accentLight) : (isSelH ? accent : '#fff'),
                  color: isSelH ? '#fff' : (isHov ? accent : '#57534e'),
                  border: `1px solid ${isSelH ? accent : (isHov ? accent : '#e7e5e4')}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.15s',
                }}
              >
                {HOUR_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Summary chip ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#57534e' }}>
        <span style={{ background: '#f5f5f4', borderRadius: '8px', padding: '6px 12px' }}>
          📅 {selectedDates.size} date{selectedDates.size !== 1 ? 's' : ''}
        </span>
        <span style={{ color: '#d6d3d1' }}>×</span>
        <span style={{ background: '#f5f5f4', borderRadius: '8px', padding: '6px 12px' }}>
          🕐 {selectedHours.size} time slot{selectedHours.size !== 1 ? 's' : ''}
        </span>
        {totalSlots > 0 && (
          <>
            <span style={{ color: '#d6d3d1' }}>=</span>
            <span style={{ background: '#f0fdf4', color: accent, borderRadius: '8px', padding: '6px 12px', fontWeight: '600' }}>
              ✓ {totalSlots} slot{totalSlots !== 1 ? 's' : ''} selected
            </span>
          </>
        )}
      </div>
    </div>
  );
}
