import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Download,
  FileText,
  Hash,
  Layers,
  MessageSquare,
  Percent,
  Phone,
  Receipt,
  RefreshCw,
  SlidersHorizontal,
  Timer,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../StatCard';
import ReportFilters, {
  countActiveReportFilters,
  defaultReportFilters,
} from './ReportFilters';
import {
  ALL_ADVANCED_KEYS,
  getAdvancedFields,
  showDateRangeFor,
} from './reportFilterConfig';
import ReportGatePanel from './ReportGatePanel';
import { downloadReportExport, fetchReportData } from '../../api/reports';
import { fetchClients } from '../../api/clients';
import { fetchAgents } from '../../api/agents';
import { fetchAgentPortfolioClients } from '../../api/agentPortfolio';
import { useReportGate } from '../../hooks/useReportGate';
import { usePermissions } from '../../hooks/usePermissions';
import { useAppSelector } from '../../store/hooks';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePageActions } from '../../context/PageActionsContext';

function formatCell(value, format, currencySymbol) {
  if (value == null || value === '') return '—';
  if (format === 'money') {
    const n = Number(value) || 0;
    const prefix = currencySymbol ? `${currencySymbol} ` : '';
    return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') {
    return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }
  if (format === 'number') {
    return Number(value || 0).toLocaleString();
  }
  return String(value);
}

function getKpiMeta(key, label) {
  const text = `${key ?? ''} ${label ?? ''}`.toLowerCase();
  if (text.includes('collect') && !text.includes('collector')) return { icon: Coins, accent: '#10b981' };
  if (text.includes('outstanding') || text.includes('balance')) return { icon: Wallet, accent: '#f59e0b' };
  if (text.includes('recovery') || text.includes('rate') || text.includes('keep'))
    return { icon: Percent, accent: 'var(--theme-color)' };
  if (text.includes('deliver')) return { icon: CheckCircle2, accent: '#10b981' };
  if (text.includes('ptp') || text.includes('promise') || text.includes('arrangement'))
    return { icon: CalendarCheck2, accent: '#8b5cf6' };
  if (text.includes('call') || text.includes('inbound') || text.includes('outbound') || text.includes('connected'))
    return { icon: Phone, accent: 'var(--theme-color)' };
  if (text.includes('sms') || text.includes('sent') || text.includes('segment'))
    return { icon: MessageSquare, accent: '#06b6d4' };
  if (text.includes('debtor') || text.includes('account') || text.includes('unique'))
    return { icon: Users, accent: 'var(--theme-color)' };
  if (text.includes('agent') || text.includes('collector')) return { icon: UserCog, accent: '#8b5cf6' };
  if (text.includes('client') || text.includes('portfolio')) return { icon: Building2, accent: '#06b6d4' };
  if (text.includes('fail') || text.includes('reversal') || text.includes('dispute') || text.includes('open'))
    return { icon: AlertTriangle, accent: '#ef4444' };
  if (text.includes('note')) return { icon: FileText, accent: 'var(--theme-color)' };
  if (text.includes('payment') || text.includes('receipt')) return { icon: Receipt, accent: '#10b981' };
  if (text.includes('loan') || text.includes('book')) return { icon: Wallet, accent: '#06b6d4' };
  if (text.includes('duration') || text.includes('avg') || text.includes('average'))
    return { icon: Timer, accent: '#8b5cf6' };
  if (text.includes('pending') || text.includes('remind') || text.includes('unassign') || text.includes('current'))
    return { icon: AlertCircle, accent: '#f59e0b' };
  if (text.includes('weighted') || text.includes('dpd')) return { icon: Clock, accent: '#f59e0b' };
  if (text.includes('segment') || text.includes('layer')) return { icon: Layers, accent: '#8b5cf6' };
  return { icon: Hash, accent: 'var(--theme-color)' };
}

function buildFilterParams(applied, slug, { isAgent = false } = {}) {
  const showDateRange = showDateRangeFor(slug);
  const advancedFields = new Set(getAdvancedFields(slug, { isAgent }));
  const params = {
    search: applied.search || undefined,
    clientId: applied.clientId || undefined,
  };
  // Agents are always self-scoped server-side — never send agentId/callCenterId.
  if (!isAgent) {
    params.agentId = applied.agentId || undefined;
  }
  if (showDateRange) {
    params.dateFrom = applied.dateFrom || undefined;
    params.dateTo = applied.dateTo || undefined;
  }
  for (const key of ALL_ADVANCED_KEYS) {
    if (!advancedFields.has(key)) continue;
    if (isAgent && (key === 'callCenterId' || key === 'assignmentStatus')) continue;
    const v = applied[key];
    if (v !== null && v !== undefined && v !== '') params[key] = v;
  }
  return params;
}

function ReportSkeleton() {
  return (
    <div className="rpt-skeleton-wrap">
      <div className="rpt-skel-row rpt-skel-row--kpi">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rpt-skel rpt-skel-kpi" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="rpt-skel rpt-skel-table" />
    </div>
  );
}

