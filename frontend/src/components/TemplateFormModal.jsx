import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mail, MessageSquare, Building2, Eye } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { previewTemplate } from '../utils/templateRender';

export const EMPTY_TEMPLATE_FORM = {
  name: '',
  clientId: '',
  subject: '',
  body: '',
  alsoCreateCounterpart: false,
  counterpartSubject: '',
};

function TemplateFormModal({
  open,
  onClose,
  form,
  setForm,
  isSaving,
  onSave,
  isEditing = false,
  mode = 'email',
  clients = [],
  variables = [],
}) {
  const isEmail = mode === 'email';
  const firstInputRef = useRef(null);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastFieldRef = useRef('body');

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

  const insertVariable = (key) => {
    const token = `{{${key}}}`;
    const fieldRef = isEmail && lastFieldRef.current === 'subject' ? subjectRef : bodyRef;
    const el = fieldRef.current;
    const field = isEmail && lastFieldRef.current === 'subject' ? 'subject' : 'body';

    if (!el) {
      setForm((p) => ({ ...p, [field]: (p[field] || '') + token }));
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = (el.value.slice(0, start) + token + el.value.slice(end));
    setForm((p) => ({ ...p, [field]: next }));

    window.setTimeout(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const previewText = useMemo(() => {
    if (isEmail) {
      const subj = previewTemplate(form.subject || '', variables);
      const body = previewTemplate(form.body || '', variables);
      return { subject: subj, body };
    }
    return { subject: '', body: previewTemplate(form.body || '', variables) };
  }, [form.subject, form.body, variables, isEmail]);

  if (!open) return null;

  const bodyChars = (form.body || '').length;
  const selectedClient = clients.find((c) => String(c.id) === String(form.clientId));

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel cf-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEmail
                ? <Mail className="cf-header-icon-svg" />
                : <MessageSquare className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="tpl-modal-title" className="cf-title">
                {isEditing
                  ? `Edit ${isEmail ? 'Email' : 'SMS'} Template`
                  : `Add ${isEmail ? 'Email' : 'SMS'} Template`}
              </h2>
              <p className="cf-subtitle">
                {selectedClient
                  ? `For ${selectedClient.name}`
                  : 'System-wide — shared by all clients.'}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-row">
            <div className="cf-field">
              <span className="cf-label">
                <Building2 className="cf-label-icon" />
                Template Name <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={firstInputRef}
                type="text"
                className="cf-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Statement Reminder"
                required
              />
            </div>

            <div className="cf-field">
              <span className="cf-label">
                <Building2 className="cf-label-icon" />
                Client
              </span>
              <div className="cf-select-wrap">
                <select
                  className="cf-select"
                  value={form.clientId}
                  onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                >
                  <option value="">All Clients (System-wide)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {form.clientId === '' && (
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <Building2 className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">
                <strong>System-wide template.</strong> This format is shared across every client
                (e.g. login, onboarding, file-closure notices). It is not tied to a specific client.
              </p>
            </div>
          )}

          {isEmail && (
            <div className="cf-field">
              <span className="cf-label">
                Subject <span className="cf-required" aria-hidden="true">*</span>
              </span>
              <input
                ref={subjectRef}
                type="text"
                className="cf-input"
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                onFocus={() => { lastFieldRef.current = 'subject'; }}
                placeholder="e.g. Your outstanding balance of {{amount}} is due"
                required
              />
            </div>
          )}

          <div className="cf-field">
            <span className="cf-label">
              {isEmail ? 'Body' : 'Message'}
              <span className="cf-required" aria-hidden="true">*</span>
              {!isEmail && <span className="cf-counter">{bodyChars} chars</span>}
            </span>
            <textarea
              ref={bodyRef}
              className="cf-textarea"
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              onFocus={() => { lastFieldRef.current = 'body'; }}
              placeholder={
                isEmail
                  ? 'Dear {{name}}, your balance of KSh {{amount}} is due on {{due_date}}…'
                  : 'Hi {{name}}, your balance of KSh {{amount}} is due. Pay via *123#.'
              }
              rows={isEmail ? 5 : 4}
              required
            />
          </div>

          <div className="tvar-helper">
            <p className="tvar-helper-title">Insert variable</p>
            <div className="tvar-chips">
              {variables.length === 0 ? (
                <span className="tvar-chips-empty">No variables configured yet.</span>
              ) : (
                variables.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    className="tvar-chip"
                    onClick={() => insertVariable(v.key)}
                    title={v.description || `Insert {{${v.key}}}`}
                  >
                    {v.label}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="tvar-preview">
            <div className="tvar-preview-head">
              <Eye className="tvar-preview-icon" />
              <span className="tvar-preview-title">Live preview</span>
              <span className="tvar-preview-hint">using example values</span>
            </div>
            {isEmail && (
              <p className="tvar-preview-subject">{previewText.subject || '—'}</p>
            )}
            <p className="tvar-preview-body">{previewText.body || '—'}</p>
          </div>

          {!isEditing && (
            <div className="cf-counterpart">
              <label className="cf-check">
                <input
                  type="checkbox"
                  checked={form.alsoCreateCounterpart}
                  onChange={(e) => setForm((p) => ({ ...p, alsoCreateCounterpart: e.target.checked }))}
                />
                <span className="cf-check-text">
                  Also create an {isEmail ? 'SMS' : 'email'} template with the same message
                </span>
              </label>

              {!isEmail && form.alsoCreateCounterpart && (
                <div className="cf-field cf-counterpart-subject">
                  <span className="cf-label">
                    <Mail className="cf-label-icon" />
                    Email Subject <span className="cf-required" aria-hidden="true">*</span>
                  </span>
                  <input
                    type="text"
                    className="cf-input"
                    value={form.counterpartSubject}
                    onChange={(e) => setForm((p) => ({ ...p, counterpartSubject: e.target.value }))}
                    placeholder="e.g. Your outstanding balance of {{amount}} is due"
                  />
                  <p className="cf-counterpart-note">
                    The email version will use this subject and the same message body.
                  </p>
                </div>
              )}
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
            {isEditing
              ? 'Save Changes'
              : form.alsoCreateCounterpart
                ? `Add Email & SMS Templates`
                : `Add ${isEmail ? 'Email' : 'SMS'} Template`}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default TemplateFormModal;
