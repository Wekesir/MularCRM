import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  MapPinned,
  RefreshCw,
  Settings2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import ObservedPageHeader from '../../components/ObservedPageHeader';
import StatCard from '../../components/StatCard';
import LoadingButton from '../../components/LoadingButton';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  approveFieldEscalation,
  assignFieldEscalation,
  cancelFieldEscalation,
  fetchEligibleDebtors,
  fetchFieldAgents,
  fetchFieldEscalationConfig,
  fetchFieldEscalationTotals,
  fetchFieldEscalations,
  rejectFieldEscalation,
  requestFieldEscalation,
  updateFieldEscalationConfig,
} from '../../api/fieldEscalations';

const PAGE_SIZE = 25;

const TABS = [
  { key: 'eligible', label: 'Eligible' },
  { key: 'pending_senior', label: 'Awaiting senior' },
  { key: 'approved', label: 'Approved' },
  { key: 'history', label: 'History' },
];

function formatMoney(value, symbol = '') {
  const n = Number(value) || 0;
  const prefix = symbol ? `${symbol} ` : '';
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function FieldEscalationsPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();
  const { isSupervisor, isSeniorSupervisor, isSystemAdmin, permissions } = usePermissions();

  const canSubmit =
    Boolean(isSystemAdmin) ||
    Boolean(isSupervisor) ||
    Boolean(permissions?.case_management?.field_escalations?.create);
  const canApprove =
    Boolean(isSystemAdmin) ||
    Boolean(isSeniorSupervisor) ||
    Boolean(permissions?.case_management?.field_escalations?.update && isSeniorSupervisor);
  const canConfigure = Boolean(isSystemAdmin) || Boolean(isSeniorSupervisor);

  const [tab, setTab] = useState('eligible');
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({
    eligible: 0,
    pendingSenior: 0,
    approved: 0,
    assigned: 0,
    rejected: 0,
  });
  const [actionId, setActionId] = useState(null);
  const [requestModal, setRequestModal] = useState({ open: false, row: null, note: '' });
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });
  const [assignModal, setAssignModal] = useState({
    open: false,
    row: null,
    fieldAgentUserId: '',
    agents: [],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configForm, setConfigForm] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters = {
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
      };

      const totalsPromise = fetchFieldEscalationTotals();
      let listPromise;
      if (tab === 'eligible') {
        listPromise = fetchEligibleDebtors(filters);
      } else if (tab === 'history') {
        listPromise = fetchFieldEscalations({
          ...filters,
          statusIn: 'assigned,rejected,cancelled',
        });
      } else {
        listPromise = fetchFieldEscalations({ ...filters, status: tab });
      }

      const [totals, list] = await Promise.all([totalsPromise, listPromise]);
      setStats({
        eligible: Number(totals.eligible) || 0,
        pendingSenior: Number(totals.pendingSenior) || 0,
        approved: Number(totals.approved) || 0,
        assigned: Number(totals.assigned) || 0,
        rejected: Number(totals.rejected) || 0,
      });

      const rows = Array.isArray(list.items) ? list.items : [];
      setItems(rows);
      setTotal(Number(list.total) || rows.length);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load field escalations');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        {canConfigure && (
          <button
            type="button"
            className="btn-icon-outline"
            aria-label="Settings"
            onClick={async () => {
              try {
                const cfg = await fetchFieldEscalationConfig();
                setConfigForm({
                  enabled: cfg.enabled !== false,
                  minRefusalContacts: cfg.minRefusalContacts ?? 3,
                  lookbackDays: cfg.lookbackDays ?? 30,
                  waitPeriodDays: cfg.waitPeriodDays ?? 14,
                  requirePaymentGap: cfg.requirePaymentGap !== false,
                  refusalStatusCodes: (cfg.refusalStatusCodes || ['RTP', 'N-C', 'HU']).join(', '),
                });
                setSettingsOpen(true);
              } catch (error) {
                toast.error(error.response?.data?.message || 'Failed to load settings');
              }
            }}
          >
            <Settings2 className="icon-sm" />
          </button>
        )}
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
      </div>
    );
    return () => setActions(null);
  }, [load, setActions, canConfigure]);

  const handleRequest = async () => {
    if (!requestModal.row) return;
    setActionId(requestModal.row.debtorId);
    try {
      await requestFieldEscalation({
        debtorId: requestModal.row.debtorId,
        note: requestModal.note.trim(),
      });
      toast.success('Escalation submitted for senior approval');
      setRequestModal({ open: false, row: null, note: '' });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request escalation');
    } finally {
      setActionId(null);
    }
  };

  const handleApprove = async (id) => {
    setActionId(id);
    try {
      await approveFieldEscalation(id);
      toast.success('Escalation approved');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.id) return;
    setActionId(rejectModal.id);
    try {
      await rejectFieldEscalation(rejectModal.id, {
        rejectionReason: rejectModal.reason.trim(),
      });
      toast.success('Escalation rejected');
      setRejectModal({ open: false, id: null, reason: '' });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject');
    } finally {
      setActionId(null);
    }
  };

  const openAssign = async (row) => {
    try {
      const agents = await fetchFieldAgents(row.callCenterId);
      setAssignModal({
        open: true,
        row,
        fieldAgentUserId: '',
        agents: Array.isArray(agents) ? agents : [],
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load field agents');
    }
  };

  const handleAssign = async () => {
    if (!assignModal.row || !assignModal.fieldAgentUserId) return;
    setActionId(assignModal.row.id);
    try {
      await assignFieldEscalation(assignModal.row.id, Number(assignModal.fieldAgentUserId));
      toast.success('Field agent assigned');
      setAssignModal({ open: false, row: null, fieldAgentUserId: '', agents: [] });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign field agent');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (id) => {
    setActionId(id);
    try {
      await cancelFieldEscalation(id);
      toast.success('Escalation cancelled');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel');
    } finally {
      setActionId(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!configForm) return;
    setSavingConfig(true);
    try {
      await updateFieldEscalationConfig({
        enabled: configForm.enabled,
        minRefusalContacts: Number(configForm.minRefusalContacts),
        lookbackDays: Number(configForm.lookbackDays),
        waitPeriodDays: Number(configForm.waitPeriodDays),
        requirePaymentGap: configForm.requirePaymentGap,
        refusalStatusCodes: String(configForm.refusalStatusCodes)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success('Escalation settings saved');
      setSettingsOpen(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const symbol = currencySymbol || '';

  const emptyCopy = useMemo(() => {
    if (tab === 'eligible') return 'No debtors have completed the refusal wait period yet.';
    if (tab === 'pending_senior') return 'No escalations awaiting senior approval.';
    if (tab === 'approved') return 'No approved escalations waiting for field assignment.';
    return 'No escalation history yet.';
  }, [tab]);

  return (
    <div className="space-y-6 min-h-[50vh]">
      <ObservedPageHeader
        icon={MapPinned}
        title="Field Escalations"
        description="Escalate repeatedly refusing debtors to Field Agents after the wait period"
      />

      <section
        className="cm-stat-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))' }}
      >
        <StatCard icon={MapPinned} value={String(stats.eligible)} label="Eligible" />
        <StatCard icon={Loader2} value={String(stats.pendingSenior)} label="Awaiting senior" />
        <StatCard icon={Check} value={String(stats.approved)} label="Approved" />
        <StatCard icon={MapPinned} value={String(stats.assigned)} label="Assigned" />
      </section>

      <div className="config-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'config-tab config-tab-active' : 'config-tab'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="af-input"
          style={{ maxWidth: '18rem' }}
          placeholder="Search debtor, phone, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="empty-state-card">
          <Loader2 className="empty-state-icon-svg animate-spin" />
          <p className="empty-state-description">Loading escalations…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <MapPinned className="empty-state-icon-svg" />
          </div>
          <h2 className="empty-state-title">Nothing here</h2>
          <p className="empty-state-description">{emptyCopy}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3 font-medium">Debtor</th>
                <th className="p-3 font-medium">Client</th>
                <th className="p-3 font-medium">Balance</th>
                <th className="p-3 font-medium">
                  {tab === 'eligible' ? 'Refusals' : 'Status'}
                </th>
                <th className="p-3 font-medium">
                  {tab === 'eligible' ? 'Eligible since' : 'Updated'}
                </th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const key = row.id || row.debtorId;
                const busy = actionId === key || actionId === row.id || actionId === row.debtorId;
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{row.debtorName || '—'}</p>
                      <p className="text-xs text-muted-foreground">{row.debtorPhone || '—'}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{row.clientName || '—'}</td>
                    <td className="p-3">
                      {formatMoney(row.outstandingBalance, row.currencySymbol || symbol)}
                    </td>
                    <td className="p-3">
                      {tab === 'eligible'
                        ? `${row.refusalCount || 0} noted`
                        : String(row.status || '—').replace(/_/g, ' ')}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(row.eligibleAt || row.updatedAt || row.requestedAt)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {tab === 'eligible' && canSubmit && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            disabled={busy}
                            onClick={() =>
                              setRequestModal({ open: true, row, note: '' })
                            }
                          >
                            Request escalation
                          </button>
                        )}
                        {tab === 'pending_senior' && canApprove && (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => handleApprove(row.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-danger-sm"
                              disabled={busy}
                              onClick={() =>
                                setRejectModal({ open: true, id: row.id, reason: '' })
                              }
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {tab === 'approved' && canSubmit && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => openAssign(row)}
                          >
                            Assign Field Agent
                          </button>
                        )}
                        {['pending_senior', 'approved'].includes(tab) && canSubmit && (
                          <button
                            type="button"
                            className="btn-icon-outline"
                            aria-label="Cancel"
                            disabled={busy}
                            onClick={() => handleCancel(row.id)}
                          >
                            <XCircle className="icon-sm" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-icon-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-icon-outline"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {requestModal.open && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel cf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <h2 className="cf-title">Request field escalation</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRequestModal({ open: false, row: null, note: '' })}
                aria-label="Close"
              >
                <X className="modal-close-icon" />
              </button>
            </div>
            <div className="cf-body space-y-3">
              <p className="text-sm text-muted-foreground">
                Submit <strong>{requestModal.row?.debtorName}</strong> for senior approval
                before assigning a Field Agent.
              </p>
              <div className="af-field">
                <span className="af-label">Supervisor note *</span>
                <textarea
                  className="af-input"
                  rows={3}
                  value={requestModal.note}
                  onChange={(e) =>
                    setRequestModal((m) => ({ ...m, note: e.target.value }))
                  }
                  placeholder="Why escalate this case to the field?"
                />
              </div>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="btn-icon-outline"
                onClick={() => setRequestModal({ open: false, row: null, note: '' })}
              >
                Cancel
              </button>
              <LoadingButton
                className="btn-primary btn-sm"
                loading={Boolean(actionId)}
                disabled={requestModal.note.trim().length < 5}
                onClick={handleRequest}
              >
                Submit
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {rejectModal.open && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel cf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <h2 className="cf-title">Reject escalation</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRejectModal({ open: false, id: null, reason: '' })}
                aria-label="Close"
              >
                <X className="modal-close-icon" />
              </button>
            </div>
            <div className="cf-body">
              <div className="af-field">
                <span className="af-label">Rejection reason *</span>
                <textarea
                  className="af-input"
                  rows={3}
                  value={rejectModal.reason}
                  onChange={(e) =>
                    setRejectModal((m) => ({ ...m, reason: e.target.value }))
                  }
                  placeholder="Explain why this should stay with the call center…"
                />
              </div>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="btn-icon-outline"
                onClick={() => setRejectModal({ open: false, id: null, reason: '' })}
              >
                Cancel
              </button>
              <LoadingButton
                className="btn-danger-sm"
                loading={Boolean(actionId)}
                disabled={rejectModal.reason.trim().length < 5}
                onClick={handleReject}
              >
                Reject
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {assignModal.open && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel cf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <h2 className="cf-title">Assign Field Agent</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() =>
                  setAssignModal({ open: false, row: null, fieldAgentUserId: '', agents: [] })
                }
                aria-label="Close"
              >
                <X className="modal-close-icon" />
              </button>
            </div>
            <div className="cf-body space-y-3">
              <p className="text-sm text-muted-foreground">
                Reassign <strong>{assignModal.row?.debtorName}</strong> to a Field Agent for
                a physical visit.
              </p>
              <div className="af-field">
                <span className="af-label">Field Agent *</span>
                <select
                  className="af-select"
                  value={assignModal.fieldAgentUserId}
                  onChange={(e) =>
                    setAssignModal((m) => ({ ...m, fieldAgentUserId: e.target.value }))
                  }
                >
                  <option value="">Select agent…</option>
                  {assignModal.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.callCenterName ? ` · ${a.callCenterName}` : ''}
                    </option>
                  ))}
                </select>
                {assignModal.agents.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No active agents with expertise “Field Agent” in this call center.
                  </p>
                )}
              </div>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="btn-icon-outline"
                onClick={() =>
                  setAssignModal({ open: false, row: null, fieldAgentUserId: '', agents: [] })
                }
              >
                Cancel
              </button>
              <LoadingButton
                className="btn-primary btn-sm"
                loading={Boolean(actionId)}
                disabled={!assignModal.fieldAgentUserId}
                onClick={handleAssign}
              >
                Assign
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && configForm && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div className="modal-panel cf-panel" role="dialog" aria-modal="true">
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <h2 className="cf-title">Escalation settings</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
              >
                <X className="modal-close-icon" />
              </button>
            </div>
            <div className="cf-body space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, enabled: e.target.checked }))
                  }
                />
                Enabled
              </label>
              <div className="af-field">
                <span className="af-label">Min refusal contacts</span>
                <input
                  type="number"
                  min="1"
                  className="af-input"
                  value={configForm.minRefusalContacts}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, minRefusalContacts: e.target.value }))
                  }
                />
              </div>
              <div className="af-field">
                <span className="af-label">Lookback days</span>
                <input
                  type="number"
                  min="1"
                  className="af-input"
                  value={configForm.lookbackDays}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, lookbackDays: e.target.value }))
                  }
                />
              </div>
              <div className="af-field">
                <span className="af-label">Wait period (days)</span>
                <input
                  type="number"
                  min="0"
                  className="af-input"
                  value={configForm.waitPeriodDays}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, waitPeriodDays: e.target.value }))
                  }
                />
              </div>
              <div className="af-field">
                <span className="af-label">Refusal status codes (comma-separated)</span>
                <input
                  className="af-input"
                  value={configForm.refusalStatusCodes}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, refusalStatusCodes: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={configForm.requirePaymentGap}
                  onChange={(e) =>
                    setConfigForm((f) => ({ ...f, requirePaymentGap: e.target.checked }))
                  }
                />
                Require no confirmed payment during wait
              </label>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="btn-icon-outline"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <LoadingButton
                className="btn-primary btn-sm"
                loading={savingConfig}
                onClick={handleSaveConfig}
              >
                Save
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldEscalationsPage;
