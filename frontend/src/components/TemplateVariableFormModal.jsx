import { useEffect, useRef } from 'react';
import { X, Braces, Pencil } from 'lucide-react';
import LoadingButton from './LoadingButton';

export const EMPTY_VARIABLE_FORM = {
  key: '',
  label: '',
  description: '',
  exampleValue: '',
  category: '',
};

function TemplateVariableFormModal({ open, onClose, form, setForm, isSaving, onSave, isEditing = false }) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tvar-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing
                ? <Pencil className="cf-header-icon-svg" />
                : <Braces className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="tvar-modal-title" className="cf-title">
                {isEditing ? 'Edit Variable' : 'Add Template Variable'}
              </h2>
              <p className="cf-subtitle">
                Define a placeholder that templates can use as <code className="cf-code">{'{{key}}'}</code>.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Key <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={firstInputRef}
                type="text"
                className="cf-input"
                value={form.key}
                onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                placeholder="e.g. account_number"
                required
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">
                Label <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                type="text"
                className="cf-input"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Account Number"
                required
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
              placeholder="What this variable represents"
            />
          </div>

          <div className="cf-row">
            <div className="cf-field cf-field-half">
              <span className="cf-label">Example Value</span>
              <input
                type="text"
                className="cf-input"
                value={form.exampleValue}
                onChange={(e) => setForm((p) => ({ ...p, exampleValue: e.target.value }))}
                placeholder="e.g. ACC-8831"
              />
            </div>
            <div className="cf-field cf-field-half">
              <span className="cf-label">Category</span>
              <input
                type="text"
                className="cf-input"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Account"
              />
            </div>
          </div>

          <div className="cf-callout">
            <div className="cf-callout-icon" aria-hidden="true">
              <Braces className="cf-callout-icon-svg" />
            </div>
            <p className="cf-callout-text">
              Use this variable in any email or SMS template as{' '}
              <strong className="cf-code">{'{{'}{form.key || 'key'}{'}}'}</strong>. At send time the
              token is replaced with the recipient's actual value.
            </p>
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
            {isEditing ? 'Save Changes' : 'Add Variable'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default TemplateVariableFormModal;
