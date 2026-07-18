import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Headphones,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Search,
  Users,
  UserCog,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchCallCenters,
  createCallCenter,
  updateCallCenter,
  deleteCallCenter,
  fetchCallCenterStaff,
  transferSupervisorToCenter,
  transferAgentToCenter,
} from '../../api/callCenters';

const EMPTY_FORM = { name: '', description: '', status: 'active' };

function CallCentersPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [centers, setCenters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferUserId, setTransferUserId] = useState('');
  const [transferKind, setTransferKind] = useState('supervisor');
  const [transferCandidates, setTransferCandidates] = useState([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCallCenters({ includeInactive: true });
      setCenters(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load call centers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Call Center
        </button>
      </>
    );
    return () => setActions(null);
  }, [load, setActions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return centers;
    return centers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.description || '')
          .toLowerCase()
          .includes(q)
    );
  }, [centers, search]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      };
      if (editing) {
        const updated = await updateCallCenter(editing.id, payload);
        setCenters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(`Call center "${updated.name}" updated`);
      } else {
        const created = await createCallCenter(payload);
        setCenters((prev) => [created, ...prev]);
        toast.success(`Call center "${created.name}" created`);
      }
      setModalOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save call center');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (center) => {
    const ok = await confirm({
      title: 'Delete call center?',
      message: `Delete "${center.name}"? Staff and clients must be reassigned first.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCallCenter(center.id);
      setCenters((prev) => prev.filter((c) => c.id !== center.id));
      toast.success('Call center deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete call center');
    }
  };

  const loadTransferCandidates = async (center, kind) => {
    try {
      const all = await fetchCallCenters({ includeInactive: false });
      const otherCenters = all.filter((c) => c.id !== center.id);
      const staffLists = await Promise.all(
        otherCenters.map(async (c) => {
          const staff = await fetchCallCenterStaff(c.id).catch(() => null);
          return { center: c, staff };
        })
      );
      const pool = [];
      staffLists.forEach(({ center: c, staff }) => {
        const list = kind === 'agent' ? staff?.agents : staff?.supervisors;
        if (!list) return;
        list.forEach((person) => {
          pool.push({ ...person, callCenterName: c.name });
        });
      });
      setTransferCandidates(pool);
    } catch {
      setTransferCandidates([]);
    }
  };

  const openTransfer = async (center) => {
    setTransferTarget(center);
    setTransferUserId('');
    setTransferKind('supervisor');
    setTransferCandidates([]);
    setTransferOpen(true);
    await loadTransferCandidates(center, 'supervisor');
  };

  const handleTransferKindChange = async (kind) => {
    setTransferKind(kind);
    setTransferUserId('');
    if (!transferTarget) return;
    await loadTransferCandidates(transferTarget, kind);
  };

  const handleTransfer = async () => {
    if (!transferUserId || !transferTarget) return;
    setIsSaving(true);
    try {
      if (transferKind === 'agent') {
        await transferAgentToCenter(transferTarget.id, Number(transferUserId));
        toast.success('Agent transferred');
      } else {
        await transferSupervisorToCenter(transferTarget.id, Number(transferUserId));
        toast.success('Supervisor transferred');
      }
      setTransferOpen(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Transfer failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="cc-page">
      {/* Search bar */}
      <div className="cc-search-bar">
        <div className="cm-search-wrap" style={{ maxWidth: '26rem' }}>
          <Search className="cm-search-icon" />
          <input
            type="search"
            className="cm-search-input"
            placeholder="Search call centers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="cc-count-badge">
          {filtered.length} center{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="cc-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="cc-card cc-card-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Headphones className="empty-state-icon-svg" />
          </div>
          <h2 className="empty-state-title">No call centers yet</h2>
          <p className="empty-state-description">
            Create named mini call centers, then assign clients and supervisors to each.
          </p>
          <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
            <Plus className="icon-sm" />
            Add Call Center
          </button>
        </div>
      ) : (
        <div className="cc-grid">
          {filtered.map((center) => (
            <div
              key={center.id}
              className={`cc-card ${center.status === 'inactive' ? 'cc-card--inactive' : ''}`}
            >
              {/* Card header */}
              <div className="cc-card-header">
                <div className="cc-card-icon" aria-hidden="true">
                  <Building2 className="cc-card-icon-svg" />
                </div>
                <div className="cc-card-meta">
                  <p className="cc-card-name">{center.name}</p>
                  {center.description && (
                    <p className="cc-card-desc">{center.description}</p>
                  )}
                </div>
                <span
                  className={`status-pill ${
                    center.status === 'active' ? 'status-pill--active' : 'status-pill--inactive'
                  }`}
                >
                  {center.status}
                </span>
              </div>

              {/* Divider */}
              <div className="cc-card-divider" />

              {/* Stats row */}
              <div className="cc-card-stats">
                <div className="cc-stat">
                  <Building2 className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.clientCount ?? 0}</span>
                  <span className="cc-stat-label">Clients</span>
                </div>
                <div className="cc-stat">
                  <UserCog className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.supervisorCount ?? 0}</span>
                  <span className="cc-stat-label">Supervisors</span>
                </div>
                <div className="cc-stat">
                  <Users className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.agentCount ?? 0}</span>
                  <span className="cc-stat-label">Agents</span>
                </div>
              </div>

              {/* Actions */}
              <div className="cc-card-actions">
                <button
                  type="button"
                  className="cc-action-btn"
                  title="Transfer supervisor or agent here"
                  onClick={() => openTransfer(center)}
                >
                  <ArrowLeftRight className="icon-sm" />
                  Transfer
                </button>
                <button
                  type="button"
                  className="cc-action-btn"
                  title="Edit call center"
                  onClick={() => {
                    setEditing(center);
                    setForm({
                      name: center.name,
                      description: center.description || '',
                      status: center.status,
                    });
                    setModalOpen(true);
                  }}
                >
                  <Pencil className="icon-sm" />
                  Edit
                </button>
                <button
                  type="button"
                  className="cc-action-btn cc-action-btn--danger"
                  title="Delete call center"
                  onClick={() => handleDelete(center)}
                >
                  <Trash2 className="icon-sm" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel uf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <div className="cf-header-identity">
                <div className="cf-header-icon" aria-hidden="true">
                  <Headphones className="cf-header-icon-svg" />
                </div>
                <div>
                  <h2 className="cf-title">{editing ? 'Edit Call Center' : 'New Call Center'}</h2>
                  <p className="cf-subtitle">Named mini unit under the call center company.</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSaving && setModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="cf-body">
              <div className="cf-field">
                <span className="cf-label">Name *</span>
                <input
                  className="cf-input"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Nairobi Desk"
                />
              </div>
              <div className="cf-field">
                <span className="cf-label">Description</span>
                <input
                  className="cf-input"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional brief description"
                />
              </div>
              <div className="cf-field">
                <span className="cf-label">Status</span>
                <select
                  className="cf-input"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="cc-modal-preview">
                <span className={`cc-modal-status-dot ${form.status === 'active' ? 'cc-modal-status-dot--active' : 'cc-modal-status-dot--inactive'}`} />
                {form.status === 'active' ? (
                  <CheckCircle2 className="cc-modal-status-icon cc-modal-status-icon--active" />
                ) : (
                  <XCircle className="cc-modal-status-icon cc-modal-status-icon--inactive" />
                )}
                <span className="cc-modal-status-label">
                  This center will be <strong>{form.status}</strong>
                </span>
              </div>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="cf-btn-cancel"
                disabled={isSaving}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <LoadingButton className="cf-btn-save" loading={isSaving} onClick={handleSave}>
                {editing ? 'Save changes' : 'Create center'}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Transfer staff modal */}
      {transferOpen && transferTarget && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel uf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <div className="cf-header-identity">
                <div className="cf-header-icon" aria-hidden="true">
                  <ArrowLeftRight className="cf-header-icon-svg" />
                </div>
                <div>
                  <h2 className="cf-title">Transfer Staff</h2>
                  <p className="cf-subtitle">
                    Move a supervisor or agent into <strong>{transferTarget.name}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSaving && setTransferOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="cf-body">
              <div className="cf-field">
                <span className="cf-label">Staff type *</span>
                <div className="config-tabs" style={{ marginBottom: 0 }} role="group" aria-label="Staff type">
                  <button
                    type="button"
                    className={
                      transferKind === 'supervisor' ? 'config-tab config-tab-active' : 'config-tab'
                    }
                    onClick={() => handleTransferKindChange('supervisor')}
                    disabled={isSaving}
                  >
                    Supervisor
                  </button>
                  <button
                    type="button"
                    className={
                      transferKind === 'agent' ? 'config-tab config-tab-active' : 'config-tab'
                    }
                    onClick={() => handleTransferKindChange('agent')}
                    disabled={isSaving}
                  >
                    Agent
                  </button>
                </div>
              </div>
              {transferCandidates.length === 0 ? (
                <p className="cc-transfer-empty">
                  {transferKind === 'agent'
                    ? 'No agents found in other active call centers.'
                    : 'No supervisors found in other active call centers.'}
                </p>
              ) : (
                <div className="cf-field">
                  <span className="cf-label">
                    {transferKind === 'agent' ? 'Agent' : 'Supervisor'} *
                  </span>
                  <select
                    className="cf-input"
                    value={transferUserId}
                    onChange={(e) => setTransferUserId(e.target.value)}
                  >
                    <option value="">
                      {transferKind === 'agent' ? 'Select agent…' : 'Select supervisor…'}
                    </option>
                    {transferCandidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.email}
                        {s.callCenterName ? ` (${s.callCenterName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="cf-btn-cancel"
                disabled={isSaving}
                onClick={() => setTransferOpen(false)}
              >
                Cancel
              </button>
              <LoadingButton
                className="cf-btn-save"
                loading={isSaving}
                onClick={handleTransfer}
                disabled={!transferUserId}
              >
                Transfer
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CallCentersPage;