function ReportShell({ slug, icon: Icon }) {
  const { currencySymbol } = useSystemConfig();
  const { setActions } = usePageActions();
  const { isSystemAdmin, isSeniorSupervisor, isAgent, isSupervisor } = usePermissions();
  const { gate, loading: gateLoading, unlocking, unlock } = useReportGate(slug);
  const reportUnlocks = useAppSelector((state) => state.auth.reportUnlocks) ?? {};
  const storedUnlock = reportUnlocks[slug];
  const unlockToken =
    storedUnlock && new Date(storedUnlock.expiresAt).getTime() > Date.now()
      ? storedUnlock.token
      : null;

  const showCallCenter = Boolean(isSystemAdmin || isSeniorSupervisor) && !isAgent;

  const [filters, setFilters] = useState(() => defaultReportFilters(slug));
  const [applied, setApplied] = useState(() => defaultReportFilters(slug));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [clients, setClients] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const canLoad = Boolean(gate?.canRead && (!gate.requiresPassword || gate.unlocked));
  const activeFilterCount = countActiveReportFilters(applied, slug, { isAgent });

  useEffect(() => {
    const next = defaultReportFilters(slug);
    setFilters(next);
    setApplied(next);
    setPage(1);
    setReport(null);
  }, [slug]);

  useEffect(() => {
    if (isAgent) {
      fetchAgentPortfolioClients()
        .then((rows) => setClients(Array.isArray(rows) ? rows : []))
        .catch(() => setClients([]));
      setAgents([]);
      return undefined;
    }
    fetchClients()
      .then((rows) => setClients(Array.isArray(rows) ? rows : rows?.items || []))
      .catch(() => setClients([]));
    fetchAgents()
      .then((rows) => setAgents(Array.isArray(rows) ? rows : rows?.items || []))
      .catch(() => setAgents([]));
    return undefined;
  }, [isAgent]);

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const params = {
        ...buildFilterParams(applied, slug, { isAgent }),
        page,
        pageSize,
      };
      const data = await fetchReportData(slug, params, unlockToken);
      setReport(data);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 && error?.response?.data?.requiresPassword) {
        toast.error('Report password required');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to load report');
      }
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [applied, canLoad, isAgent, page, pageSize, slug, unlockToken]);

  useEffect(() => {
    load();
  }, [load]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = buildFilterParams(applied, slug, { isAgent });
      await downloadReportExport(slug, params, unlockToken);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [applied, isAgent, slug, unlockToken]);

  useEffect(() => {
    if (!canLoad && !gateLoading) {
      setActions(null);
      return () => setActions(null);
    }
    setActions(
      <>
        <button
          type="button"
          className="btn-icon-outline"
          aria-label="Refresh"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={`icon-sm${loading ? ' animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          className="rpt-filter-trigger-btn"
          onClick={() => {
            setFilters(applied);
            setFiltersOpen(true);
          }}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="icon-sm" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rpt-filter-trigger-badge">{activeFilterCount}</span>
          )}
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={onExport}
          disabled={exporting || !report?.total}
        >
          <Download className="icon-sm" />
          {exporting ? 'Exporting…' : 'Export as CSV'}
        </button>
      </>
    );
    return () => setActions(null);
  }, [
    setActions,
    canLoad,
    gateLoading,
    loading,
    exporting,
    activeFilterCount,
    applied,
    report,
    load,
    onExport,
  ]);

  const handleApplyFilters = useCallback(
    (incoming) => {
      const next = incoming ?? filters;
      setApplied(next);
      setPage(1);
      setFiltersOpen(false);
    },
    [filters]
  );

  const summary = report?.summary || [];
  const columns = report?.columns || [];
  const rows = report?.rows || [];
  const total = Number(report?.total) || 0;
  const currentPage = Number(report?.page) || page;
  const currentPageSize = Number(report?.pageSize) || pageSize;
  const totalPages = Math.max(1, Math.ceil(total / currentPageSize) || 1);
  const rowOffset = (currentPage - 1) * currentPageSize;

  return (
    <div className="space-y-6 min-h-[50vh]">
      {gateLoading ? (
        <div className="rpt-loading">
          <div className="rpt-loading-spinner" />
          <p>Checking access…</p>
        </div>
      ) : !canLoad ? (
        <ReportGatePanel gate={gate} unlocking={unlocking} onUnlock={unlock} />
      ) : (
        <>
          {loading && !report ? (
            <ReportSkeleton />
          ) : (
            <>
              {isAgent && (
                <p className="rpt-agent-scope-note">
                  Showing only your assigned cases and activity.
                </p>
              )}
              {isSupervisor && !isAgent && !isSystemAdmin && !isSeniorSupervisor && (
                <p className="rpt-agent-scope-note">
                  Showing data for your call center only.
                </p>
              )}
              {summary.length > 0 && (
                <div className="rpt-kpi-scroll" role="list" aria-label="Summary metrics">
                  {summary.map((item, i) => {
                    const meta = getKpiMeta(item.key, item.label);
                    const isNumeric = item.format === 'number';
                    const isPercent = item.format === 'percent';
                    const isMoney = item.format === 'money';
                    return (
                      <div key={item.key} className="rpt-kpi-card" role="listitem">
                        <StatCard
                          icon={meta.icon}
                          numericValue={
                            isNumeric || isPercent || isMoney ? Number(item.value) || 0 : undefined
                          }
                          value={
                            !isNumeric && !isPercent && !isMoney
                              ? formatCell(item.value, item.format, currencySymbol)
                              : undefined
                          }
                          decimals={isPercent ? 1 : 0}
                          suffix={isPercent ? '%' : ''}
                          label={item.label}
                          accent={meta.accent}
                          className="dashboard-stat-card"
                          style={{ '--card-index': i }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rpt-table-card">
                <div className="rpt-table-toolbar">
                  <div className="rpt-table-toolbar-left">
                    <h2 className="rpt-table-title">Results</h2>
                    <span className="rpt-table-count-badge">
                      {total.toLocaleString()}
                      {total > rows.length ? ` · showing ${rows.length.toLocaleString()}` : ''}
                    </span>
                  </div>
                  {loading && (
                    <div className="rpt-table-updating" aria-label="Updating…">
                      <div className="rpt-table-updating-spinner" />
                    </div>
                  )}
                </div>

                {rows.length === 0 ? (
                  <div className="empty-state-card rpt-empty">
                    <div className="empty-state-icon">
                      <Icon className="empty-state-icon-svg" />
                    </div>
                    <h2 className="empty-state-title">No results</h2>
                    <p className="empty-state-description">
                      {isAgent
                        ? 'No matching records in your assigned portfolio. Try adjusting the filters.'
                        : 'Try adjusting the filters to find matching records.'}
                    </p>
                  </div>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="rpt-table">
                      <thead>
                        <tr>
                          <th className="rpt-th-idx" aria-label="Row number">
                            #
                          </th>
                          {columns.map((col) => (
                            <th key={col.key} className={col.format ? `rpt-th--${col.format}` : ''}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => (
                          <tr key={row.id ?? rowIdx}>
                            <td className="rpt-td-idx">{rowOffset + rowIdx + 1}</td>
                            {columns.map((col) => (
                              <td
                                key={col.key}
                                className={
                                  col.format === 'money'
                                    ? 'rpt-cell--money'
                                    : col.format === 'percent'
                                      ? 'rpt-cell--percent'
                                      : ''
                                }
                              >
                                {formatCell(row[col.key], col.format, currencySymbol)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {total > 0 && (
                  <div className="cm-pagination rpt-pagination">
                    <div className="cm-pagination-size">
                      <label>
                        <span className="sr-only">Rows per page</span>
                        <select
                          className="cm-filter-select"
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(1);
                          }}
                        >
                          {[25, 50, 100].map((n) => (
                            <option key={n} value={n}>
                              {n} / page
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="cm-pagination-info">
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                      {' · '}
                      {total.toLocaleString()} record{total === 1 ? '' : 's'}
                    </p>
                    <div className="cm-pagination-controls">
                      <button
                        type="button"
                        className="cm-pagination-btn"
                        onClick={() => setPage(1)}
                        disabled={currentPage <= 1 || loading}
                        aria-label="First page"
                      >
                        <ChevronFirst className="icon-sm" />
                      </button>
                      <button
                        type="button"
                        className="cm-pagination-btn"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1 || loading}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="icon-sm" />
                      </button>
                      <button
                        type="button"
                        className="cm-pagination-btn"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages || loading}
                        aria-label="Next page"
                      >
                        <ChevronRight className="icon-sm" />
                      </button>
                      <button
                        type="button"
                        className="cm-pagination-btn"
                        onClick={() => setPage(totalPages)}
                        disabled={currentPage >= totalPages || loading}
                        aria-label="Last page"
                      >
                        <ChevronLast className="icon-sm" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {filtersOpen && (
        <div
          className="modal-backdrop modal-backdrop-static"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <div
            className="modal-panel rpt-filter-modal rpt-filter-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Report filters"
          >
            <div className="rpt-filter-modal-header">
              <div className="rpt-filter-modal-title-wrap">
                <span className="rpt-filter-modal-icon" aria-hidden="true">
                  <SlidersHorizontal className="icon-sm" />
                </span>
                <h2 className="rpt-filter-modal-title">Filters</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X className="icon-sm" />
              </button>
            </div>

            <div className="rpt-filter-modal-body">
              <ReportFilters
                slug={slug}
                filters={filters}
                onChange={setFilters}
                onApply={handleApplyFilters}
                clients={clients}
                agents={agents}
                showCallCenter={showCallCenter}
                isAgent={isAgent}
                busy={loading}
                modal
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportShell;
