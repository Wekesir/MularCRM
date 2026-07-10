import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Briefcase,
  ArrowLeft,
  Filter,
  Plus,
  Search,
  Eye,
  Download,
  RefreshCw,
  FileText,
  Building2,
  UsersRound,
  Wallet,
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';
import { usePageActions } from '../context/PageActionsContext';
import { usePageHeaderSticky } from '../context/PageHeaderStickyContext';
import { useSystemConfig } from '../context/SystemConfigContext';
import { usePermissions } from '../hooks/usePermissions';
import { fetchCaseSummary, fetchClientFiles } from '../api/caseManagement';
import AssignCasesModal from '../components/AssignCasesModal';

const PAGE_SIZE = 10;

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  return `${symbol} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatMoneyDecimals(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function assignmentPct(file) {
  const total = (file.assignedCases || 0) + (file.unassignedCases || 0);
  if (!total) return 0;
  return Math.round((file.assignedCases / total) * 100);
}

const EMPTY_FILTERS = { assignment: '', minDebtors: '', minAmount: '' };

function ClientFilesPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const { canAssignCases } = usePermissions();
  const isDocked = !headerInView;

  const [client, setClient] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [assignFile, setAssignFile] = useState(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [summary, clientFiles] = await Promise.all([
        fetchCaseSummary(),
        fetchClientFiles(clientId),
      ]);
      setClient(summary.find((c) => String(c.clientId) === String(clientId)) || null);
      setFiles(clientFiles);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load client files');
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
    loadAll();
    toast.info('File list refreshed');
  };

  useEffect(() => {
    setActions(
      <button
        type="button"
        className="btn-icon-outline"
        aria-label="Refresh"
        onClick={handleRefresh}
      >
        <RefreshCw className="icon-sm" />
      </button>
    );
    return () => setActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActions, clientId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const f = appliedFilters;
    return files.filter((file) => {
      if (q) {
        const hay = `${file.fileName || ''} #${file.id} ${file.clientName || ''} ${file.debtCategoryName || ''} ${file.debtTypeName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.assignment === 'full' && assignmentPct(file) < 100) return false;
      if (f.assignment === 'partial' && (assignmentPct(file) === 0 || assignmentPct(file) >= 100)) return false;
      if (f.assignment === 'none' && assignmentPct(file) > 0) return false;
      if (f.minDebtors && file.importedCount < Number(f.minDebtors)) return false;
      if (f.minAmount && file.loanTotal < Number(f.minAmount)) return false;
      return true;
    });
  }, [files, search, appliedFilters]);

  useEffect(() => { setPage(1); }, [search, appliedFilters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const stats = useMemo(() => {
    const totalDebtors = files.reduce((s, f) => s + (f.importedCount || 0), 0);
    const totalAmount = files.reduce((s, f) => s + (f.loanTotal || 0), 0);
    const assigned = files.reduce((s, f) => s + (f.assignedCases || 0), 0);
    const totalCases = files.reduce((s, f) => s + (f.assignedCases || 0) + (f.unassignedCases || 0), 0);
    const avgAssignment = totalCases > 0 ? Math.round((assigned / totalCases) * 100) : 0;
    return { fileCount: files.length, totalDebtors, totalAmount, avgAssignment };
  }, [files]);

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

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    const rows = filtered.map((f, i) => ({
      '#': i + 1,
      'Batch Name': f.fileName || `Batch #${f.id}`,
      'Client Name': f.clientName || '',
      'Number of Debtors': f.importedCount || 0,
      'Assignment %': assignmentPct(f),
      'Assigned Cases': f.assignedCases || 0,
      'Unassigned Cases': f.unassignedCases || 0,
      'Total Amount': f.loanTotal || 0,
      'Uploaded By': f.uploadedByName || '',
      'Uploaded On': f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Files');
    XLSX.writeFile(wb, `client-${clientId}-files-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} file${rows.length === 1 ? '' : 's'} exported`);
  };

  const viewFileDebtors = (file) => {
    navigate(`/case-management/clients/${clientId}/files/${file.id}/cases`);
  };

  const notImplemented = (label) => {
    toast.info(`${label} workflow is being finalized. Check back soon.`);
  };

  const clientName = client?.clientName || files[0]?.clientName || 'Client';

  return (
    <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
      {/* Stat cards */}
      <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
        <StatCard icon={FileText} numericValue={stats.fileCount} label="Batch Files" meta="Imported for this client" accent="#6366f1" variant="compact" />
        <StatCard icon={UsersRound} numericValue={stats.totalDebtors} label="Total Debtors" meta="Across all batches" accent="#06b6d4" variant="compact" />
        <StatCard icon={CheckCircle2} numericValue={stats.avgAssignment} suffix="%" label="Avg Assignment" meta="Cases handed to agents" accent="#10b981" variant="compact" />
        <StatCard icon={Wallet} numericValue={stats.totalAmount} label={`Portfolio (${currencySymbol})`} meta="Total debt under collection" accent="#f59e0b" variant="compact" />
      </section>

      {/* Top action bar */}
      <div className="cfm-top-bar">
        <div className="cfm-top-bar-left">
          <button
            type="button"
            className="cfm-btn-back"
            onClick={() => navigate('/case-management')}
          >
            <ArrowLeft className="icon-sm" />
            Back to Clients
          </button>
          <button
            type="button"
            className={`cfm-btn-funnel${showFilters ? ' cfm-btn-funnel--active' : ''}${activeFilterCount > 0 ? ' cfm-btn-funnel--has' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <Filter className="icon-sm" />
            Apply Filters
            {activeFilterCount > 0 && <span className="cfm-funnel-count">{activeFilterCount}</span>}
          </button>
        </div>
        <div className="cfm-top-bar-right">
          {canAssignCases && (
            <button
              type="button"
              className="cfm-btn-new"
              onClick={() => notImplemented('New case assignment')}
            >
              <Plus className="icon-sm" />
              New Case Assignment
            </button>
          )}
        </div>
      </div>

      {/* Advanced filter panel */}
      {showFilters && (
        <div className="cfm-filter-panel">
          <div className="cfm-filter-grid">
            <div className="af-field">
              <span className="af-label">Assignment</span>
              <select
                className="af-select"
                value={filters.assignment}
                onChange={(e) => setFilters((p) => ({ ...p, assignment: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="full">Fully assigned (100%)</option>
                <option value="partial">Partially assigned</option>
                <option value="none">Unassigned (0%)</option>
              </select>
            </div>
            <div className="af-field">
              <span className="af-label">Min Debtors</span>
              <input
                type="number"
                min="0"
                className="af-input"
                placeholder="0"
                value={filters.minDebtors}
                onChange={(e) => setFilters((p) => ({ ...p, minDebtors: e.target.value }))}
              />
            </div>
            <div className="af-field">
              <span className="af-label">Min Total Amount</span>
              <input
                type="number"
                min="0"
                className="af-input"
                placeholder="0"
                value={filters.minAmount}
                onChange={(e) => setFilters((p) => ({ ...p, minAmount: e.target.value }))}
              />
            </div>
          </div>
          <div className="cfm-filter-actions">
            <button type="button" className="btn-icon-outline af-clear-btn" onClick={clearFilters}>
              <X className="icon-sm" /> Clear all
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={applyFilters}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="cm-table-card">
        <SectionHeader icon={Briefcase} title={clientName} count={filtered.length} />

        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by batch name, client, category or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cfm-toolbar-actions">
            <button
              type="button"
              className="cfm-utility-btn"
              onClick={handleRefresh}
              aria-label="Refresh view"
            >
              <Eye className="icon-sm" />
              <span>View</span>
            </button>
            <button
              type="button"
              className="cfm-utility-btn"
              onClick={handleExport}
              aria-label="Export files"
            >
              <Download className="icon-sm" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="cm-table-wrap">
          <table className="cm-table cm-table--case-files">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Batch Name</th>
                <th className="cm-th">Client Name</th>
                <th className="cm-th cm-th-num">Number of Debtors</th>
                <th className="cm-th cm-th-num">Assignment %</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Total Amount<br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={7}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading files…</p>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={7}>
                    <div className="cm-empty-state">
                      <FileText className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No batch files for this client</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Bulk-upload a CSV from Debtor Management to create a batch file here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((f, idx) => {
                  const pct = assignmentPct(f);
                  return (
                    <tr key={f.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{pageStart + idx + 1}</td>
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="cfm-batch-avatar" aria-hidden="true">
                            <FileText className="cm-client-avatar-icon" />
                          </span>
                          <div>
                            <p className="cfm-batch-name">{f.fileName || `Batch #${f.id}`}</p>
                            <p className="cm-client-type dm-cfid-sub">
                              <code className="dm-cfid-badge dm-cfid-badge--sm">#{f.id}</code>
                              {f.isClosed && <span className="cfm-closed-tag">Closed</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="cm-td dm-td-client">
                        {f.clientName ? (
                          <span className="dm-client-link">
                            <Building2 className="dm-client-icon" />
                            {f.clientName}
                          </span>
                        ) : (<span className="dm-muted">—</span>)}
                      </td>
                      <td className="cm-td cm-td-num">
                        <span className="cfm-debtor-count">{(f.importedCount || 0).toLocaleString()}</span>
                      </td>
                      <td className="cm-td cm-td-num">
                        <div className="cfm-assign-cell">
                          <div className="cfm-assign-track" aria-hidden="true">
                            <div
                              className={`cfm-assign-bar${pct >= 100 ? ' cfm-assign-bar--complete' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`cfm-assign-pct${pct >= 100 ? ' cfm-assign-pct--complete' : pct === 0 ? ' cfm-assign-pct--none' : ''}`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="cm-td cm-td-num cm-money">{formatMoneyDecimals(f.loanTotal)}</td>
                      <td className="cm-td cm-td-actions">
                        <div className="cfm-row-actions">
                          {canAssignCases && (
                            <button
                              type="button"
                              className="cfm-pill-btn cfm-pill-btn--assign"
                              onClick={() => setAssignFile(f)}
                            >
                              Assign
                            </button>
                          )}
                          <button
                            type="button"
                            className="cfm-pill-btn cfm-pill-btn--view"
                            onClick={() => viewFileDebtors(f)}
                            aria-label={`View files in ${f.fileName || `batch #${f.id}`}`}
                          >
                            View Files
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && filtered.length > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-size">
              <label htmlFor="cfm-page-size">Rows per page</label>
              <select
                id="cfm-page-size"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </p>
            <div className="cm-pagination-controls">
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="First page">
                <ChevronFirst className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                <ChevronRight className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} aria-label="Last page">
                <ChevronLast className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AssignCasesModal
        open={Boolean(assignFile)}
        file={assignFile}
        onClose={() => setAssignFile(null)}
        onChanged={loadAll}
      />
    </div>
  );
}

export default ClientFilesPage;
