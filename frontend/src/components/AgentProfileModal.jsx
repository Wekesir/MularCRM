import { useEffect, useState } from 'react';
import { X, UserCog, Pencil } from 'lucide-react';
import LoadingButton from './LoadingButton';

function AgentProfileModal({
  open,
  onClose,
  agent,
  experienceLevels,
  expertiseAreas,
  isSaving,
  onSave,
}) {
  const [experience, setExperience] = useState('');
  const [expertise, setExpertise] = useState('');
  const [workload, setWorkload] = useState('');

  useEffect(() => {
    if (!open || !agent) return undefined;
    setExperience(agent.experience || '');
    setExpertise(agent.expertise || '');
    setWorkload(agent.workload || '');
  }, [open, agent]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open || !agent) return null;

  const handleSave = () => {
    onSave({
      experience: experience || null,
      expertise: expertise || null,
      workload: workload || null,
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-profile-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Pencil className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="agent-profile-modal-title" className="cf-title">Edit Agent Profile</h2>
              <p className="cf-subtitle">
                Tag {agent.name} with attributes used by rule-based case assignment.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          <div className="cf-readonly-identity">
            <span className="cf-readonly-avatar" aria-hidden="true">
              <UserCog className="cf-readonly-avatar-svg" />
            </span>
            <div className="cf-readonly-meta">
              <p className="cf-readonly-name">{agent.name}</p>
              <p className="cf-readonly-email">{agent.email}</p>
            </div>
            <span className={`status-pill ${agent.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
              {agent.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="cf-row cf-row--3">
            <div className="cf-field">
              <span className="cf-label">Experience</span>
              <select
                className="cf-select"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              >
                <option value="">—</option>
                {experienceLevels.map((l) => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="cf-field">
              <span className="cf-label">Expertise</span>
              <select
                className="cf-select"
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
              >
                <option value="">—</option>
                {expertiseAreas.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="cf-field">
              <span className="cf-label">Workload</span>
              <select
                className="cf-select"
                value={workload}
                onChange={(e) => setWorkload(e.target.value)}
              >
                <option value="">—</option>
                <option value="Light">Light</option>
                <option value="Medium">Medium</option>
                <option value="Heavy">Heavy</option>
              </select>
            </div>
          </div>

          <div className="cf-callout">
            <div className="cf-callout-icon" aria-hidden="true">
              <UserCog className="cf-callout-icon-svg" />
            </div>
            <p className="cf-callout-text">
              These attributes drive the rule-based assignment workflow. Leave a field blank if it
              doesn&apos;t apply to this agent.
            </p>
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            onClick={handleSave}
            loading={isSaving}
            loadingText="Saving…"
          >
            Save Changes
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default AgentProfileModal;
