import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import AdminLayout from './AdminLayout';

const STATUS_STYLES = {
  open:         { bg: '#fef2f2', color: '#991b1b', label: 'Open' },
  under_review: { bg: '#fffbeb', color: '#92400e', label: 'Under Review' },
  resolved:     { bg: '#f0fdf4', color: '#166534', label: 'Resolved' },
  dismissed:    { bg: '#f5f5f4', color: '#57534e', label: 'Dismissed' },
};

const CATEGORY_LABELS = {
  misconduct: 'Misconduct',
  no_show: 'No-show',
  payment: 'Payment Issue',
  other: 'Other',
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Complaints List ──────────────────────────────────────────────────────────

const ComplaintsList = () => {
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/complaints${params}`);
      setComplaints(Array.isArray(data) ? data : []);
    } catch (err) {
      setComplaints([]);
      setLoadError(err.response?.data?.detail ?? err.message ?? 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filters = ['', 'open', 'under_review', 'resolved', 'dismissed'];
  const filterLabels = { '': 'All', open: 'Open', under_review: 'Under Review', resolved: 'Resolved', dismissed: 'Dismissed' };

  return (
    <AdminLayout>
      <div style={{ maxWidth: '900px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '700', color: '#1c1917' }}>Complaints</h1>
        <p style={{ margin: '0 0 24px', color: '#78716c', fontSize: '14px' }}>Review and manage user-submitted complaints</p>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {filters.map((f) => {
            const active = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                onMouseEnter={() => setHovered(`filter-${f}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: '8px 16px',
                  background: active ? '#1a5f4a' : (hovered === `filter-${f}` ? '#f0faf5' : '#fff'),
                  color: active ? '#fff' : '#57534e',
                  border: `1px solid ${active ? '#1a5f4a' : '#e7e5e4'}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {filterLabels[f]}
              </button>
            );
          })}
        </div>

        {loading && <div style={{ color: '#a8a29e', padding: '48px', textAlign: 'center' }}>Loading…</div>}
        {!loading && loadError && (
          <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px', marginBottom: '16px', fontSize: '14px' }}>
            Error: {loadError}
          </div>
        )}
        {!loading && !loadError && complaints.length === 0 && (
          <div style={{ color: '#a8a29e', padding: '48px', textAlign: 'center', background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4' }}>No complaints found.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {complaints.map((c) => {
            const s = STATUS_STYLES[c.status] || STATUS_STYLES.open;
            return (
              <div
                key={c.complaint_id}
                onClick={() => navigate(`/admin/complaints/${c.complaint_id}`)}
                onMouseEnter={() => setHovered(`row-${c.complaint_id}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: `1px solid ${hovered === `row-${c.complaint_id}` ? '#1a5f4a' : '#e7e5e4'}`,
                  padding: '18px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1c1917', fontFamily: 'monospace' }}>
                      CPL-{c.complaint_id.slice(0, 8).toUpperCase()}
                    </span>
                    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>{s.label}</span>
                    <span style={{ background: '#f5f5f4', color: '#57534e', padding: '2px 10px', borderRadius: '20px', fontSize: '12px' }}>
                      {CATEGORY_LABELS[c.category] || c.category}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.description}
                  </p>
                </div>
                <div style={{ fontSize: '12px', color: '#a8a29e', whiteSpace: 'nowrap' }}>{formatDate(c.created_at)}</div>
                <span style={{ color: '#1a5f4a', fontSize: '18px' }}>›</span>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
};

// ── Complaint Detail ─────────────────────────────────────────────────────────

const PENALTY_OPTIONS = ['warning', 'suspension', 'ban'];
const STATUS_OPTIONS = ['open', 'under_review', 'resolved', 'dismissed'];

