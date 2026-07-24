import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  CheckCircle,
  Headphones,
  MapPin,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Search,
  Users,
  UserCog,
  UserPlus,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Eye,
  Mail,
  Phone,
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
  fetchAssignableStaff,
  transferSupervisorToCenter,
  transferAgentToCenter,
} from '../../api/callCenters';
import { fetchRegions } from '../../api/regions';

const EMPTY_FORM = { name: '', description: '', status: 'active', regionId: '' };

/** Searchable combobox for picking an assignable agent or supervisor */
function StaffSearchSelect({ candidates, value, onChange, kind, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [open]);

  const selected = candidates.find((c) => String(c.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.callCenterName || '').toLowerCase().includes(q)
    );
  }, [candidates, query]);

  const unboundFiltered = filtered.filter((c) => c.unbound);
  const otherFiltered = filtered.filter((c) => !c.unbound);
  const placeholder = kind === 'agent' ? 'Select agent…' : 'Select supervisor…';
  const searchPlaceholder = kind === 'agent' ? 'Search agents…' : 'Search supervisors…';

  const pickOption = (id) => {
    onChange(String(id));
    setOpen(false);
  };

  return (
    <div className="cc-sss-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`cc-sss-trigger${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        {selected ? (
          <span className="cc-sss-value">
            <span className="cc-sss-value-avatar">
              {(selected.name || '?').charAt(0).toUpperCase()}
            </span>
            <span className="cc-sss-value-text">
              <span className="cc-sss-value-name">{selected.name}</span>
              <span className="cc-sss-value-sub">
                {selected.email}
                {!selected.unbound && selected.callCenterName
                  ? ` · ${selected.callCenterName}`
                  : ''}
              </span>
            </span>
          </span>
        ) : (
          <span className="cc-sss-placeholder">{placeholder}</span>
        )}
        <ChevronDown className={`cc-sss-chevron icon-sm${open ? ' is-flipped' : ''}`} />
      </button>

      {open && (
        <div className="cc-sss-dropdown" role="listbox">
          {/* Search bar */}
          <div className="cc-sss-search">
            <Search className="cc-sss-search-icon icon-sm" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              className="cc-sss-search-input"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); }
              }}
            />
            {query && (
              <button
                type="button"
                className="cc-sss-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Results */}
          <div className="cc-sss-list">
            {filtered.length === 0 ? (
              <p className="cc-sss-empty">No matches for &ldquo;{query}&rdquo;</p>
            ) : (
              <>
                {unboundFiltered.length > 0 && (
                  <>
                    <p className="cc-sss-group-label">
                      Unassigned ({unboundFiltered.length})
                    </p>
                    {unboundFiltered.map((c) => {
                      const isSelected = String(c.id) === String(value);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`cc-sss-option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => pickOption(c.id)}
                        >
                          <span className="cc-sss-option-avatar">{(c.name || '?').charAt(0).toUpperCase()}</span>
                          <span className="cc-sss-option-info">
                            <span className="cc-sss-option-name">{c.name}</span>
                            <span className="cc-sss-option-sub">{c.email}</span>
                          </span>
                          <span className="cc-sss-option-tag cc-sss-option-tag--new">Unassigned</span>
                          {isSelected && <CheckCircle className="cc-sss-option-check icon-sm" />}
                        </button>
                      );
                    })}
                  </>
                )}
                {otherFiltered.length > 0 && (
                  <>
                    <p className="cc-sss-group-label">
                      Other call centers ({otherFiltered.length})
                    </p>
                    {otherFiltered.map((c) => {
                      const isSelected = String(c.id) === String(value);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`cc-sss-option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => pickOption(c.id)}
                        >
                          <span className="cc-sss-option-avatar">{(c.name || '?').charAt(0).toUpperCase()}</span>
                          <span className="cc-sss-option-info">
                            <span className="cc-sss-option-name">{c.name}</span>
                            <span className="cc-sss-option-sub">
                              {c.email}
                              {c.callCenterName ? ` · ${c.callCenterName}` : ''}
                            </span>
                          </span>
                          {isSelected && <CheckCircle className="cc-sss-option-check icon-sm" />}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffPersonRow({ person }) {
  return (
    <li className="cc-staff-row">
      <div className="cc-staff-avatar" aria-hidden="true">
        {(person.name || '?').charAt(0).toUpperCase()}
      </div>
      <div className="cc-staff-info">
        <p className="cc-staff-name">
          {person.name}
          {!person.isActive ? (
            <span className="cc-staff-inactive-tag">Inactive</span>
          ) : null}
          {person.onLeave ? (
            <span className="cc-staff-leave-tag">
              On leave
              {person.coveredByName ? ` · covered by ${person.coveredByName}` : ''}
            </span>
          ) : null}
        </p>
        <p className="cc-staff-role">{person.roleName}</p>
        <div className="cc-staff-meta">
          {person.email ? (
            <span className="cc-staff-meta-item">
              <Mail className="icon-xs" aria-hidden="true" />
              {person.email}
            </span>
          ) : null}
          {person.phone ? (
            <span className="cc-staff-meta-item">
              <Phone className="icon-xs" aria-hidden="true" />
              {person.phone}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

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
  const [regions, setRegions] = useState([]);

  // View staff
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffTarget, setStaffTarget] = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffTab, setStaffTab] = useState('supervisors');

  // Add / Transfer staff
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignKind, setAssignKind] = useState('supervisor');
  const [assignCandidates, setAssignCandidates] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);

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

  useEffect(() => {
    fetchRegions({ includeInactive: false })
      .then((rows) => setRegions(Array.isArray(rows) ? rows : []))
      .catch(() => setRegions([]));
  }, []);

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
          .includes(q) ||
        String(c.regionName || '')
          .toLowerCase()
          .includes(q)
    );
  }, [centers, search]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.regionId) {
      toast.error('Region is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        regionId: Number(form.regionId),
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

  const openStaff = async (center, tab = 'supervisors') => {
    setStaffTarget(center);
    setStaffTab(tab);
    setStaffData(null);
    setStaffOpen(true);
    setStaffLoading(true);
    try {
      const data = await fetchCallCenterStaff(center.id);
      setStaffData(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load staff');
      setStaffOpen(false);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadAssignable = async (center, kind) => {
    setAssignLoading(true);
    try {
      const data = await fetchAssignableStaff(center.id, kind);
      setAssignCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load staff candidates');
      setAssignCandidates([]);
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssign = async (center) => {
    setAssignTarget(center);
    setAssignUserId('');
    setAssignKind('supervisor');
    setAssignCandidates([]);
    setAssignOpen(true);
    await loadAssignable(center, 'supervisor');
  };

  const handleAssignKindChange = async (kind) => {
    setAssignKind(kind);
    setAssignUserId('');
    if (!assignTarget) return;
    await loadAssignable(assignTarget, kind);
  };

  const handleAssign = async () => {
    if (!assignUserId || !assignTarget) return;
    const selected = assignCandidates.find((c) => String(c.id) === String(assignUserId));
    setIsSaving(true);
    try {
      const result =
        assignKind === 'agent'
          ? await transferAgentToCenter(assignTarget.id, Number(assignUserId))
          : await transferSupervisorToCenter(assignTarget.id, Number(assignUserId));

      const label = assignKind === 'agent' ? 'Agent' : 'Supervisor';
      if (result?.assigned || selected?.unbound) {
        toast.success(`${label} assigned to ${assignTarget.name}`);
      } else {
        toast.success(`${label} transferred to ${assignTarget.name}`);
      }
      setAssignOpen(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add staff');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCandidate = assignCandidates.find((c) => String(c.id) === String(assignUserId));
  const assignActionLabel = selectedCandidate?.unbound
    ? 'Add to center'
    : selectedCandidate
      ? 'Transfer here'
      : 'Add / Transfer';

  const staffList =
    staffTab === 'agents' ? staffData?.agents || [] : staffData?.supervisors || [];

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
            Create named mini call centers, then assign supervisors and agents to each.
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
              <div className="cc-card-header">
                <div className="cc-card-icon" aria-hidden="true">
                  <Building2 className="cc-card-icon-svg" />
                </div>
                <div className="cc-card-meta">
                  <p className="cc-card-name">{center.name}</p>
                  {center.description && <p className="cc-card-desc">{center.description}</p>}
                  <p className="cc-card-desc">
                    <MapPin className="icon-sm" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.25rem' }} />
                    {center.regionName || 'No region'}
                  </p>
                </div>
                <span
                  className={`status-pill ${
                    center.status === 'active' ? 'status-pill--active' : 'status-pill--inactive'
                  }`}
                >
                  {center.status}
                </span>
              </div>

              <div className="cc-card-divider" />

              <div className="cc-card-stats">
                <div className="cc-stat">
                  <Building2 className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.clientCount ?? 0}</span>
                  <span className="cc-stat-label">Clients</span>
                </div>
                <button
                  type="button"
                  className="cc-stat cc-stat--clickable"
                  title="View supervisors"
                  onClick={() => openStaff(center, 'supervisors')}
                >
                  <UserCog className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.supervisorCount ?? 0}</span>
                  <span className="cc-stat-label">Supervisors</span>
                </button>
                <button
                  type="button"
                  className="cc-stat cc-stat--clickable"
                  title="View agents"
                  onClick={() => openStaff(center, 'agents')}
                >
                  <Users className="cc-stat-icon" />
                  <span className="cc-stat-value">{center.agentCount ?? 0}</span>
                  <span className="cc-stat-label">Agents</span>
                </button>
              </div>

              <div className="cc-card-actions">
                <button
                  type="button"
                  className="cc-action-btn"
                  title="View staff"
                  onClick={() => openStaff(center, 'supervisors')}
                >
                  <Eye className="icon-sm" />
                  Staff
                </button>
                <button
                  type="button"
                  className="cc-action-btn"
                  title="Add or transfer supervisor / agent"
                  onClick={() => openAssign(center)}
                >
                  <UserPlus className="icon-sm" />
                  Add
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
                      regionId: center.regionId != null ? String(center.regionId) : '',
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
                <span className="cf-label">Region *</span>
                <select
                  className="cf-input"
                  value={form.regionId || ''}
                  onChange={(e) => setForm((p) => ({ ...p, regionId: e.target.value }))}
                >
                  <option value="">Select region…</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
                {editing?.regionId &&
                  !regions.some((r) => String(r.id) === String(editing.regionId)) && (
                    <p className="config-hint" style={{ marginTop: '0.35rem' }}>
                      Previous region is inactive or missing. Choose an active region to save.
                    </p>
                  )}
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
                <span
                  className={`cc-modal-status-dot ${
                    form.status === 'active'
                      ? 'cc-modal-status-dot--active'
                      : 'cc-modal-status-dot--inactive'
                  }`}
                />
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

      {/* View staff modal */}
      {staffOpen && staffTarget && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div
            className="modal-panel uf-panel cc-staff-panel cc-assign-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cc-staff-title"
          >
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <div className="cf-header-identity">
                <div className="cf-header-icon" aria-hidden="true">
                  <Users className="cf-header-icon-svg" />
                </div>
                <div>
                  <h2 id="cc-staff-title" className="cf-title">
                    Staff — {staffTarget.name}
                  </h2>
                  <p className="cf-subtitle">Supervisors and agents assigned to this call center.</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setStaffOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="cf-body">
              <div className="config-tabs" role="tablist" aria-label="Staff type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={staffTab === 'supervisors'}
                  className={
                    staffTab === 'supervisors' ? 'config-tab config-tab-active' : 'config-tab'
                  }
                  onClick={() => setStaffTab('supervisors')}
                >
                  Supervisors ({staffData?.supervisors?.length ?? 0})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={staffTab === 'agents'}
                  className={staffTab === 'agents' ? 'config-tab config-tab-active' : 'config-tab'}
                  onClick={() => setStaffTab('agents')}
                >
                  Agents ({staffData?.agents?.length ?? 0})
                </button>
              </div>

              {staffLoading ? (
                <div className="cc-staff-loading">Loading staff…</div>
              ) : staffList.length === 0 ? (
                <div className="cc-staff-empty">
                  <p>
                    No {staffTab === 'agents' ? 'agents' : 'supervisors'} assigned to this center
                    yet.
                  </p>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => {
                      setStaffOpen(false);
                      openAssign(staffTarget);
                    }}
                  >
                    <UserPlus className="icon-sm" />
                    Add {staffTab === 'agents' ? 'agent' : 'supervisor'}
                  </button>
                </div>
              ) : (
                <ul className="cc-staff-list">
                  {staffList.map((person) => (
                    <StaffPersonRow key={person.id} person={person} />
                  ))}
                </ul>
              )}
            </div>
            <div className="cf-footer">
              <button type="button" className="cf-btn-cancel" onClick={() => setStaffOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => {
                  setStaffOpen(false);
                  openAssign(staffTarget);
                }}
              >
                <UserPlus className="icon-sm" />
                Add / Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Transfer staff modal */}
      {assignOpen && assignTarget && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel uf-panel cc-assign-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <div className="cf-header-identity">
                <div className="cf-header-icon" aria-hidden="true">
                  <ArrowLeftRight className="cf-header-icon-svg" />
                </div>
                <div>
                  <h2 className="cf-title">Add or Transfer Staff</h2>
                  <p className="cf-subtitle">
                    Assign an unbound {assignKind} or transfer one into{' '}
                    <strong>{assignTarget.name}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSaving && setAssignOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="cf-body">
              <div className="cf-field">
                <span className="cf-label">Staff type *</span>
                <div
                  className="config-tabs"
                  style={{ marginBottom: 0 }}
                  role="group"
                  aria-label="Staff type"
                >
                  <button
                    type="button"
                    className={
                      assignKind === 'supervisor' ? 'config-tab config-tab-active' : 'config-tab'
                    }
                    onClick={() => handleAssignKindChange('supervisor')}
                    disabled={isSaving || assignLoading}
                  >
                    Supervisor
                  </button>
                  <button
                    type="button"
                    className={
                      assignKind === 'agent' ? 'config-tab config-tab-active' : 'config-tab'
                    }
                    onClick={() => handleAssignKindChange('agent')}
                    disabled={isSaving || assignLoading}
                  >
                    Agent
                  </button>
                </div>
              </div>

              {assignLoading ? (
                <p className="cc-transfer-empty">Loading candidates…</p>
              ) : assignCandidates.length === 0 ? (
                <p className="cc-transfer-empty">
                  {assignKind === 'agent'
                    ? 'No unbound agents or agents in other call centers available.'
                    : 'No unbound supervisors or supervisors in other call centers available.'}
                </p>
              ) : (
                <div className="cf-field">
                  <span className="cf-label">
                    {assignKind === 'agent' ? 'Agent' : 'Supervisor'} *
                  </span>
                  <StaffSearchSelect
                    candidates={assignCandidates}
                    value={assignUserId}
                    onChange={setAssignUserId}
                    kind={assignKind}
                    disabled={isSaving}
                  />
                  {selectedCandidate ? (
                    <p className="cc-assign-hint">
                      {selectedCandidate.unbound
                        ? 'This person has no call center yet and will be assigned here.'
                        : `Currently at ${selectedCandidate.callCenterName || 'another center'} — will be transferred here.`}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="cf-btn-cancel"
                disabled={isSaving}
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </button>
              <LoadingButton
                className="cf-btn-save"
                loading={isSaving}
                onClick={handleAssign}
                disabled={!assignUserId}
              >
                {assignActionLabel}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CallCentersPage;
