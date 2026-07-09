import { useEffect, useState } from 'react';
import { X, Archive } from 'lucide-react';
import LoadingButton from './LoadingButton';

export const DEFAULT_CLOSURE_REASONS = [
  'Fully Paid',
  'Client Withdrawal',
  'Write Off',
  'Duplicate File',
  'Settled',
  'Recalled by Client',
  'TEST FILES',
  'Other…',
];

function CloseCaseModal({ open, onClose, debtor, isSaving, onSave }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setReason('');
    setCustomReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open || !debtor) return null;

  const isOther = reason === 'Other…';
  const finalReason = isOther ? customReason.trim() : reason;
  const canSave = Boolean(finalReason);

  const handleSave = () => {
    if (!canSave) return;
    onSave(finalReason);
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-case-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Archive className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="close-case-modal-title" className="cf-title">Close Case</h2>
              <p className="cf-subtitle">
                Close {debtor.name}&apos;s case and move it to Closed Files.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-readonly-identity">
            <span className="cf-readonly-avatar" aria-hidden="true">
              <Archive className="cf-readonly-avatar-svg" />
            </span>
            <div className="cf-readonly-meta">
              <p className="cf-readonly-name">{debtor.name}</p>
              <p className="cf-readonly-email">CFID {debtor.cfid}</p>
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-label">
              Closure Reason <span className="cf-required" aria-hidden="true">*</span>
            </span>
            <select
              className="cf-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Select a reason…</option>
              {DEFAULT_CLOSURE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {isOther && (
            <div className="cf-field">
              <span className="cf-label">
                Specify Reason <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                type="text"
                className="cf-input"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="e.g. Recalled by client legal"
                maxLength={120}
                autoFocus
              />
            </div>
          )}

          <div className="cf-callout">
            <div className="cf-callout-icon" aria-hidden="true">
              <Archive className="cf-callout-icon-svg" />
            </div>
            <p className="cf-callout-text">
              Closed cases are excluded from the active Debtor Management list and appear on the
              Closed Files page. You can reopen a closed case later from its history.
            </p>
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            onClick={handleSave}
            loading={isSaving}
            loadingText="Closing…"
            disabled={!canSave}
          >
            Close Case
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default CloseCaseModal;
