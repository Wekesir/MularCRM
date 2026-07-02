import { useEffect, useRef } from 'react';
import {
  X,
  UserPlus,
  UserCog,
  Building2,
  Phone,
  Mail,
  Briefcase,
} from 'lucide-react';
import LoadingButton from './LoadingButton';
import { BUSINESS_TYPES } from '../pages/management/clientConstants';

function FieldGroup({ label, required, icon: Icon, children, half = false }) {
  return (
    <div className={half ? 'cf-field cf-field-half' : 'cf-field'}>
      <span className="cf-label">
        {Icon && <Icon className="cf-label-icon" aria-hidden="true" />}
        {label}
        {required && <span className="cf-required" aria-hidden="true">*</span>}
      </span>
      {children}
    </div>
  );
}

function ClientFormModal({ open, onClose, form, setForm, isSaving, onSave, isEditing = false }) {
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
        aria-labelledby="client-modal-title"
      >
        {/* ── Decorative top accent strip ── */}
        <div className="cf-accent-strip" aria-hidden="true" />

        {/* ── Header ── */}
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing
                ? <UserCog className="cf-header-icon-svg" />
                : <UserPlus className="cf-header-icon-svg" />}
            </div>
            <div>
              <h2 id="client-modal-title" className="cf-title">
                {isEditing ? 'Edit Client' : 'Add New Client'}
              </h2>
              <p className="cf-subtitle">
                {isEditing
                  ? "Update the client\u2019s profile and contact details."
                  : 'Onboard a portfolio owner to start managing their collections.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="modal-close-icon" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="cf-body">

          {/* Client Name */}
          <FieldGroup label="Client Name" required icon={Building2}>
            <input
              ref={firstInputRef}
              type="text"
              className="cf-input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Acme Bank Ltd."
              required
            />
          </FieldGroup>

          {/* Type of Business */}
          <FieldGroup label="Type of Business" required icon={Briefcase}>
            <div className="cf-select-wrap">
              <select
                className="cf-select"
                value={form.businessType}
                onChange={(e) => setForm((p) => ({ ...p, businessType: e.target.value }))}
                required
              >
                <option value="" disabled>Select the type of business…</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </FieldGroup>

          {/* Phone + Email — two-column row */}
          <div className="cf-row">
            <FieldGroup label="Phone Number" required icon={Phone} half>
              <div className="cf-input-icon-wrap">
                <span className="cf-input-prefix">+</span>
                <input
                  type="tel"
                  className="cf-input cf-input-with-prefix"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="254710595755"
                  required
                />
              </div>
            </FieldGroup>

            <FieldGroup label="Email Address" required icon={Mail} half>
              <input
                type="email"
                className="cf-input"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="kenwekesir@gmail.com"
                required
              />
            </FieldGroup>
          </div>

          {/* Info callout */}
          <div className="cf-callout">
            <div className="cf-callout-icon" aria-hidden="true">
              <Building2 className="cf-callout-icon-svg" />
            </div>
            <p className="cf-callout-text">
              Clients are businesses whose <strong>loan portfolios</strong> you collect on their
              behalf. Choose the business type that best describes this client so you can apply the
              right collection strategies.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
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
            {isEditing ? 'Save Changes' : 'Add Client'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default ClientFormModal;
