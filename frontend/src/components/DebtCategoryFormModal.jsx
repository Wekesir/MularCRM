import { useEffect, useRef } from 'react';
import { X, Layers, Pencil } from 'lucide-react';
import LoadingButton from './LoadingButton';

export const EMPTY_DEBT_CATEGORY_FORM = {
  name: '',
  code: '',
  description: '',
  isActive: true,
};

function DebtCategoryFormModal({ open, onClose, form, setForm, isSaving, onSave, isEditing = false }) {
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
        aria-labelledby="debt-cat-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing
                ? <Pencil className="cf-header-icon-svg" />
                : <Layers className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="debt-cat-modal-title" className="cf-title">
                {isEditing ? 'Edit Debt Category' : 'Add Debt Category'}
              </h2>
              <p className="cf-subtitle">
                Group debt portfolios into broad categories like loans or credit cards.
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
                Name <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={firstInputRef}
                type="text"
                className="cf-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Mobile loan"
                required
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">Code</span>
              <input
                type="text"
                className="cf-input"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="e.g. mobile_loan"
              />
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-label">Description</span>
            <input
              type="text"
              className="cf-input"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short description of this category"
            />
          </div>

          <div className="cf-field">
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
            {isEditing ? 'Save Changes' : 'Add Category'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default DebtCategoryFormModal;
