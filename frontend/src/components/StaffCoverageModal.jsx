import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

const REASONS = [
  { value: 'leave', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

const SUPERVISOR_KEYS = new Set([
  'supervisor',
  'manager',
  'call centre supervisor',
  'external agent supervisor',
]);
const SENIOR_KEYS = new Set(['senior supervisor', 'tenant administrator']);

function roleKey(name) {
  return String(name || '').trim().toLowerCase();
}

function toLocalInputValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StaffCoverageModal({
  open,
  onClose,
  absentUser,
  users = [],
  isSaving,
  onSave,
}) {
  const [coveringUserId, setCoveringUserId] = useState('');
  const [reason, setReason] = useState('leave');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');

  const absentIsSenior = SENIOR_KEYS.has(roleKey(absentUser?.roleName));

  useEffect(() => {
    if (!open || !absentUser) return undefined;
    setCoveringUserId('');
    setReason('leave');
    setStartsAt(toLocalInputValue());
    setEndsAt('');
    setNotes('');
  }, [open, absentUser]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const coverOptions = useMemo(() => {
    if (!absentUser) return [];
    return users.filter((u) => {
      if (!u.isActive || Number(u.id) === Number(absentUser.id)) return false;
      const key = roleKey(u.roleName);
      if (absentIsSenior) {
        return SENIOR_KEYS.has(key) || Boolean(u.isSystemAdmin);
      }
      if (SUPERVISOR_KEYS.has(key)) {
        return (
          !absentUser.callCenterId ||
          !u.callCenterId ||
          Number(u.callCenterId) === Number(absentUser.callCenterId)
        );
      }
      return SENIOR_KEYS.has(key) || Boolean(u.isSystemAdmin);
    });
  }, [users, absentUser, absentIsSenior]);

  if (!open || !absentUser) return null;

  const handleSave = () => {
    if (!coveringUserId) return;
    onSave({
      absentUserId: absentUser.id,
      coveringUserId: Number(coveringUserId),
      reason,
      startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-coverage-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <CalendarClock className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="staff-coverage-modal-title" className="cf-title">Start leave coverage</h2>
              <p className="cf-subtitle">
                {absentUser.name} keeps their role. The covering user receives operational authority
                {absentIsSenior ? ' company-wide' : ' for their call center'} until coverage ends.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          <div className="af-field">
            <span className="af-label">Covering user</span>
            <select
              className="af-select"
              value={coveringUserId}
              onChange={(e) => setCoveringUserId(e.target.value)}
              disabled={isSaving}
            >
              <option value="">Select user…</option>
              {coverOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.roleName})
                </option>
              ))}
            </select>
          </div>

          <div className="af-field">
            <span className="af-label">Reason</span>
            <select
              className="af-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSaving}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="af-field">
              <span className="af-label">Starts</span>
              <input
                type="datetime-local"
                className="af-input"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="af-field">
              <span className="af-label">Ends (optional)</span>
              <input
                type="datetime-local"
                className="af-input"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="af-field">
            <span className="af-label">Notes</span>
            <textarea
              className="af-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSaving}
              placeholder="Optional context"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Acting coverage does not change payroll role. It only delegates operational authority
            (case assignment, approvals, notifications) for the coverage window.
          </p>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            loading={isSaving}
            loadingText="Starting…"
            disabled={!coveringUserId || isSaving}
            onClick={handleSave}
          >
            Start coverage
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default StaffCoverageModal;
