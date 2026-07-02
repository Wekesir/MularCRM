import { useEffect, useRef } from 'react';
import { X, UserPlus, UserCog } from 'lucide-react';
import LoadingButton from './LoadingButton';
import PermissionMatrix from '../pages/system-config/PermissionMatrix';

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
}) {
  const firstInputRef = useRef(null);

  const isEditing = Boolean(form.id);
  const selectedRole = roles.find((r) => r.id === Number(form.roleId));

  /* Focus first field when modal opens */
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    await onSave();
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel modal-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon" aria-hidden="true">
              {isEditing
                ? <UserCog className="modal-header-icon-svg" />
                : <UserPlus className="modal-header-icon-svg" />}
            </span>
            <h2 id="user-modal-title" className="modal-title">
              {isEditing ? 'Edit User' : 'New User'}
            </h2>
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
        <div className="modal-body">
          <div className="config-form">

            <div className="modal-form-row">
              <label>
                Full Name <span className="modal-required" aria-hidden="true">*</span>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Jane Mwangi"
                  required
                />
              </label>
              <label>
                Email <span className="modal-required" aria-hidden="true">*</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="kenwekesir@gmail.com"
                  required
                />
              </label>
            </div>

            <div className="modal-form-row">
              <label>
                Phone <span className="modal-optional">(optional — for SMS OTP)</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="254710595755"
                />
              </label>
              <label>
                Role <span className="modal-required" aria-hidden="true">*</span>
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isEditing ? (
              <label>
                New password <span className="modal-optional">(leave blank to keep current)</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current"
                />
              </label>
            ) : (
              <p className="modal-info-note">
                A secure temporary password will be generated automatically and emailed to the user.
                They will be prompted to set their own password on first login.
              </p>
            )}

            <div className="modal-checkboxes">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                Active account
              </label>

              {!selectedRole?.isSystemAdmin && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
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
                  Customize permissions (override role defaults)
                </label>
              )}
            </div>

            {selectedRole?.isSystemAdmin && (
              <p className="config-hint">
                Users with the System Admin role inherit full access automatically.
              </p>
            )}

            {form.customizePermissions && !selectedRole?.isSystemAdmin && registry.length > 0 && (
              <PermissionMatrix
                registry={registry}
                permissions={form.permissionOverrides}
                onChange={(permissionOverrides) =>
                  setForm((p) => ({ ...p, permissionOverrides }))
                }
              />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="btn-primary"
            onClick={handleSave}
            loading={isSaving}
            loadingText={isEditing ? 'Updating...' : 'Creating...'}
          >
            {isEditing ? 'Update User' : 'Create User'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default UserFormModal;
