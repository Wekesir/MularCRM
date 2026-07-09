import { useEffect, useRef } from 'react';
import { X, Percent, Pencil } from 'lucide-react';
import LoadingButton from './LoadingButton';

export const EMPTY_COMMISSION_RATE_FORM = {
  clientId: '',
  debtCategoryId: '',
  rate: '',
  currencyId: '',
  isActive: true,
  notes: '',
};

function CommissionRateFormModal({
  open,
  onClose,
  form,
  setForm,
  isSaving,
  onSave,
  isEditing = false,
  clients = [],
  debtCategories = [],
  currencies = [],
}) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
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

  if (!open) return null;

  const ratePercent = (() => {
    const n = Number(form.rate);
    return Number.isFinite(n) ? (n * 100).toFixed(n * 100 >= 1 ? 0 : 2) : '';
  })();

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-rate-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing
                ? <Pencil className="cf-header-icon-svg" />
                : <Percent className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="commission-rate-modal-title" className="cf-title">
                {isEditing ? 'Edit Commission Rate' : 'Add Commission Rate'}
              </h2>
              <p className="cf-subtitle">
                Negotiated commission the business earns from a client for a debt category.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Client <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <select
                ref={firstInputRef}
                className="cf-select"
                value={form.clientId}
                onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                required
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">Debt Category</span>
              <select
                className="cf-select"
                value={form.debtCategoryId}
                onChange={(e) => setForm((p) => ({ ...p, debtCategoryId: e.target.value }))}
              >
                <option value="">All categories (client default)</option>
                {debtCategories.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Rate <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                max="1"
                className="cf-input"
                value={form.rate}
                onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                placeholder="e.g. 0.10 (10%)"
                required
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">Currency</span>
              <select
                className="cf-select"
                value={form.currencyId}
                onChange={(e) => setForm((p) => ({ ...p, currencyId: e.target.value }))}
              >
                <option value="">Platform default</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {ratePercent !== '' && (
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <Percent className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">
                This rate earns <strong>{ratePercent}%</strong> of every amount collected from this
                client{form.debtCategoryId ? "'s " : "'s "}{form.debtCategoryId ? 'debtors in this category' : 'debtors (all categories not overridden)'}.
              </p>
            </div>
          )}

          <div className="cf-field">
            <span className="cf-label">Notes</span>
            <input
              type="text"
              className="cf-input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Contract reference or effective date (optional)"
              maxLength={255}
            />
          </div>

          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">Status</span>
              <select
                className="cf-select"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            onClick={onSave}
            loading={isSaving}
            loadingText="Saving…"
          >
            {isEditing ? 'Save Changes' : 'Add Rate'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default CommissionRateFormModal;
