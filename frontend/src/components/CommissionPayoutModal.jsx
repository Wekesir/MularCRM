import { useEffect, useRef, useState } from 'react';
import { X, HandCoins, Calendar, FileText } from 'lucide-react';
import LoadingButton from './LoadingButton';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function CommissionPayoutModal({ open, onClose, target, currencySymbol, onConfirm, isSaving }) {
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [reference, setReference] = useState('');
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setAmount('');
    setPaidDate(new Date().toISOString().slice(0, 10));
    setReference('');
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open || !target) return null;

  const outstanding = Number(target.outstanding) || 0;

  const handleSave = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    onConfirm({
      clientId: target.clientId,
      amount: amt,
      paidDate,
      reference: reference.trim() || undefined,
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <HandCoins className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="payout-modal-title" className="cf-title">Record Commission Payout</h2>
              <p className="cf-subtitle">
                {target.clientName}
                {target.debtCategoryName && target.debtCategoryName !== 'All categories'
                  ? ` · ${target.debtCategoryName}`
                  : ''}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-callout">
            <div className="cf-callout-icon" aria-hidden="true">
              <HandCoins className="cf-callout-icon-svg" />
            </div>
            <p className="cf-callout-text">
              Outstanding commission for this client is{' '}
              <strong>{currencySymbol} {(outstanding).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>.
              The payout is applied FIFO to the oldest unpaid earnings.
            </p>
          </div>

          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Amount <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={firstInputRef}
                type="number"
                step="0.01"
                min="0"
                className="cf-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50000"
                required
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">Paid Date</span>
              <input
                type="date"
                className="cf-input"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-label">Reference</span>
            <input
              type="text"
              className="cf-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Mpesa / bank reference (optional)"
              maxLength={120}
            />
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
            loadingText="Recording…"
          >
            Record Payout
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default CommissionPayoutModal;
