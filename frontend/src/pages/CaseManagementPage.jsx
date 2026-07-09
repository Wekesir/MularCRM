import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  RefreshCw,
  Building2,
  Search,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';
import { usePageActions } from '../context/PageActionsContext';
import { usePageHeaderSticky } from '../context/PageHeaderStickyContext';
import { useSystemConfig } from '../context/SystemConfigContext';
import { fetchCaseSummary } from '../api/caseManagement';

const PAGE_SIZE = 10;

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function CaseManagementPage() {
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const isDocked = !headerInView;
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCaseSummary();
      setRows(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load case summary');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = () => {
    setSearch('');
    setPage(1);
    loadSummary();
    toast.info('Case list refreshed');
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
  }, [setActions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => String(r.clientName || '').toLowerCase().includes(q));
  }, [rows, search]);

  // Reset to first page whenever the filtered set or page size changes.
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const stats = useMemo(() => {
    const totalFiles = rows.reduce((s, r) => s + (r.totalFiles || 0), 0);
    const totalCases = rows.reduce((s, r) => s + (r.totalCases || 0), 0);
    const assigned = rows.reduce((s, r) => s + (r.assignedCases || 0), 0);
    const unassigned = rows.reduce((s, r) => s + (r.unassignedCases || 0), 0);
    const totalAmount = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
    return { clients: rows.length, totalFiles, totalCases, assigned, unassigned, totalAmount };
  }, [rows]);

  const assignmentRate = stats.totalCases > 0
    ? Math.round((stats.assigned / stats.totalCases) * 100)
    : 0;

  return (
    <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
      {/* Stat cards */}
      <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
        <StatCard icon={Building2} numericValue={stats.clients} label="Active Clients" meta="With cases under management" accent="#6366f1" variant="compact" />
        <StatCard icon={Briefcase} numericValue={stats.totalCases} label="Total Cases" meta={`${stats.totalFiles} batch files`} accent="#06b6d4" variant="compact" />
        <StatCard icon={CheckCircle2} numericValue={stats.assigned} label="Assigned Cases" meta={`${assignmentRate}% assignment rate`} accent="#10b981" variant="compact" />
        <StatCard icon={AlertCircle} numericValue={stats.unassigned} label="Unassigned Cases" meta="Awaiting agent assignment" accent="#f59e0b" variant="compact" />
      </section>

      {/* Table card */}
      <div className="cm-table-card">
        <SectionHeader icon={Briefcase} title="Case Assignment" count={filtered.length} />

        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by client name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="cm-table-wrap">
          <table className="cm-table cm-table--case">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Client Name</th>
                <th className="cm-th cm-th-num">Total Files</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Total Amount<br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-num">Total Cases</th>
                <th className="cm-th cm-th-num">Assigned Cases</th>
                <th className="cm-th cm-th-num">UnAssigned Cases</th>
                <th className="cm-th cm-th-view">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={8}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading cases…</p>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={8}>
                    <div className="cm-empty-state">
                      <Briefcase className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No clients to display</p>
                      <p className="cm-empty-desc">
                        {search ? 'Try adjusting your search.' : 'Clients will appear here once debtors are imported.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => (
                  <tr key={r.clientId} className="cm-table-row">
                    <td className="cm-td cm-td-index">{pageStart + idx + 1}</td>
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="cfm-client-avatar" aria-hidden="true">
                          <Building2 className="cm-client-avatar-icon" />
                        </span>
                        <div>
                          <button
                            type="button"
                            className="cfm-client-link"
                            onClick={() => navigate(`/case-management/clients/${r.clientId}/files`)}
                          >
                            {r.clientName}
                          </button>
                          <p className="cm-client-type dm-cfid-sub">
                            <FolderOpen size={11} /> {r.totalFiles} file{r.totalFiles === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="cm-td cm-td-num">
                      <span className="cfm-count">{r.totalFiles}</span>
                    </td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(r.totalAmount)}</td>
                    <td className="cm-td cm-td-num">
                      <span className="cfm-count cfm-count--total">{r.totalCases}</span>
                    </td>
                    <td className="cm-td cm-td-num">
                      {r.assignedCases > 0 ? (
                        <span className="cfm-count cfm-count--ok">{r.assignedCases}</span>
                      ) : (<span className="dm-muted">0</span>)}
                    </td>
                    <td className="cm-td cm-td-num">
                      {r.unassignedCases > 0 ? (
                        <span className="cfm-count cfm-count--warn">{r.unassignedCases}</span>
                      ) : (<span className="dm-muted">0</span>)}
                    </td>
                    <td className="cm-td cm-td-view">
                      <button
                        type="button"
                        className="cm-contact-btn"
                        onClick={() => navigate(`/case-management/clients/${r.clientId}/files`)}
                        aria-label={`View files for ${r.clientName}`}
                      >
                        <Eye className="cm-contact-btn-icon" />
                        <span>View Files</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && filtered.length > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-size">
              <label htmlFor="cm-page-size">Rows per page</label>
              <select
                id="cm-page-size"
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
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="icon-sm" />
              </button>
              <button
                type="button"
                className="cm-pagination-btn"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Last page"
              >
                <ChevronLast className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CaseManagementPage;
