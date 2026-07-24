import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

const REASONS = [
  { value: 'leave', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

function toLocalInputValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function AgentCoverageModal({
  open,
  onClose,
  absentAgent,
  agents = [],
  portfolioCount = null,
  isSaving,
  onSave,
}) {
  const [coveringAgentUserId, setCoveringAgentUserId] = useState('');
  const [reason, setReason] = useState('leave');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !absentAgent) return undefined;
    setCoveringAgentUserId('');
    setReason('leave');
    setStartsAt(toLocalInputValue());
    setEndsAt('');
    setNotes('');
  }, [open, absentAgent]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const coverOptions = useMemo(() => {
    if (!absentAgent) return [];
    return agents.filter(
      (a) => a.isActive && Number(a.id) !== Number(absentAgent.id)
        && (!absentAgent.callCenterId || !a.callCenterId
          || Number(a.callCenterId) === Number(absentAgent.callCenterId))
    );
  }, [agents, absentAgent]);

  if (!open || !absentAgent) return null;

  const handleSave = () => {
    if (!coveringAgentUserId) return;
    onSave({
      absentAgentUserId: absentAgent.id,
      coveringAgentUserId: Number(coveringAgentUserId),
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
        aria-labelledby="agent-coverage-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <CalendarClock className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="agent-coverage-modal-title" className="cf-title">Start leave coverage</h2>
              <p className="cf-subtitle">
                Cases stay assigned to {absentAgent.name}. The covering agent can work the portfolio until coverage ends.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          {portfolioCount != null && (
            <p className="text-sm text-muted-foreground">
              Open portfolio: <strong className="text-foreground">{portfolioCount.debtorCount}</strong> case
              {portfolioCount.debtorCount === 1 ? '' : 's'} across{' '}
              <strong className="text-foreground">{portfolioCount.fileCount}</strong> file
              {portfolioCount.fileCount === 1 ? '' : 's'}.
            </p>
          )}

          <div className="af-field">
            <span className="af-label">Covering agent</span>
            <select
              className="af-select"
              value={coveringAgentUserId}
              onChange={(e) => setCoveringAgentUserId(e.target.value)}
              disabled={isSaving}
            >
              <option value="">Select agent…</option>
              {coverOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
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
              placeholder="Optional context for supervisors"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Activity (PTP, notes, dialer) attributes to the covering agent for ops. Commission stays with the portfolio owner ({absentAgent.name}) during leave.
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
            disabled={!coveringAgentUserId || isSaving}
            onClick={handleSave}
          >
            Start coverage
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default AgentCoverageModal;
