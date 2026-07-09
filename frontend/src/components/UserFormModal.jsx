import { useEffect, useRef } from 'react';
import {
  X,
  UserPlus,
  UserCog,
  User,
  Mail,
  Phone,
  KeyRound,
  Briefcase,
  Shield,
  ShieldCheck,
  ArchiveRestore,
} from 'lucide-react';
import LoadingButton from './LoadingButton';
import PermissionMatrix from '../pages/system-config/PermissionMatrix';

/* ── Field group helper ── */
function FieldGroup({ label, required, icon: Icon, hint, children }) {
  return (
    <div className="cf-field">
      <span className="cf-label">
        {Icon && <Icon className="cf-label-icon" aria-hidden="true" />}
        {label}
        {required && <span className="cf-required" aria-hidden="true">*</span>}
        {hint && <span className="uf-field-hint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/* ── Section divider ── */
function SectionDivider({ icon: Icon, label }) {
  return (
    <div className="uf-section-divider">
      <span className="uf-section-divider-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="uf-section-divider-label">{label}</span>
      <span className="uf-section-divider-line" />
    </div>
  );
}

/* ── Toggle card ── */
function ToggleCard({ title, description, checked, onChange }) {
  return (
    <label className="uf-toggle-label">
      <div className="uf-toggle-text">
        <span className="uf-toggle-title">{title}</span>
        <span className="uf-toggle-desc">{description}</span>
      </div>
      <div className="uf-toggle-switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="uf-toggle-track" aria-hidden="true" />
        <span className="uf-toggle-thumb" aria-hidden="true" />
      </div>
    </label>
  );
}

function UserFormModal({
  open,
  onClose,
  form,
  setForm,
  roles,
  registry,
  isSaving,
  onSave,
  buildEmptyPermissions,
  duplicateDeleted,
  onRestoreDuplicate,
  onViewDeletedUsers,
}) {
  const firstInputRef = useRef(null);
  const isEditing = Boolean(form.id);
  const selectedRole = roles.find((r) => r.id === Number(form.roleId));

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
        className="modal-panel uf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
      >
        {/* ── Accent strip ── */}
        <div className="cf-accent-strip" aria-hidden="true" />

        {/* ── Header ── */}
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing ? (
                <UserCog className="cf-header-icon-svg" />
              ) : (
                <UserPlus className="cf-header-icon-svg" />
              )}
            </div>
            <div>
              <h2 id="user-modal-title" className="cf-title">
                {isEditing ? 'Edit User' : 'New User'}
              </h2>
              <p className="cf-subtitle">
                {isEditing
                  ? "Update this user's profile and access settings."
                  : 'Create a new system user and assign their role and permissions.'}
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

          {/* Duplicate soft-deleted user banner */}
          {duplicateDeleted && (
            <div className="uf-restore-banner" role="alert">
              <div className="uf-restore-banner-header">
                <div className="uf-restore-banner-icon" aria-hidden="true">
                  <ArchiveRestore size={16} />
                </div>
                <div className="uf-restore-banner-body">
                  <p className="uf-restore-banner-title">
                    This email belongs to a deleted user
                    {duplicateDeleted.deletedName ? ` — ${duplicateDeleted.deletedName}` : ''}.
                  </p>
                  <p className="uf-restore-banner-text">
                    Restore them to reactivate their account with all previous role assignments and
                    settings preserved.
                  </p>
                </div>
              </div>
              <div className="uf-restore-banner-actions">
                <LoadingButton
                  className="cf-btn-save"
                  onClick={onRestoreDuplicate}
                  loading={isSaving}
                  loadingText="Restoring…"
                  style={{ height: '2.125rem', padding: '0 1rem', fontSize: '0.8125rem' }}
                >
                  Restore now
                </LoadingButton>
                <button
                  type="button"
                  className="cf-btn-cancel"
                  onClick={onViewDeletedUsers}
                  disabled={isSaving}
                  style={{ height: '2.125rem', padding: '0 1rem', fontSize: '0.8125rem' }}
                >
                  View deleted users
                </button>
              </div>
            </div>
          )}

          {/* ── Profile section ── */}
          <SectionDivider icon={User} label="Profile" />

          {/* Name + Email */}
          <div className="cf-row">
            <FieldGroup label="Full Name" required icon={User}>
              <input
                ref={firstInputRef}
                type="text"
                className="cf-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Jane Mwangi"
                required
              />
            </FieldGroup>
            <FieldGroup label="Email Address" required icon={Mail}>
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

          {/* Phone + Password (edit) | Phone alone + callout (create) */}
          {isEditing ? (
            <div className="cf-row">
              <FieldGroup label="Phone" icon={Phone} hint="Optional">
                <input
                  type="tel"
                  className="cf-input"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="254710595755"
                />
              </FieldGroup>
              <FieldGroup label="New Password" icon={KeyRound} hint="Leave blank to keep current">
                <input
                  type="password"
                  className="cf-input"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Enter new password…"
                />
              </FieldGroup>
            </div>
          ) : (
            <>
              <FieldGroup label="Phone" icon={Phone} hint="Optional — for SMS OTP">
                <input
                  type="tel"
                  className="cf-input"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="254710595755"
                />
              </FieldGroup>
              <div className="cf-callout">
                <div className="cf-callout-icon" aria-hidden="true">
                  <KeyRound className="cf-callout-icon-svg" />
                </div>
                <p className="cf-callout-text">
                  A <strong>secure temporary password</strong> will be auto-generated and emailed
                  to this user. They will be prompted to set their own password on first login.
                </p>
              </div>
            </>
          )}

          {/* ── Access & Permissions section ── */}
          <SectionDivider icon={Shield} label="Access & Permissions" />

          {/* Role */}
          <FieldGroup label="Role" required icon={Briefcase}>
            <div className="cf-select-wrap">
              <select
                className="cf-select"
                value={form.roleId}
                onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </FieldGroup>

          {/* Active account toggle */}
          <ToggleCard
            title="Active account"
            description="Allow this user to sign in to the platform"
            checked={form.isActive}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
          />

          {/* System admin note */}
          {selectedRole?.isSystemAdmin && (
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <ShieldCheck className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">
                System Admin users inherit <strong>full platform access</strong> automatically —
                no custom permission overrides are needed for this role.
              </p>
            </div>
          )}

          {/* Customize permissions toggle */}
          {!selectedRole?.isSystemAdmin && (
            <ToggleCard
              title="Custom permissions"
              description="Override the default permissions granted by this user's role"
              checked={form.customizePermissions}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  customizePermissions: e.target.checked,
                  permissionOverrides:
                    p.permissionOverrides || buildEmptyPermissions(registry),
                }))
              }
            />
          )}

          {/* Permission matrix */}
          {form.customizePermissions && !selectedRole?.isSystemAdmin && registry.length > 0 && (
            <div className="uf-perm-matrix-wrap">
              <PermissionMatrix
                registry={registry}
                permissions={form.permissionOverrides}
                onChange={(permissionOverrides) =>
                  setForm((p) => ({ ...p, permissionOverrides }))
                }
              />
            </div>
          )}
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
            loadingText={isEditing ? 'Saving…' : 'Creating…'}
          >
            {isEditing ? 'Save Changes' : 'Create User'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default UserFormModal;
