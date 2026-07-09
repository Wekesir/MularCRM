import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  RefreshCw,
  Search,
  Filter,
  Download,
  Eye,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  Phone,
  User,
  Wallet,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import DebtorHistoryModal from '../../components/DebtorHistoryModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import {
  fetchClosedDebtors,
  fetchClosureReasons,
  fetchClosedDebtorsForExport,
  fetchClosedDebtorTotals,
} from '../../api/closedFiles';
import { fetchClients } from '../../api/clients';
import { fetchDebtorFiles, fetchDebtorAgents } from '../../api/debtors';

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  clientId: '',
  fileId: '',
  agent: '',
  closureReason: '',
  closedFrom: '',
  closedTo: '',
  lastContactedFrom: '',
  lastContactedTo: '',
};

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  return `${symbol} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function ClosedFilesPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({ total: 0, loanAmount: 0, totalPaid: 0, outstanding: 0 });

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [clients, setClients] = useState([]);
  const [batchFiles, setBatchFiles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [closureReasons, setClosureReasons] = useState([]);

  const [historyDebtor, setHistoryDebtor] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadFilters = useCallback(async () => {
    try {
      const [c, f, a, r] = await Promise.all([
        fetchClients(),
        fetchDebtorFiles(),
        fetchDebtorAgents(),
        fetchClosureReasons(),
      ]);
      setClients(c);
      setBatchFiles(f);
      setAgents(a);
      setClosureReasons(r);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load filter options');
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const filterParams = {
        search: search.trim() || undefined,
        ...appliedFilters,
      };
      const [data, totals] = await Promise.all([
        fetchClosedDebtors({ page, pageSize, ...filterParams }),
        fetchClosedDebtorTotals(filterParams),
      ]);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setHasMore(Boolean(data.hasMore));
      setStats(totals);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load closed files');
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
    toast.info('Closed files refreshed');
  };

  const handleExport = async () => {
    if (total === 0) {
      toast.info('Nothing to export');
      return;
    }
    setIsExporting(true);
    try {
      const rows = await fetchClosedDebtorsForExport({
        search: search.trim() || undefined,
        ...appliedFilters,
      });
      if (rows.length === 0) {
        toast.info('Nothing to export');
        return;
      }
      const exportRows = rows.map((d, i) => ({
        '#': i + 1,
        'Debtor': d.name || '',
        'Client': d.clientName || '',
        'CFID': d.cfid || '',
        'Phone': d.phone || '',
        'Assigned Agent': d.assignedAgent || '',
        'Loan Amount': d.loanAmount || 0,
        'Total Paid': d.totalPaid || 0,
        'Outstanding Balance': d.outstandingBalance || 0,
        'Closure Reason': d.closureReason || '',
        'Closed Date': formatDate(d.closedAt),
        'Last Contacted': formatDate(d.lastContactedAt),
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Closed Files');
      XLSX.writeFile(wb, `closed-files-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${exportRows.length} closed case${exportRows.length === 1 ? '' : 's'} exported`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export closed files');
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
          aria-label="Export closed files"
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

  const recoveryRate = stats.loanAmount > 0
    ? Math.round((stats.totalPaid / stats.loanAmount) * 100)
    : 0;

  return (
    <div className="cm-page">
      {/* ── Stat Cards ── */}
      <section className="cm-stat-grid">
        <StatCard
          icon={Archive}
          numericValue={stats.total}
          label="Closed Cases"
          meta="Cases closed for any reason"
          accent="#6366f1"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          numericValue={stats.loanAmount}
          label={`Portfolio Value (${currencySymbol})`}
          meta="Total loan amount closed"
          accent="#06b6d4"
          variant="compact"
        />
        <StatCard
          icon={TrendingUp}
          numericValue={stats.totalPaid}
          label={`Collected (${currencySymbol})`}
          meta={`Before closure`}
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={AlertCircle}
          numericValue={stats.outstanding}
          label={`Outstanding (${currencySymbol})`}
          meta={`${recoveryRate}% recovered`}
          accent="#f59e0b"
          variant="compact"
        />
      </section>

      {/* Filter panel */}
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
              <span className="af-label">Portfolio Batch Files</span>
              <select
                className="af-select"
                value={filters.fileId}
                onChange={(e) => setFilters((p) => ({ ...p, fileId: e.target.value }))}
              >
                <option value="">Batch files</option>
                {batchFiles.map((f) => (
                  <option key={f.id} value={f.id}>{f.fileName || `Batch #${f.id}`}</option>
                ))}
              </select>
            </div>

            <div className="af-field">
              <span className="af-label">Agent</span>
              <select
                className="af-select"
                value={filters.agent}
                onChange={(e) => setFilters((p) => ({ ...p, agent: e.target.value }))}
              >
                <option value="">Filter by agent</option>
                {agents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="af-field">
              <span className="af-label">Closure Reason</span>
              <select
                className="af-select"
                value={filters.closureReason}
                onChange={(e) => setFilters((p) => ({ ...p, closureReason: e.target.value }))}
              >
                <option value="">Filter by closure reason</option>
                {closureReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="af-field af-field-range">
              <span className="af-label">Closed Date</span>
              <div className="af-range">
                <input
                  type="date"
                  className="af-input"
                  value={filters.closedFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, closedFrom: e.target.value }))}
                />
                <span className="af-range-sep">to</span>
                <input
                  type="date"
                  className="af-input"
                  value={filters.closedTo}
                  onChange={(e) => setFilters((p) => ({ ...p, closedTo: e.target.value }))}
                />
              </div>
            </div>

            <div className="af-field af-field-range">
              <span className="af-label">Last Contacted Date</span>
              <div className="af-range">
                <input
                  type="date"
                  className="af-input"
                  value={filters.lastContactedFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, lastContactedFrom: e.target.value }))}
                />
                <span className="af-range-sep">to</span>
                <input
                  type="date"
                  className="af-input"
                  value={filters.lastContactedTo}
                  onChange={(e) => setFilters((p) => ({ ...p, lastContactedTo: e.target.value }))}
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

      {/* Table card */}
      <div className="cm-table-card">
        <SectionHeader icon={Archive} title="Closed Files" count={total} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search closed cases by debtor, client, CFID, phone or agent…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="cm-table-wrap clf-table-wrap">
          <table className="cm-table clf-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">CFID</th>
                <th className="cm-th">Phone</th>
                <th className="cm-th">Assigned Agent</th>
                <th className="cm-th cm-th-num cm-th-money">Loan Amount<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Total Paid<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th cm-th-num cm-th-money">Outstanding<br /><span className="cm-th-currency">({currencySymbol})</span></th>
                <th className="cm-th">Closure Reason</th>
                <th className="cm-th cm-th-view">View</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={11}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading closed files…</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={11}>
                    <div className="cm-empty-state">
                      <Archive className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No closed cases found</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Cases that have been closed will be listed here with their closure reason.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((d, idx) => (
                  <tr key={d.id} className="cm-table-row">
                    <td className="cm-td cm-td-index">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="dm-debtor-avatar" aria-hidden="true"><User className="cm-client-avatar-icon" /></span>
                        <div>
                          <p className="cm-client-name clf-debtor-link">{d.name}</p>
                          <p className="cm-client-type dm-cfid-sub">{d.cfid}</p>
                        </div>
                      </div>
                    </td>
                    <td className="cm-td dm-td-client">
                      {d.clientName ? (
                        <span className="dm-client-link"><Building2 className="dm-client-icon" />{d.clientName}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td dm-td-cfid"><code className="dm-cfid-badge">{d.cfid}</code></td>
                    <td className="cm-td dm-td-phone">
                      {d.phone ? (
                        <span className="dm-phone-cell"><Phone className="dm-phone-icon" />{d.phone}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td dm-td-agent">
                      {d.assignedAgent ? (
                        <span className="dm-agent-cell"><span className="dm-agent-dot" aria-hidden="true" />{d.assignedAgent}</span>
                      ) : (<span className="dm-unassigned">Unassigned</span>)}
                    </td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(d.loanAmount, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money cm-money--positive">{formatMoney(d.totalPaid, currencySymbol)}</td>
                    <td className="cm-td cm-td-num cm-money dm-outstanding">{formatMoney(d.outstandingBalance, currencySymbol)}</td>
                    <td className="cm-td">
                      {d.closureReason ? (
                        <span className="clf-reason-pill">{d.closureReason}</span>
                      ) : (<span className="dm-muted">—</span>)}
                    </td>
                    <td className="cm-td cm-td-view">
                      <button
                        type="button"
                        className="cm-contact-btn"
                        onClick={() => setHistoryDebtor(d)}
                        aria-label={`View history for ${d.name}`}
                      >
                        <Eye className="cm-contact-btn-icon" /><span>View</span>
                      </button>
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
              <label htmlFor="clf-page-size">Rows per page</label>
              <select id="clf-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} closed case{total === 1 ? '' : 's'}
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

      <DebtorHistoryModal debtor={historyDebtor} onClose={() => setHistoryDebtor(null)} />
    </div>
  );
}

export default ClosedFilesPage;
