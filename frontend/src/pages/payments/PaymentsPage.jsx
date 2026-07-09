import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  RefreshCw,
  Search,
  Filter,
  Download,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  TrendingDown,
  TrendingUp,
  Calculator,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { fetchPayments, fetchPaymentTotals } from '../../api/payments';
import { fetchClients } from '../../api/clients';
import { fetchDebtCategories } from '../../api/debtCategories';
import { fetchDebtorAgents } from '../../api/debtors';

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  clientId: '',
  debtCategoryId: '',
  agentName: '',
  source: '',
  dateFrom: '',
  dateTo: '',
};

const SOURCE_LABELS = {
  upload_delta: 'Upload Delta',
  upload_reversal: 'Reversal',
  backfill: 'Backfill',
};

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbol} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function PaymentsPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({
    total: 0, collected: 0, inflow: 0, reversals: 0,
    deltaCount: 0, reversalCount: 0, avgPayment: 0,
  });

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [clients, setClients] = useState([]);
  const [debtCategories, setDebtCategories] = useState([]);
  const [agents, setAgents] = useState([]);
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
      const [data, totals] = await Promise.all([
        fetchPayments({ page, pageSize, ...filterParams }),
        fetchPaymentTotals(filterParams),
      ]);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setHasMore(Boolean(data.hasMore));
      setStats(totals);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load payments');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, appliedFilters]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { load(); }, [load]);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '' && v != null).length,
    [appliedFilters]
  );

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleRefresh = () => {
    setSearch('');
    clearFilters();
    setPage(1);
    loadFilters();
    toast.info('Payments refreshed');
  };

  const handleExport = async () => {
    if (total === 0) {
      toast.info('Nothing to export');
      return;
    }
    setIsExporting(true);
    try {
      const allPages = Math.ceil(total / 200);
      const rows = [];
      for (let p = 1; p <= allPages; p += 1) {
        const data = await fetchPayments({ page: p, pageSize: 200, search: search.trim() || undefined, ...appliedFilters });
        rows.push(...(data.items || []));
      }
      if (rows.length === 0) {
        toast.info('Nothing to export');
        return;
      }
      const exportRows = rows.map((d, i) => ({
        '#': i + 1,
        Debtor: d.debtorName || '',
        Client: d.clientName || '',
        'Debt Category': d.debtCategoryName || '',
        Agent: d.agentName || '',
        'Previous Paid': d.previousTotalPaid || 0,
        'New Paid': d.newTotalPaid || 0,
        'Detected Amount': d.amount || 0,
        'Payment Date': formatDate(d.paymentDate),
        Source: SOURCE_LABELS[d.source] || d.source,
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payments');
      XLSX.writeFile(wb, `payments-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${exportRows.length} payment${exportRows.length === 1 ? '' : 's'} exported`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export payments');
    } finally {
      setIsExporting(false);
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
          aria-label="Export payments"
          onClick={handleExport}
          disabled={isExporting || total === 0}
          style={{ width: 'auto', paddingInline: '0.75rem', gap: '0.375rem' }}
        >
          <Download className="icon-sm" />
          Export
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, showFilters, activeFilterCount, isExporting, total]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="cm-page">
      <section className="cm-stat-grid">
        <StatCard
          icon={Wallet}
          numericValue={stats.inflow}
          label={`Collected (${currencySymbol})`}
          meta="Sum of detected inflows"
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={TrendingUp}
          numericValue={stats.deltaCount}
          label="Payments Detected"
          meta="Upload-delta events"
          accent="#06b6d4"
          variant="compact"
        />
        <StatCard
          icon={TrendingDown}
          numericValue={Math.abs(stats.reversals)}
          label={`Reversals (${currencySymbol})`}
          meta={`${stats.reversalCount} reversal event${stats.reversalCount === 1 ? '' : 's'}`}
          accent="#f59e0b"
          variant="compact"
        />
        <StatCard
          icon={Calculator}
          numericValue={stats.avgPayment}
          label={`Avg Payment (${currencySymbol})`}
          meta="Per detected inflow"
          accent="#6366f1"
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

            <div className="af-field">
              <span className="af-label">Source</span>
              <select
                className="af-select"
                value={filters.source}
                onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
              >
                <option value="">Filter by source</option>
                <option value="upload_delta">Upload Delta</option>
                <option value="upload_reversal">Reversal</option>
                <option value="backfill">Backfill</option>
              </select>
            </div>

            <div className="af-field af-field-range">
              <span className="af-label">Payment Date</span>
              <div className="af-range">
                <input
                  type="date"
                  className="af-input"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                />
                <span className="af-range-sep">to</span>
                <input
                  type="date"
                  className="af-input"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
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
        <SectionHeader icon={Wallet} title="Detected Payments" count={total} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by debtor, client, debt category or agent…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="cm-table-wrap pay-table-wrap">
          <table className="cm-table pay-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Debt Category</th>
                <th className="cm-th">Agent</th>
                <th className="cm-th cm-th-num cm-th-money">Previous Paid<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">New Paid<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Detected Amount<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th">Payment Date</th>
                <th className="cm-th">Source</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={10}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading payments…</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={10}>
                    <div className="cm-empty-state">
                      <Wallet className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No payments detected yet</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Payments are detected automatically when daily debtor uploads show an increase in amount repaid for a loan.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((d, idx) => (
                  <tr key={d.id} className="cm-table-row">
                    <td className="cm-td cm-td-index">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="cm-td">
                      <span className="cm-client-name">{d.debtorName || '—'}</span>
                    </td>
                    <td className="cm-td">
                      {d.clientName ? (
                        <span className="dm-client-link"><Building2 className="dm-client-icon" />{d.clientName}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td">{d.debtCategoryName || <span className="dm-muted">—</span>}</td>
                    <td className="cm-td">
                      {d.agentName ? (
                        <span className="dm-agent-cell"><span className="dm-agent-dot" aria-hidden="true" />{d.agentName}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(d.previousTotalPaid ?? 0, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(d.newTotalPaid ?? 0, currencySymbol)}</td>
                    <td className={`cm-td cm-td-num cm-money ${d.amount < 0 ? 'dm-outstanding' : 'cm-money--positive'}`}>
                      {formatMoney(d.amount, currencySymbol)}
                    </td>
                    <td className="cm-td">{formatDate(d.paymentDate)}</td>
                    <td className="cm-td">
                      <span className={`pay-source-pill pay-source-${d.source}`}>
                        {SOURCE_LABELS[d.source] || d.source}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-size">
              <label htmlFor="pay-page-size">Rows per page</label>
              <select id="pay-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} payment{total === 1 ? '' : 's'}
            </p>
            <div className="cm-pagination-controls">
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="First page">
                <ChevronFirst className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || hasMore} aria-label="Next page">
                <ChevronRight className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages || hasMore} aria-label="Last page">
                <ChevronLast className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentsPage;
