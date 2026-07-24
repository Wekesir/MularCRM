import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

const SUPERVISOR_KEYS = new Set([
  'supervisor',
  'manager',
  'call centre supervisor',
  'external agent supervisor',
]);
const SENIOR_KEYS = new Set(['senior supervisor', 'tenant administrator']);

function roleKey(name) {
  return String(name || '').trim().toLowerCase();
}

function StaffHandoffModal({
  open,
  onClose,
  fromUser,
  users = [],
  succession = null,
  isSaving,
  onSave,
}) {
  const [mode, setMode] = useState('succeed');
  const [toUserId, setToUserId] = useState('');

  const fromIsSenior = SENIOR_KEYS.has(roleKey(fromUser?.roleName));

  useEffect(() => {
    if (!open || !fromUser) return undefined;
    setMode('succeed');
    setToUserId('');
  }, [open, fromUser]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const successorOptions = useMemo(() => {
    if (!fromUser) return [];
    return users.filter((u) => {
      if (!u.isActive || Number(u.id) === Number(fromUser.id)) return false;
      const key = roleKey(u.roleName);
      if (fromIsSenior) {
        return SENIOR_KEYS.has(key) || Boolean(u.isSystemAdmin);
      }
      return SUPERVISOR_KEYS.has(key);
    });
  }, [users, fromUser, fromIsSenior]);

  if (!open || !fromUser) return null;

  const canRelease = succession?.canDeactivateSafely;
  const canSubmit = mode === 'release' ? canRelease : Boolean(toUserId);

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-handoff-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <ArrowRightLeft className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="staff-handoff-modal-title" className="cf-title">Handoff succession</h2>
              <p className="cf-subtitle">
                Ensure operational continuity before offboarding {fromUser.name}.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          {succession?.roleBucket === 'supervisor' && (
            <p className="text-sm text-muted-foreground">
              Call center: <strong className="text-foreground">{succession.callCenterName || '—'}</strong>
              {' · '}
              Other active supervisors:{' '}
              <strong className="text-foreground">{succession.remainingSuccessors ?? 0}</strong>
            </p>
          )}
          {succession?.roleBucket === 'senior_supervisor' && (
            <p className="text-sm text-muted-foreground">
              Other Senior Supervisors:{' '}
              <strong className="text-foreground">{succession.remainingSeniors ?? 0}</strong>
              {' · '}
              System Admins:{' '}
              <strong className="text-foreground">{succession.remainingAdmins ?? 0}</strong>
            </p>
          )}

          <div className="af-field">
            <span className="af-label">Handoff mode</span>
            <select
              className="af-select"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isSaving}
            >
              <option value="succeed">Appoint successor</option>
              <option value="release" disabled={!canRelease}>
                Release without successor (others remain)
              </option>
            </select>
          </div>

          {mode === 'succeed' && (
            <div className="af-field">
              <span className="af-label">Successor</span>
              <select
                className="af-select"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                disabled={isSaving}
              >
                <option value="">Select successor…</option>
                {successorOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.roleName})
                    {!fromIsSenior && u.callCenterId && fromUser.callCenterId
                      && Number(u.callCenterId) !== Number(fromUser.callCenterId)
                      ? ' — will be bound to this center'
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {fromIsSenior
              ? 'After succession you can deactivate or delete this Senior Supervisor safely.'
              : 'Succeeding binds the successor to this call center and unbinds the leaving supervisor. Open leave coverages for them are ended.'}
          </p>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            loading={isSaving}
            loadingText="Handing off…"
            disabled={!canSubmit || isSaving}
            onClick={() => onSave({
              mode,
              toUserId: mode === 'succeed' ? Number(toUserId) : null,
            })}
          >
            {mode === 'release' ? 'Release duties' : 'Complete succession'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default StaffHandoffModal;
