import { useEffect, useRef } from 'react';
import { X, Coins, Pencil } from 'lucide-react';
import LoadingButton from './LoadingButton';

export const EMPTY_CURRENCY_FORM = {
  code: '',
  name: '',
  symbol: '',
  isActive: true,
  isDefault: false,
};

function CurrencyFormModal({ open, onClose, form, setForm, isSaving, onSave, isEditing = false }) {
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

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="currency-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing
                ? <Pencil className="cf-header-icon-svg" />
                : <Coins className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="currency-modal-title" className="cf-title">
                {isEditing ? 'Edit Currency' : 'Add Currency'}
              </h2>
              <p className="cf-subtitle">
                Currencies available for tagging debtors and reporting balances.
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
                Code <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={firstInputRef}
                type="text"
                className="cf-input"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. KES"
                maxLength={8}
                required
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Symbol <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                type="text"
                className="cf-input"
                value={form.symbol}
                onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))}
                placeholder="e.g. KSh"
                maxLength={8}
                required
              />
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-label">
              Name <span className="cf-required" aria-hidden="true">*</span>
            </span>
            <input
              type="text"
              className="cf-input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Kenyan Shillings"
              required
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
            <div className="cf-field cf-field-half">
              <span className="cf-label">Default Currency</span>
              <select
                className="cf-select"
                value={form.isDefault ? 'yes' : 'no'}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.value === 'yes' }))}
              >
                <option value="no">No</option>
                <option value="yes">Yes — use platform-wide</option>
              </select>
            </div>
          </div>

          {form.isDefault && (
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <Coins className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">
                Setting this as default will clear the default flag on all other currencies.
              </p>
            </div>
          )}
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
            {isEditing ? 'Save Changes' : 'Add Currency'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default CurrencyFormModal;
