import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import LoadingButton from '../../components/LoadingButton';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  approveLoanRestructure,
  cancelLoanRestructure,
  fetchLoanRestructure,
  fetchLoanRestructures,
  fetchLoanRestructureTotals,
  rejectLoanRestructure,
  updateRestructureInstallment,
} from '../../api/loanRestructures';
import { fetchClients } from '../../api/clients';
import { fetchAgents } from '../../api/agents';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_META = {
  pending_approval: { label: 'Pending approval', cls: 'rl-status rl-status--pending_approval' },
  approved: { label: 'Approved', cls: 'rl-status rl-status--approved' },
  rejected: { label: 'Rejected', cls: 'rl-status rl-status--rejected' },
  cancelled: { label: 'Cancelled', cls: 'rl-status rl-status--cancelled' },
  completed: { label: 'Completed', cls: 'rl-status rl-status--completed' },
};

const EMPTY_FILTERS = {
  clientId: '',
  agentId: '',
};

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

function RestructuredLoansPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();
  const { isAgent, isSupervisor, isSystemAdmin, permissions } = usePermissions();

  const canReview =
    Boolean(isSystemAdmin) ||
    Boolean(isSupervisor) ||
    Boolean(permissions?.payments?.restructured_loans?.update);

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    completedCount: 0,
    pendingAmount: 0,
    approvedAmount: 0,
  });

  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('pending_approval');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [clients, setClients] = useState([]);
  const [agents, setAgents] = useState([]);

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '' && v != null).length,
    [appliedFilters]
  );

  const queryFilters = useMemo(
    () => ({
      ...appliedFilters,
      status: statusTab || undefined,
      search: search.trim() || undefined,
    }),
    [appliedFilters, statusTab, search]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, totals] = await Promise.all([
        fetchLoanRestructures({ page, pageSize: PAGE_SIZE, ...queryFilters }),
        fetchLoanRestructureTotals({
          ...appliedFilters,
          search: search.trim() || undefined,
        }),
      ]);
      setItems(list.items || []);
      setTotal(list.total || 0);
      setStats({
        total: totals.total || 0,
        pendingCount: totals.pendingCount || 0,
        approvedCount: totals.approvedCount || 0,
        rejectedCount: totals.rejectedCount || 0,
        completedCount: totals.completedCount || 0,
        pendingAmount: totals.pendingAmount || 0,
        approvedAmount: totals.approvedAmount || 0,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load restructured loans');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, queryFilters, appliedFilters, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const tasks = [fetchClients()];
    if (!isAgent) tasks.push(fetchAgents());
    Promise.all(tasks)
      .then(([clientRows, agentRows]) => {
        if (cancelled) return;
        setClients(Array.isArray(clientRows) ? clientRows : clientRows?.items || []);
        if (agentRows) setAgents(Array.isArray(agentRows) ? agentRows : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAgent]);

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={loadData}>
          <RefreshCw className={`icon-sm${isLoading ? ' animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          className={`af-toggle${showFilters ? ' af-toggle--active' : ''}${activeFilterCount > 0 ? ' af-toggle--has' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="icon-sm" />
          <span>Filters</span>
          {activeFilterCount > 0 && <span className="af-toggle-count">{activeFilterCount}</span>}
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, loadData, isLoading, showFilters, activeFilterCount]);

  const loadDetail = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const data = await fetchLoanRestructure(id);
      setDetail(data);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load schedule');
      setExpandedId(null);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id) => {
    setActionId(id);
    try {
      const result = await approveLoanRestructure(id);
      const cancelled = result.cancelledPtps || 0;
      toast.success(
        cancelled > 0
          ? `Approved — ${cancelled} pending PTP${cancelled === 1 ? '' : 's'} cancelled`
          : 'Restructure approved'
      );
      if (expandedId === id) {
        setDetail(result);
      }
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to approve');
    } finally {
      setActionId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal.id || !rejectModal.reason.trim()) return;
    setActionId(rejectModal.id);
    try {
      await rejectLoanRestructure(rejectModal.id, rejectModal.reason.trim());
      toast.success('Restructure rejected');
      setRejectModal({ open: false, id: null, reason: '' });
      if (expandedId === rejectModal.id) {
        setExpandedId(null);
        setDetail(null);
      }
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reject');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (id) => {
    setActionId(id);
    try {
      await cancelLoanRestructure(id);
      toast.success('Request withdrawn');
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
      }
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to cancel');
    } finally {
      setActionId(null);
    }
  };

  const handleInstallmentStatus = async (restructureId, installmentId, status) => {
    setActionId(`inst-${installmentId}`);
    try {
      const updated = await updateRestructureInstallment(restructureId, installmentId, status);
      setDetail(updated);
      toast.success('Installment updated');
      if (updated.status === 'completed') loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update installment');
    } finally {
      setActionId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const colCount = isAgent ? 7 : 8;

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-6 min-h-[50vh]">
      <section className="cm-stat-grid">
        <StatCard
          icon={CalendarRange}
          numericValue={stats.total}
          label="Total plans"
          meta="All restructures"
          accent="var(--theme-color)"
          variant="compact"
        />
        <StatCard
          icon={Clock}
          numericValue={stats.pendingCount}
          label="Pending approval"
          meta={formatMoney(stats.pendingAmount, currencySymbol)}
          accent="#f59e0b"
          variant="compact"
        />
        <StatCard
          icon={CircleCheck}
          numericValue={stats.approvedCount}
          label="Approved"
          meta={formatMoney(stats.approvedAmount, currencySymbol)}
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={XCircle}
          numericValue={stats.rejectedCount}
          label="Rejected"
          meta={`${stats.completedCount} completed`}
          accent="#64748b"
          variant="compact"
        />
      </section>

      <div className="cm-table-card">
        <SectionHeader icon={CalendarRange} title="Restructured loans" count={total} />

        <div className="config-tabs" style={{ marginBottom: 0, padding: '0 1rem' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key || 'all'}
              type="button"
              className={statusTab === tab.key ? 'config-tab config-tab-active' : 'config-tab'}
              onClick={() => {
                setStatusTab(tab.key);
                setPage(1);
                setExpandedId(null);
                setDetail(null);
              }}
            >
              {tab.label}
              {tab.key === 'pending_approval' && stats.pendingCount > 0
                ? ` (${stats.pendingCount})`
                : ''}
            </button>
          ))}
        </div>

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <CalendarRange className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search debtor, client, agent…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {showFilters && (
          <div className="af-panel">
            <div className="af-grid">
              <div className="af-field">
                <span className="af-label">Client</span>
                <select
                  className="af-select"
                  value={filters.clientId}
                  onChange={(e) => setFilters((p) => ({ ...p, clientId: e.target.value }))}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {!isAgent && (
                <div className="af-field">
                  <span className="af-label">Agent</span>
                  <select
                    className="af-select"
                    value={filters.agentId}
                    onChange={(e) => setFilters((p) => ({ ...p, agentId: e.target.value }))}
                  >
                    <option value="">All agents</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="af-actions">
              <button type="button" className="btn-icon-outline af-clear-btn" onClick={clearFilters}>
                <X className="icon-sm" /> Clear all
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
          </div>
        )}

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor</th>
                <th className="cm-th">Client</th>
                {!isAgent && <th className="cm-th">Agent</th>}
                <th className="cm-th cm-th-num">Terms</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Plan total
                  <br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-date">First due</th>
                <th className="cm-th">Status</th>
                <th className="cm-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount + 1}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading restructured loans…</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount + 1}>
                    <div className="cm-empty-state">
                      <CalendarRange className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No restructure requests</p>
                      <p className="cm-empty-desc">
                        {activeFilterCount > 0 || search || statusTab
                          ? 'Try a different tab or clear filters.'
                          : 'Agents submit repayment plans from My Portfolio.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const meta = STATUS_META[item.status] || STATUS_META.pending_approval;
                  const symbol = item.currencySymbol || currencySymbol;
                  const isExpanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr className="cm-table-row">
                        <td className="cm-td cm-td-index">
                          {(currentPage - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="cm-td">
                          <p className="cm-client-name">{item.debtorName}</p>
                          {item.debtorPhone && (
                            <p className="cm-client-type">{item.debtorPhone}</p>
                          )}
                        </td>
                        <td className="cm-td">
                          {item.clientName ? (
                            <span className="dm-client-link">{item.clientName}</span>
                          ) : (
                            <span className="dm-muted">—</span>
                          )}
                        </td>
                        {!isAgent && (
                          <td className="cm-td">
                            {item.agentName ? (
                              <span className="dm-agent-cell">
                                <span className="dm-agent-dot" />
                                {item.agentName}
                              </span>
                            ) : (
                              <span className="dm-muted">—</span>
                            )}
                          </td>
                        )}
                        <td className="cm-td cm-td-num">
                          {item.installmentCount}× {formatMoney(item.installmentAmount, symbol)}
                        </td>
                        <td className="cm-td cm-td-num cm-money">
                          {formatMoney(item.totalPlanAmount, symbol)}
                        </td>
                        <td className="cm-td cm-td-date">{formatDate(item.firstDueDate)}</td>
                        <td className="cm-td">
                          <span className={meta.cls}>{meta.label}</span>
                        </td>
                        <td className="cm-td">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              className="btn-icon-outline"
                              aria-label={isExpanded ? 'Hide schedule' : 'View schedule'}
                              title={isExpanded ? 'Hide schedule' : 'View schedule'}
                              onClick={() => loadDetail(item.id)}
                            >
                              <ChevronDown
                                className={`icon-sm${isExpanded ? ' rotate-180' : ''}`}
                              />
                            </button>
                            {canReview && item.status === 'pending_approval' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  disabled={actionId === item.id}
                                  onClick={() => handleApprove(item.id)}
                                >
                                  {actionId === item.id ? (
                                    <Loader2 className="icon-sm animate-spin" />
                                  ) : (
                                    <Check className="icon-sm" />
                                  )}
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger-sm"
                                  disabled={actionId === item.id}
                                  onClick={() =>
                                    setRejectModal({ open: true, id: item.id, reason: '' })
                                  }
                                >
                                  <X className="icon-sm" />
                                  Reject
                                </button>
                              </>
                            )}
                            {isAgent && item.status === 'pending_approval' && (
                              <button
                                type="button"
                                className="btn-icon-outline"
                                title="Withdraw request"
                                aria-label="Withdraw request"
                                disabled={actionId === item.id}
                                onClick={() => handleCancel(item.id)}
                              >
                                <X className="icon-sm" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td className="cm-td" colSpan={colCount + 1}>
                            {detailLoading || !detail || detail.id !== item.id ? (
                              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                                <Loader2 className="icon-sm animate-spin" />
                                Loading schedule…
                              </div>
                            ) : (
                              <div className="rl-schedule-preview" style={{ margin: '0.25rem 0' }}>
                                <div className="rl-schedule-preview-header">
                                  <span>
                                    Installment schedule
                                    {detail.rejectionReason
                                      ? ` · Rejected: ${detail.rejectionReason}`
                                      : ''}
                                    {detail.notes ? ` · Notes: ${detail.notes}` : ''}
                                  </span>
                                  <strong>
                                    {formatMoney(detail.totalPlanAmount, symbol)}
                                  </strong>
                                </div>
                                <div className="rl-schedule-table-wrap">
                                  <table className="rl-schedule-table">
                                    <thead>
                                      <tr>
                                        <th>#</th>
                                        <th>Due date</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(detail.installments || []).map((inst) => (
                                        <tr key={inst.id}>
                                          <td>{inst.sequence}</td>
                                          <td>{formatDate(inst.dueDate)}</td>
                                          <td>{formatMoney(inst.amount, symbol)}</td>
                                          <td>
                                            {(detail.status === 'approved' ||
                                              detail.status === 'completed') &&
                                            inst.status !== 'cancelled' ? (
                                              <select
                                                className="af-select"
                                                style={{
                                                  width: 'auto',
                                                  minWidth: '6.5rem',
                                                  height: '2rem',
                                                  fontSize: '0.75rem',
                                                }}
                                                value={inst.status}
                                                disabled={actionId === `inst-${inst.id}`}
                                                onChange={(e) =>
                                                  handleInstallmentStatus(
                                                    detail.id,
                                                    inst.id,
                                                    e.target.value
                                                  )
                                                }
                                              >
                                                <option value="pending">Pending</option>
                                                <option value="paid">Paid</option>
                                                <option value="cancelled">Cancelled</option>
                                              </select>
                                            ) : (
                                              <span className="text-xs text-muted-foreground capitalize">
                                                {inst.status}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 && (
          <div className="cm-pagination">
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} plan
              {total === 1 ? '' : 's'}
            </p>
            <div className="cm-pagination-controls">
              <button
                type="button"
                className="cm-pagination-btn"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                aria-label="First page"
              >
                <ChevronFirst className="icon-sm" />
              </button>
              <button
                type="button"
                className="cm-pagination-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="icon-sm" />
              </button>
              <button
                type="button"
                className="cm-pagination-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="icon-sm" />
              </button>
              <button
                type="button"
                className="cm-pagination-btn"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                aria-label="Last page"
              >
                <ChevronLast className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>

      {rejectModal.open && (
        <div className="modal-backdrop modal-backdrop-static" role="presentation">
          <div
            className="modal-panel cf-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-restructure-title"
          >
            <div className="cf-accent-strip" aria-hidden="true" />
            <div className="cf-header">
              <div className="cf-header-identity">
                <div className="cf-header-icon" aria-hidden="true">
                  <XCircle className="cf-header-icon-svg" />
                </div>
                <div>
                  <h2 id="reject-restructure-title" className="cf-title">
                    Reject restructure
                  </h2>
                  <p className="cf-subtitle">Provide a reason for the agent</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRejectModal({ open: false, id: null, reason: '' })}
                aria-label="Close"
                disabled={Boolean(actionId)}
              >
                <X className="modal-close-icon" />
              </button>
            </div>
            <div className="cf-body">
              <div className="af-field">
                <span className="af-label">
                  Reason <span style={{ color: 'var(--color-red-500, #ef4444)' }}>*</span>
                </span>
                <textarea
                  className="af-input"
                  rows={3}
                  value={rejectModal.reason}
                  onChange={(e) =>
                    setRejectModal((p) => ({ ...p, reason: e.target.value }))
                  }
                  placeholder="Explain why this plan cannot be approved…"
                  disabled={Boolean(actionId)}
                />
              </div>
            </div>
            <div className="cf-footer">
              <button
                type="button"
                className="btn-icon-outline"
                onClick={() => setRejectModal({ open: false, id: null, reason: '' })}
                disabled={Boolean(actionId)}
              >
                Cancel
              </button>
              <LoadingButton
                className="btn-danger-sm"
                loading={Boolean(actionId)}
                loadingText="Rejecting…"
                disabled={!rejectModal.reason.trim()}
                onClick={handleRejectConfirm}
              >
                Reject plan
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RestructuredLoansPage;
