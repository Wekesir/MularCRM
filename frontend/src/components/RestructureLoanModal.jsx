import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { buildSchedulePreview } from '../api/loanRestructures';
import { useSystemConfig } from '../context/SystemConfigContext';

function formatMoney(value, symbol = '') {
  const n = Number(value) || 0;
  const prefix = symbol ? `${symbol} ` : '';
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function RestructureLoanModal({ open, onClose, debtor, isSaving, onSave }) {
  const { currencySymbol } = useSystemConfig();
  const symbol = debtor?.currencySymbol || currencySymbol || '';

  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState('3');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setInstallmentAmount(
      debtor?.installmentAmount != null ? String(debtor.installmentAmount) : ''
    );
    setInstallmentCount('3');
    setFirstDueDate('');
    setNotes('');
  }, [open, debtor?.installmentAmount]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const preview = useMemo(
    () =>
      buildSchedulePreview({
        installmentAmount,
        installmentCount,
        firstDueDate,
      }),
    [installmentAmount, installmentCount, firstDueDate]
  );

  const outstanding = Number(debtor?.outstandingBalance) || 0;
  const totalDiffers =
    preview.totalPlanAmount > 0 &&
    outstanding > 0 &&
    Math.abs(preview.totalPlanAmount - outstanding) > 0.01;

  const canSave =
    Number(installmentAmount) > 0 &&
    Math.floor(Number(installmentCount)) >= 1 &&
    Boolean(firstDueDate);

  if (!open || !debtor) return null;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      debtorId: debtor.id,
      installmentAmount: Number(installmentAmount),
      installmentCount: Math.floor(Number(installmentCount)),
      firstDueDate,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel modal-lg cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restructure-loan-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <CalendarRange className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="restructure-loan-title" className="cf-title">
                Restructure loan
              </h2>
              <p className="cf-subtitle">
                Propose a new repayment plan for <strong>{debtor.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={isSaving}
          >
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          <div className="mp-ptp-grid">
            <div className="af-field">
              <span className="af-label">Outstanding balance</span>
              <p className="text-sm text-foreground font-medium">
                {formatMoney(outstanding, symbol)}
              </p>
            </div>
            <div className="af-field">
              <span className="af-label">Current installment</span>
              <p className="text-sm text-muted-foreground">
                {debtor.installmentAmount != null
                  ? formatMoney(debtor.installmentAmount, symbol)
                  : '—'}
              </p>
            </div>
          </div>

          <div className="mp-ptp-section">
            <div className="mp-ptp-section-header">
              <CalendarRange className="icon-sm" />
              <span>New repayment terms</span>
            </div>
            <div className="mp-ptp-grid">
              <div className="af-field">
                <span className="af-label">
                  Installment amount <span style={{ color: 'var(--color-red-500, #ef4444)' }}>*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="af-input"
                  value={installmentAmount}
                  onChange={(e) => setInstallmentAmount(e.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="af-field">
                <span className="af-label">
                  Number of installments{' '}
                  <span style={{ color: 'var(--color-red-500, #ef4444)' }}>*</span>
                </span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  className="af-input"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="af-field">
                <span className="af-label">
                  First due date <span style={{ color: 'var(--color-red-500, #ef4444)' }}>*</span>
                </span>
                <input
                  type="date"
                  className="af-input"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>
            </div>
            <p className="mp-ptp-hint">
              Schedule is generated monthly from the first due date. A supervisor must approve before
              the plan takes effect. Pending PTPs will be cancelled on approval.
            </p>
          </div>

          <div className="af-field">
            <span className="af-label">Notes</span>
            <textarea
              className="af-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for your supervisor…"
              disabled={isSaving}
            />
          </div>

          {preview.schedule.length > 0 && (
            <div className="rl-schedule-preview">
              <div className="rl-schedule-preview-header">
                <span>Schedule preview</span>
                <strong>{formatMoney(preview.totalPlanAmount, symbol)} total</strong>
              </div>
              {totalDiffers && (
                <p className="rl-schedule-warning" role="status">
                  Plan total differs from outstanding balance (
                  {formatMoney(outstanding, symbol)}).
                </p>
              )}
              <div className="rl-schedule-table-wrap">
                <table className="rl-schedule-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due date</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.schedule.map((row) => (
                      <tr key={row.sequence}>
                        <td>{row.sequence}</td>
                        <td>{formatDate(row.dueDate)}</td>
                        <td>{formatMoney(row.amount, symbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            loadingText="Submitting…"
            disabled={!canSave}
            onClick={handleSave}
          >
            Submit for approval
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default RestructureLoanModal;
