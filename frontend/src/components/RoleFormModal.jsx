import { useEffect, useRef } from 'react';
import { X, ShieldPlus, Shield, ShieldCheck, Tag } from 'lucide-react';
import LoadingButton from './LoadingButton';
import PermissionMatrix from '../pages/system-config/PermissionMatrix';

function RoleFormModal({
  open,
  onClose,
  form,
  setForm,
  registry,
  isSystemAdmin = false,
  isEditing = false,
  isSaving = false,
  onSave,
}) {
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, isSaving]);

  if (!open) return null;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel rf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              {isEditing ? (
                <Shield className="cf-header-icon-svg" />
              ) : (
                <ShieldPlus className="cf-header-icon-svg" />
              )}
            </div>
            <div>
              <h2 id="role-modal-title" className="cf-title">
                {isEditing ? 'Edit Role' : 'New Role'}
              </h2>
              <p className="cf-subtitle">
                {isEditing
                  ? 'Update the role name and module permissions.'
                  : 'Name this role and set module permissions for users assigned to it.'}
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

        <div className="cf-body rf-body">
          <div className="cf-field rf-name-field">
            <span className="cf-label">
              <Tag className="cf-label-icon" aria-hidden="true" />
              Role Name
              <span className="cf-required" aria-hidden="true">*</span>
            </span>
            <input
              ref={nameInputRef}
              type="text"
              className="cf-input"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Collections Supervisor"
              required
            />
          </div>

          {isSystemAdmin ? (
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <ShieldCheck className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">
                System Admin has <strong>full access</strong> to all modules, submodules, and CRUD
                actions. Permissions cannot be customized for this role.
              </p>
            </div>
          ) : (
            registry.length > 0 && (
              <div className="rf-matrix-wrap">
                <PermissionMatrix
                  registry={registry}
                  permissions={form.permissions}
                  onChange={(permissions) => setForm((prev) => ({ ...prev, permissions }))}
                />
              </div>
            )
          )}
        </div>

        <div className="cf-footer">
          <button
            type="button"
            className="cf-btn-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            onClick={onSave}
            loading={isSaving}
            loadingText={isEditing ? 'Updating…' : 'Creating…'}
          >
            {isEditing ? 'Update Role' : 'Create Role'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default RoleFormModal;
