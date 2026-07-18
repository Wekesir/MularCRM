import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Mail, MessageSquare, Phone, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

const CHANNELS = [
  { value: 'call',  label: 'Call',  Icon: Phone },
  { value: 'sms',   label: 'SMS',   Icon: MessageSquare },
  { value: 'email', label: 'Email', Icon: Mail },
];

function PortfolioResponseModal({
  open,
  onClose,
  debtor,
  contactStatuses = [],
  defaultChannel = 'call',
  isSaving,
  onSave,
}) {
  const [channel, setChannel] = useState(defaultChannel);
  const [contactStatusId, setContactStatusId] = useState('');
  const [notes, setNotes] = useState('');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  const selectedStatus = useMemo(
    () => contactStatuses.find((s) => String(s.id) === String(contactStatusId)) || null,
    [contactStatuses, contactStatusId]
  );
  const isPtp = String(selectedStatus?.code || '').toUpperCase() === 'PTP';

  useEffect(() => {
    if (!open) return undefined;
    setChannel(defaultChannel || 'call');
    setContactStatusId('');
    setNotes('');
    setPromisedAmount(
      debtor?.installmentAmount != null ? String(debtor.installmentAmount) : ''
    );
    setPromiseDate('');
    setReminderDate('');
    setNextActionDate('');
  }, [open, defaultChannel, debtor?.installmentAmount]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !isSaving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open || !debtor) return null;

  const canSave = Boolean(contactStatusId) && (!isPtp || Boolean(reminderDate));

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      channel,
      contactStatusId: Number(contactStatusId),
      notes: notes.trim() || undefined,
    };
    if (isPtp) {
      payload.ptp = {
        promisedAmount: promisedAmount === '' ? 0 : Number(promisedAmount),
        promiseDate: promiseDate || undefined,
        reminderDate,
        notes: notes.trim() || undefined,
      };
    } else if (nextActionDate) {
      payload.nextActionDate = nextActionDate;
    }
    onSave(payload);
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div className="modal-panel modal-lg cf-panel" role="dialog" aria-modal="true" aria-labelledby="portfolio-response-title">
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <ClipboardList className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="portfolio-response-title" className="cf-title">Log Response</h2>
              <p className="cf-subtitle">Record the outcome for <strong>{debtor.name}</strong></p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          {/* Channel segmented control */}
          <div className="af-field">
            <span className="af-label">Communication channel</span>
            <div className="mp-channel-seg">
              {CHANNELS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`mp-channel-seg-btn mp-channel-seg-btn--${value}${channel === value ? ' is-active' : ''}`}
                  onClick={() => setChannel(value)}
                  disabled={isSaving}
                >
                  <Icon className="icon-sm" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Response/status */}
          <div className="af-field">
            <span className="af-label">Response / Contact status</span>
            <select
              className="af-select"
              value={contactStatusId}
              onChange={(e) => setContactStatusId(e.target.value)}
              disabled={isSaving}
            >
              <option value="">Select a response…</option>
              {contactStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.code ? ` (${s.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="af-field">
            <span className="af-label">Notes</span>
            <textarea
              className="af-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes from the conversation…"
              disabled={isSaving}
            />
          </div>

          {/* PTP section */}
          {isPtp ? (
            <div className="mp-ptp-section">
              <div className="mp-ptp-section-header">
                <CalendarClock className="icon-sm" />
                <span>Promise to Pay details</span>
              </div>
              <div className="mp-ptp-grid">
                <div className="af-field">
                  <span className="af-label">Promised amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="af-input"
                    value={promisedAmount}
                    onChange={(e) => setPromisedAmount(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="af-field">
                  <span className="af-label">Promise date</span>
                  <input
                    type="date"
                    className="af-input"
                    value={promiseDate}
                    onChange={(e) => setPromiseDate(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="af-field">
                  <span className="af-label">Reminder date <span style={{ color: 'var(--color-red-500, #ef4444)' }}>*</span></span>
                  <input
                    type="date"
                    className="af-input"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>
              <p className="mp-ptp-hint">
                A follow-up reminder will be saved under <strong>Payments → PTP</strong>.
              </p>
            </div>
          ) : (
            <div className="af-field">
              <span className="af-label">Next action / callback date</span>
              <input
                type="date"
                className="af-input"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                disabled={isSaving}
              />
            </div>
          )}
        </div>

        <div className="cf-footer">
          <button type="button" className="btn-icon-outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="btn-primary btn-sm"
            loading={isSaving}
            loadingText="Saving…"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save Response
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default PortfolioResponseModal;
