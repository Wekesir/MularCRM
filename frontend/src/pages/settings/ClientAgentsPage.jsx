import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Handshake,
  RefreshCw,
  Search,
  Lock,
  ShieldAlert,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { usePageActions } from '../../context/PageActionsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchClients, assignClientCallCenter } from '../../api/clients';
import { fetchCallCenters } from '../../api/callCenters';

const FILTER_TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'all', label: 'All' },
];

function ClientAgentsPage() {
  const { setActions } = usePageActions();
  const { isSystemAdmin, isSeniorSupervisor } = usePermissions();
  const canAssign = isSystemAdmin || isSeniorSupervisor;
  const canReassign = isSystemAdmin || isSeniorSupervisor;

  const [clients, setClients] = useState([]);
  const [centers, setCenters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unassigned');
  const [assigningId, setAssigningId] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [clientRows, centerRows] = await Promise.all([
        fetchClients(),
        fetchCallCenters({ includeInactive: false }),
      ]);
      setClients(Array.isArray(clientRows) ? clientRows : []);
      setCenters(Array.isArray(centerRows) ? centerRows : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load client assignments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setActions(
      <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
        <RefreshCw className="icon-sm" />
      </button>
    );
    return () => setActions(null);
  }, [load, setActions]);

  const filtered = useMemo(() => {
    let rows = clients;
    if (filter === 'unassigned') rows = rows.filter((c) => !c.callCenterId);
    if (filter === 'assigned') rows = rows.filter((c) => c.callCenterId);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          String(c.callCenterName || '')
            .toLowerCase()
            .includes(q)
      );
    }
    return rows;
  }, [clients, filter, search]);

  const unassignedCount = useMemo(() => clients.filter((c) => !c.callCenterId).length, [clients]);
  const assignedCount = useMemo(() => clients.filter((c) => c.callCenterId).length, [clients]);

  const handleAssign = async (client) => {
    const centerId = selectedCenter[client.id];
    if (!centerId) {
      toast.error('Select a call center first');
      return;
    }
    setAssigningId(client.id);
    try {
      const updated = await assignClientCallCenter(client.id, Number(centerId), { force: false });
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`${updated.name} assigned to ${updated.callCenterName}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Assignment failed');
    } finally {
      setAssigningId(null);
    }
  };

  const handleForceReassign = async (client) => {
    if (!canReassign) return;
    const centerId = selectedCenter[client.id];
    if (!centerId) {
      toast.error('Select a new call center first');
      return;
    }
    setAssigningId(client.id);
    try {
      const updated = await assignClientCallCenter(client.id, Number(centerId), { force: true });
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Reassigned ${updated.name} to ${updated.callCenterName}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Reassignment failed');
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="cc-page">
      {/* Info callout */}
      <div className="cca-info-callout">
        <Lock className="cca-info-callout-icon" />
        <p className="cca-info-callout-text">
          Each client is assigned to one call center. After assignment, every new file uploaded for
          that client will automatically appear in the assigned center&apos;s supervisor dashboard.
          Senior Supervisors and System Admins can reassign a client to another center when needed.
        </p>
      </div>

      {/* Summary chips */}
      <div className="cca-summary">
        <div className="cca-summary-chip cca-summary-chip--pending">
          <ShieldAlert className="cca-summary-chip-icon" />
          <span className="cca-summary-chip-value">{unassignedCount}</span>
          <span className="cca-summary-chip-label">Unassigned</span>
        </div>
        <div className="cca-summary-chip cca-summary-chip--done">
          <CheckCircle2 className="cca-summary-chip-icon" />
          <span className="cca-summary-chip-value">{assignedCount}</span>
          <span className="cca-summary-chip-label">Assigned</span>
        </div>
      </div>

      <div className="cm-table-card">
        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="config-tabs" style={{ marginBottom: 0 }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={filter === tab.key ? 'config-tab config-tab-active' : 'config-tab'}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                {tab.key === 'unassigned' && unassignedCount > 0 && (
                  <span className="cca-tab-badge">{unassignedCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Assigned Call Center</th>
                {canAssign && <th className="cm-th">Assign</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={canAssign ? 4 : 3}>
                    <div className="cm-empty-state">
                      <p className="cm-empty-title">Loading…</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={canAssign ? 4 : 3}>
                    <div className="cm-empty-state">
                      <div className="cm-empty-icon">
                        <Handshake />
                      </div>
                      <p className="cm-empty-title">
                        {filter === 'unassigned'
                          ? 'All clients assigned'
                          : 'Nothing to show'}
                      </p>
                      <p className="cm-empty-desc">
                        {filter === 'unassigned'
                          ? 'Every client has been assigned to a call center.'
                          : 'No clients match the current filter.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((client, idx) => {
                  const locked = Boolean(client.callCenterId);
                  return (
                    <tr key={client.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{idx + 1}</td>
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="cm-client-avatar" aria-hidden="true">
                            <Building2 className="cm-client-avatar-icon" />
                          </span>
                          <div>
                            <p className="cm-client-name">{client.name}</p>
                            <p className="cm-client-type">{client.businessType || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="cm-td">
                        {locked ? (
                          <div className="cca-assigned-cell">
                            <Lock className="cca-lock-icon" />
                            <span className="cca-center-name">{client.callCenterName}</span>
                          </div>
                        ) : (
                          <span className="cca-unassigned-badge">Unassigned</span>
                        )}
                      </td>
                      {canAssign && (
                        <td className="cm-td">
                          <div className="cca-assign-cell">
                            <div className="cca-select-wrap">
                              <select
                                className="cca-select"
                                value={selectedCenter[client.id] || ''}
                                onChange={(e) =>
                                  setSelectedCenter((p) => ({
                                    ...p,
                                    [client.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Select center…</option>
                                {centers.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="cca-select-chevron" />
                            </div>
                            {!locked ? (
                              <LoadingButton
                                className="btn-primary btn-sm"
                                loading={assigningId === client.id}
                                onClick={() => handleAssign(client)}
                              >
                                Assign
                              </LoadingButton>
                            ) : canReassign ? (
                              <LoadingButton
                                className="cca-reassign-btn"
                                loading={assigningId === client.id}
                                onClick={() => handleForceReassign(client)}
                              >
                                Override
                              </LoadingButton>
                            ) : (
                              <span
                                className="cca-locked-note"
                                title="Only Senior Supervisors can reassign"
                              >
                                <Lock className="icon-sm" /> Locked
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ClientAgentsPage;
