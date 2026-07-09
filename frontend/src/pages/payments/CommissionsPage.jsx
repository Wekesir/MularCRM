import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HandCoins,
  RefreshCw,
  Search,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  TrendingUp,
  Receipt,
  Wallet,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import CommissionPayoutModal from '../../components/CommissionPayoutModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  fetchCommissionSummary,
  fetchCommissionEarnings,
  fetchCommissionTotals,
  recordCommissionPayout,
} from '../../api/commissions';
import { fetchClients } from '../../api/clients';
import { fetchDebtCategories } from '../../api/debtCategories';
import { fetchDebtorAgents } from '../../api/debtors';

const EMPTY_FILTERS = {
  clientId: '',
  debtCategoryId: '',
  status: '',
  agentName: '',
  periodFrom: '',
  periodTo: '',
};

const STATUS_LABELS = {
  accrued: 'Accrued',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

const TIER_LABELS = {
  exact: 'Exact',
  client_default: 'Client default',
  global_default: 'Global default',
};

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbol} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPercent(rate) {
  const n = Number(rate) || 0;
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 2)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function CommissionsPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();
  const { isSystemAdmin } = usePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState([]);
  const [stats, setStats] = useState({ accrued: 0, invoiced: 0, paid: 0, outstanding: 0, collected: 0, commission: 0, earningCount: 0 });

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [clients, setClients] = useState([]);
  const [debtCategories, setDebtCategories] = useState([]);
  const [agents, setAgents] = useState([]);

  const [detailTarget, setDetailTarget] = useState(null);
  const [payoutTarget, setPayoutTarget] = useState(null);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadFilters = useCallback(async () => {
    try {
      const [c, dc, a] = await Promise.all([
        fetchClients(),
        fetchDebtCategories(),
        fetchDebtorAgents(),
      ]);
      setClients(c);
      setDebtCategories(dc);
      setAgents(a);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load filter options');
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const filterParams = { search: search.trim() || undefined, ...appliedFilters };
      const [s, t] = await Promise.all([
        fetchCommissionSummary(filterParams),
        fetchCommissionTotals(filterParams),
      ]);
      setSummary(s || []);
      setStats(t);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load commissions');
    } finally {
      setIsLoading(false);
    }
  }, [search, appliedFilters]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { load(); }, [load]);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '' && v != null).length,
    [appliedFilters]
  );

  const applyFilters = () => {
    setAppliedFilters(filters);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const handleRefresh = () => {
    setSearch('');
    clearFilters();
    loadFilters();
    toast.info('Commissions refreshed');
  };

  const filteredSummary = useMemo(() => {
    if (!search.trim()) return summary;
    const q = search.toLowerCase();
    return summary.filter((r) =>
      (r.clientName || '').toLowerCase().includes(q) ||
      (r.debtCategoryName || '').toLowerCase().includes(q)
    );
  }, [summary, search]);

  const handleExport = async () => {
    if (filteredSummary.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = filteredSummary.map((r, i) => ({
        '#': i + 1,
        Client: r.clientName || '',
        'Debt Category': r.debtCategoryName || '',
        Collected: r.collected || 0,
        'Commission Earned': r.commissionEarned || 0,
        Accrued: r.accrued || 0,
        Invoiced: r.invoiced || 0,
        Paid: r.paid || 0,
        Outstanding: r.outstanding || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Commissions');
      XLSX.writeFile(wb, `commissions-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${exportRows.length} row${exportRows.length === 1 ? '' : 's'} exported`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export commissions');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRecordPayout = async (payload) => {
    setIsSavingPayout(true);
    try {
      const result = await recordCommissionPayout(payload);
      toast.success(
        `Payout of ${currencySymbol} ${Number(payload.amount).toLocaleString()} recorded — ${result.appliedCount} earning(s) settled`
      );
      setPayoutTarget(null);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payout');
    } finally {
      setIsSavingPayout(false);
    }
  };

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
          <RefreshCw className="icon-sm" />
        </button>
        <button
          type="button"
          className={`btn-icon-outline${showFilters ? ' btn-icon-outline--active' : ''}`}
          aria-label="Toggle filters"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          style={{ position: 'relative', width: 'auto', paddingInline: '0.75rem', gap: '0.375rem' }}
        >
          <Filter className="icon-sm" />
          Filters
          {activeFilterCount > 0 && (
            <span className="cfm-funnel-count" style={{ position: 'absolute', top: '-6px', right: '-6px' }}>
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="btn-icon-outline"
          aria-label="Export commissions"
          onClick={handleExport}
          disabled={isExporting || filteredSummary.length === 0}
          style={{ width: 'auto', paddingInline: '0.75rem', gap: '0.375rem' }}
        >
          <Download className="icon-sm" />
          Export
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, showFilters, activeFilterCount, isExporting, filteredSummary.length]);

  return (
    <div className="cm-page">
      <section className="cm-stat-grid">
        <StatCard
          icon={TrendingUp}
          numericValue={stats.accrued}
          label={`Accrued (${currencySymbol})`}
          meta="Earned, not yet invoiced"
          accent="#06b6d4"
          variant="compact"
        />
        <StatCard
          icon={Receipt}
          numericValue={stats.invoiced}
          label={`Invoiced (${currencySymbol})`}
          meta="Invoiced to clients"
          accent="#6366f1"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          numericValue={stats.paid}
          label={`Collected from Clients (${currencySymbol})`}
          meta="Payouts received"
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={HandCoins}
          numericValue={stats.outstanding}
          label={`Outstanding (${currencySymbol})`}
          meta="Accrued + invoiced, unpaid"
          accent="#f59e0b"
          variant="compact"
        />
      </section>

      {showFilters && (
        <div className="cfm-filter-panel">
          <div className="cfm-filter-grid">
            <div className="af-field">
              <span className="af-label">Client</span>
              <select
                className="af-select"
                value={filters.clientId}
                onChange={(e) => setFilters((p) => ({ ...p, clientId: e.target.value }))}
              >
                <option value="">Filter by client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="af-field">
              <span className="af-label">Debt Category</span>
              <select
                className="af-select"
                value={filters.debtCategoryId}
                onChange={(e) => setFilters((p) => ({ ...p, debtCategoryId: e.target.value }))}
              >
                <option value="">Filter by debt category</option>
                {debtCategories.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="af-field">
              <span className="af-label">Status</span>
              <select
                className="af-select"
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="">Filter by status</option>
                <option value="accrued">Accrued</option>
                <option value="invoiced">Invoiced</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="af-field">
              <span className="af-label">Agent</span>
              <select
                className="af-select"
                value={filters.agentName}
                onChange={(e) => setFilters((p) => ({ ...p, agentName: e.target.value }))}
              >
                <option value="">Filter by agent</option>
                {agents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="af-field af-field-range">
              <span className="af-label">Period (month)</span>
              <div className="af-range">
                <input
                  type="month"
                  className="af-input"
                  value={filters.periodFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, periodFrom: e.target.value }))}
                />
                <span className="af-range-sep">to</span>
                <input
                  type="month"
                  className="af-input"
                  value={filters.periodTo}
                  onChange={(e) => setFilters((p) => ({ ...p, periodTo: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="af-actions">
            <button type="button" className="btn-icon-outline af-clear-btn" onClick={clearFilters}>
              Clear All
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={applyFilters}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      <div className="cm-table-card">
        <SectionHeader icon={HandCoins} title="Commission by Client × Debt Category" count={filteredSummary.length} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by client or debt category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="cm-table-wrap com-table-wrap">
          <table className="cm-table com-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Debt Category</th>
                <th className="cm-th cm-th-num cm-th-money">Collected<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Commission Earned<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Accrued<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Invoiced<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Paid<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Outstanding<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={10}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading commissions…</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSummary.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={10}>
                    <div className="cm-empty-state">
                      <HandCoins className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No commission earnings yet</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Commission earnings appear here once payments are detected from daily debtor uploads.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSummary.map((r, idx) => (
                  <tr key={`${r.clientId}-${r.debtCategoryId}`} className="cm-table-row">
                    <td className="cm-td cm-td-index">{idx + 1}</td>
                    <td className="cm-td">
                      {r.clientName ? (
                        <span className="dm-client-link"><Building2 className="dm-client-icon" />{r.clientName}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td">{r.debtCategoryName || <span className="dm-muted">—</span>}</td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(r.collected, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money cm-money--positive">{formatMoney(r.commissionEarned, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(r.accrued, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(r.invoiced, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money cm-money--positive">{formatMoney(r.paid, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money dm-outstanding">{formatMoney(r.outstanding, currencySymbol)}</td>
                    <td className="cm-td cm-td-actions">
                      <div className="cm-action-group">
                        <button
                          type="button"
                          className="cm-action-btn"
                          aria-label="View earnings"
                          title="View earnings"
                          onClick={() => setDetailTarget(r)}
                        >
                          <Eye className="cm-action-icon" />
                        </button>
                        {isSystemAdmin && (
                          <button
                            type="button"
                            className="cm-action-btn cm-action-btn-primary"
                            aria-label="Record payout"
                            title="Record payout"
                            onClick={() => setPayoutTarget(r)}
                            disabled={r.outstanding <= 0}
                          >
                            <Wallet className="cm-action-icon" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredSummary.length > 0 && (
          <p className="cm-table-footer">
            Showing <strong>{filteredSummary.length}</strong> client × debt category combination{filteredSummary.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <CommissionEarningsModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        currencySymbol={currencySymbol}
      />

      <CommissionPayoutModal
        open={Boolean(payoutTarget)}
        onClose={() => setPayoutTarget(null)}
        target={payoutTarget}
        currencySymbol={currencySymbol}
        onConfirm={handleRecordPayout}
        isSaving={isSavingPayout}
      />
    </div>
  );
}

// Detail modal: paginated earning rows for a single (client × debt category).
function CommissionEarningsModal({ target, onClose, currencySymbol }) {
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchCommissionEarnings({
          page,
          pageSize,
          clientId: target.clientId,
          debtCategoryId: target.debtCategoryId,
        });
        if (cancelled) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
      } catch {
        if (!cancelled) toast.error('Failed to load earnings');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [target, page, pageSize]);

  if (!target) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div className="modal-panel cf-panel com-earnings-panel" role="dialog" aria-modal="true">
        <div className="cf-accent-strip" aria-hidden="true" />
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <HandCoins className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 className="cf-title">Commission Earnings</h2>
              <p className="cf-subtitle">
                {target.clientName}
                {target.debtCategoryName && target.debtCategoryName !== 'All categories'
                  ? ` · ${target.debtCategoryName}`
                  : ''}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body com-earnings-body">
          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th className="cm-th cm-th-index">#</th>
                  <th className="cm-th">Debtor</th>
                  <th className="cm-th">Payment Date</th>
                  <th className="cm-th cm-th-num cm-th-money">Collected<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                  <th className="cm-th">Rate Tier</th>
                  <th className="cm-th cm-th-num">Rate</th>
                  <th className="cm-th cm-th-num cm-th-money">Commission<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                  <th className="cm-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={8}>
                      <div className="cm-empty-state">
                        <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                        <p className="cm-empty-title">Loading earnings…</p>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={8}>
                      <div className="cm-empty-state">
                        <p className="cm-empty-title">No earnings for this combination</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((e, idx) => (
                    <tr key={e.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{(currentPage - 1) * pageSize + idx + 1}</td>
                      <td className="cm-td"><span className="cm-client-name">{e.debtorName || '—'}</span></td>
                      <td className="cm-td">{formatDate(e.paymentDate)}</td>
                      <td className="cm-td cm-td-num cm-money">{formatMoney(e.collectedAmount, currencySymbol)}</td>
                      <td className="cm-td">
                        <span className={`com-tier-pill com-tier-${e.rateTier}`}>{TIER_LABELS[e.rateTier] || e.rateTier}</span>
                      </td>
                      <td className="cm-td cm-td-num">{formatPercent(e.rateApplied)}</td>
                      <td className="cm-td cm-td-num cm-money cm-money--positive">{formatMoney(e.commissionAmount, currencySymbol)}</td>
                      <td className="cm-td">
                        <span className={`com-status-pill com-status-${e.status}`}>{STATUS_LABELS[e.status] || e.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {total > pageSize && (
          <div className="cf-footer com-earnings-footer">
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} earnings
            </p>
            <div className="cm-pagination-controls">
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                <ChevronRight className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CommissionsPage;
