import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

function AgentHandoffModal({
  open,
  onClose,
  fromAgent,
  agents = [],
  portfolioCount = null,
  isSaving,
  onSave,
}) {
  const [mode, setMode] = useState('transfer');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!open || !fromAgent) return undefined;
    setMode('transfer');
    setSelectedIds([]);
  }, [open, fromAgent]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const transferOptions = useMemo(() => {
    if (!fromAgent) return [];
    return agents.filter(
      (a) => a.isActive && Number(a.id) !== Number(fromAgent.id)
        && (!fromAgent.callCenterId || !a.callCenterId
          || Number(a.callCenterId) === Number(fromAgent.callCenterId))
    );
  }, [agents, fromAgent]);

  if (!open || !fromAgent) return null;

  const toggleAgent = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const handleSave = () => {
    onSave({
      mode,
      toAgentIds: mode === 'transfer' ? selectedIds : [],
    });
  };

  const canSubmit = mode === 'unassign' || selectedIds.length > 0;
  const debtorCount = portfolioCount?.debtorCount ?? 0;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-handoff-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <ArrowRightLeft className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="agent-handoff-modal-title" className="cf-title">Handoff portfolio</h2>
              <p className="cf-subtitle">
                Permanently move or unassign {fromAgent.name}&apos;s open cases before offboarding.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          <p className="text-sm text-muted-foreground">
            Open portfolio: <strong className="text-foreground">{debtorCount}</strong> case
            {debtorCount === 1 ? '' : 's'} across{' '}
            <strong className="text-foreground">{portfolioCount?.fileCount ?? 0}</strong> file
            {(portfolioCount?.fileCount ?? 0) === 1 ? '' : 's'}.
          </p>

          <div className="af-field">
            <span className="af-label">Handoff mode</span>
            <select
              className="af-select"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isSaving}
            >
              <option value="transfer">Transfer to other agents</option>
              <option value="unassign">Unassign all (Unassigned Files)</option>
            </select>
          </div>

          {mode === 'transfer' && (
            <div className="af-field">
              <span className="af-label">Destination agents (round-robin)</span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-2 space-y-1">
                {transferOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No active agents available in this call center.</p>
                ) : (
                  transferOptions.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        onChange={() => toggleAgent(a.id)}
                        disabled={isSaving}
                      />
                      <span className="text-sm text-foreground">{a.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            After handoff, future commission goes to the new owner. Past payments are unchanged.
            {mode === 'unassign'
              ? ' Unassigned cases go to Unassigned Files for later allocation.'
              : ' Cases are split round-robin across the selected agents.'}
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
            disabled={!canSubmit || isSaving || debtorCount === 0}
            onClick={handleSave}
          >
            {mode === 'unassign' ? 'Unassign portfolio' : 'Transfer portfolio'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default AgentHandoffModal;