const ComplaintDetail = () => {
  const { complaintId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionForm, setActionForm] = useState({ action: '', notes: '', affected_user_id: '', penalty_type: 'warning', update_status: 'under_review' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/complaints/${complaintId}`);
      setDetail(data);
      // Pre-fill affected_user_id with the accused (the non-reporter party in the session)
      const reporterId = data?.complaint?.reporter_id;
      const tutorId = data?.session_info?.tutor_id;
      const tuteeId = data?.session_info?.tutee_id;
      const accusedId = reporterId === tuteeId ? tutorId : tuteeId;
      if (accusedId) {
        setActionForm((f) => ({ ...f, affected_user_id: f.affected_user_id || accusedId }));
      }
    } catch (err) {
      if (err.response?.status === 403) navigate('/admin/overview');
    } finally {
      setLoading(false);
    }
  }, [complaintId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitAction = async () => {
    if (!actionForm.action.trim() || !actionForm.affected_user_id.trim()) {
      setError('Action description and affected user ID are required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post(`/complaints/${complaintId}/action`, actionForm);
      setDetail(data);
      const rId = data?.complaint?.reporter_id;
      const tId = data?.session_info?.tutor_id;
      const ttId = data?.session_info?.tutee_id;
      const accused = rId === ttId ? tId : ttId;
      setActionForm({ action: '', notes: '', affected_user_id: accused || '', penalty_type: 'warning', update_status: 'under_review' });
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to record action.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <AdminLayout><div style={{ color: '#a8a29e', padding: '48px', textAlign: 'center' }}>Loading…</div></AdminLayout>;
  if (!detail) return <AdminLayout><div style={{ color: '#ef4444', padding: '48px', textAlign: 'center' }}>Complaint not found.</div></AdminLayout>;

  const { complaint, actions, disciplinary_records, session_info } = detail;
  const s = STATUS_STYLES[complaint.status] || STATUS_STYLES.open;
  const isClosed = complaint.status === 'resolved' || complaint.status === 'dismissed';

  return (
    <AdminLayout>
      <div style={{ maxWidth: '820px' }}>
        {/* Back */}
        <button
          onClick={() => navigate('/admin/complaints')}
          onMouseEnter={() => setHovered('back')}
          onMouseLeave={() => setHovered(null)}
          style={{ background: 'none', border: 'none', color: hovered === 'back' ? '#1a5f4a' : '#78716c', fontSize: '14px', cursor: 'pointer', marginBottom: '20px', padding: 0, fontWeight: '500' }}
        >
          ← Back to Complaints
        </button>

        {/* Header */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px 28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', color: '#57534e', marginBottom: '4px' }}>
                CPL-{complaint.complaint_id.slice(0, 8).toUpperCase()}
              </div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1c1917' }}>
                {CATEGORY_LABELS[complaint.category] || complaint.category} Complaint
              </h2>
            </div>
            <span style={{ background: s.bg, color: s.color, padding: '5px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Reporter ID', value: complaint.reporter_id },
              { label: 'Session ID', value: complaint.session_id },
              { label: 'Submitted', value: formatDate(complaint.created_at) },
              { label: 'Category', value: CATEGORY_LABELS[complaint.category] || complaint.category },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#fafaf9', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '11px', color: '#a8a29e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: '#1c1917', wordBreak: 'break-all' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fafaf9', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: '#a8a29e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Description</div>
            <p style={{ margin: 0, fontSize: '14px', color: '#1c1917', lineHeight: '1.6' }}>{complaint.description}</p>
          </div>
        </div>

        {/* Session info */}
        {session_info && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '20px 28px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📅 Session Info</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Status', value: session_info.status },
                { label: 'Level', value: session_info.academic_level || '—' },
                { label: 'Scheduled', value: formatDate(session_info.scheduled_at) },
                { label: 'Tutee ID', value: session_info.tutee_id },
                { label: 'Tutor ID', value: session_info.tutor_id },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#fafaf9', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#a8a29e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: '#1c1917', wordBreak: 'break-all' }}>{value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions taken */}
        {actions.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '20px 28px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>📋 Actions Taken</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {actions.map((a) => (
                <div key={a.action_id} style={{ background: '#fafaf9', borderRadius: '8px', padding: '12px 14px', borderLeft: '3px solid #1a5f4a' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '4px' }}>{a.action}</div>
                  {a.notes && <div style={{ fontSize: '13px', color: '#57534e', marginBottom: '4px' }}>{a.notes}</div>}
                  <div style={{ fontSize: '12px', color: '#a8a29e' }}>{formatDate(a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disciplinary records */}
        {disciplinary_records.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #fca5a5', padding: '20px 28px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '700', color: '#991b1b' }}>⚠️ Disciplinary Records</h3>
            {disciplinary_records.map((r) => (
              <div key={r.record_id} style={{ background: '#fef2f2', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', marginBottom: '4px', textTransform: 'capitalize' }}>{r.penalty_type}</div>
                <div style={{ fontSize: '12px', color: '#7f1d1d' }}>Issued: {formatDate(r.issued_at)} · Appeal deadline: {r.appeal_deadline?.slice(0, 10) || '—'}</div>
              </div>
            ))}
          </div>
        )}

        {/* Record action form */}
        {!isClosed && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e7e5e4', padding: '24px 28px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1c1917' }}>🛠️ Record Action</h3>

            {error && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '6px' }}>Action taken <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  value={actionForm.action}
                  onChange={(e) => setActionForm((f) => ({ ...f, action: e.target.value }))}
                  placeholder="Describe the action taken…"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '6px' }}>Notes (optional)</label>
                <textarea
                  rows={2}
                  value={actionForm.notes}
                  onChange={(e) => setActionForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes…"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '6px' }}>Affected User ID <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  value={actionForm.affected_user_id}
                  onChange={(e) => setActionForm((f) => ({ ...f, affected_user_id: e.target.value }))}
                  placeholder="User UUID…"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '6px' }}>Penalty Type</label>
                  <select value={actionForm.penalty_type} onChange={(e) => setActionForm((f) => ({ ...f, penalty_type: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', background: '#fff' }}>
                    {PENALTY_OPTIONS.map((p) => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1917', marginBottom: '6px' }}>Update Status</label>
                  <select value={actionForm.update_status} onChange={(e) => setActionForm((f) => ({ ...f, update_status: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', background: '#fff' }}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_STYLES[s]?.label || s}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={handleSubmitAction}
                disabled={submitting}
                onMouseEnter={() => !submitting && setHovered('submit')}
                onMouseLeave={() => setHovered(null)}
                style={{ padding: '12px 24px', background: submitting ? '#e7e5e4' : (hovered === 'submit' ? '#145040' : '#1a5f4a'), color: submitting ? '#a8a29e' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: submitting ? 0.7 : 1, transition: 'all 0.2s' }}
              >
                {submitting ? 'Recording…' : 'Record Action & Issue Penalty'}
              </button>
            </div>
          </div>
        )}

        {isClosed && (
          <div style={{ background: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0', padding: '16px 24px', textAlign: 'center', color: '#166534', fontWeight: '600', fontSize: '14px' }}>
            This complaint is {complaint.status}. No further actions can be recorded.
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

// Route-level export: /admin/complaints renders list, /admin/complaints/:id renders detail
export { ComplaintsList, ComplaintDetail };
