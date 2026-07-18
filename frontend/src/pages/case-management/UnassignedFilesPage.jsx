import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import AssignCasesModal from '../../components/AssignCasesModal';
import SectionHeader from '../../components/SectionHeader';
import StatCard from '../../components/StatCard';
import { fetchUnassignedFiles } from '../../api/unassignedFiles';
import { usePageActions } from '../../context/PageActionsContext';
import { usePageHeaderSticky } from '../../context/PageHeaderStickyContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';

const PAGE_SIZE = 10;

function formatMoneyDecimals(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function UnassignedFilesPage() {
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const { canAssignCases, isAgent, permissionsLoaded } = usePermissions();
  const isDocked = !headerInView;

  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [assignFile, setAssignFile] = useState(null);

  const loadFiles = useCallback(async () => {
    if (!canAssignCases) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await fetchUnassignedFiles();
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load unassigned files');
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [canAssignCases]);

  useEffect(() => {
    if (!permissionsLoaded) return;
    loadFiles();
  }, [loadFiles, permissionsLoaded]);

  const handleRefresh = useCallback(() => {
    setSearch('');
    setPage(1);
    loadFiles();
    toast.info('Unassigned files refreshed');
  }, [loadFiles]);

  useEffect(() => {
    if (!canAssignCases) {
      setActions(null);
      return undefined;
    }
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
  }, [setActions, handleRefresh, canAssignCases]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return files;
    return files.filter(
      (f) =>
        String(f.fileName || '').toLowerCase().includes(q) ||
        String(f.clientName || '').toLowerCase().includes(q) ||
        String(f.debtCategoryName || '').toLowerCase().includes(q)
    );
  }, [files, search]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const stats = useMemo(() => {
    const unassignedCases = files.reduce((s, f) => s + (f.unassignedCases || 0), 0);
    const clients = new Set(files.map((f) => f.clientId).filter(Boolean)).size;
    const loanTotal = files.reduce((s, f) => s + (Number(f.loanTotal) || 0), 0);
    return {
      files: files.length,
      clients,
      unassignedCases,
      loanTotal,
    };
  }, [files]);

  if (permissionsLoaded && isAgent && !canAssignCases) {
    return (
      <div className="cm-page">
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <ShieldAlert className="empty-state-icon-svg" />
          </div>
          <h2 className="empty-state-title">Supervisors only</h2>
          <p className="empty-state-description">
            Unassigned files are managed by supervisors. Ask a manager to assign cases to you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
      <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
        <StatCard
          icon={FolderOpen}
          numericValue={stats.files}
          label="Unassigned Files"
          meta="Batch files awaiting assignment"
          accent="#f59e0b"
          variant="compact"
        />
        <StatCard
          icon={Building2}
          numericValue={stats.clients}
          label="Clients Affected"
          meta="With open unassigned cases"
          accent="#6366f1"
          variant="compact"
        />
        <StatCard
          icon={UsersRound}
          numericValue={stats.unassignedCases}
          label="Unassigned Cases"
          meta="Debtors without an agent"
          accent="#ef4444"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          numericValue={stats.loanTotal}
          decimals={0}
          prefix={`${currencySymbol} `}
          label="Portfolio Value"
          meta="Across unassigned files"
          accent="#06b6d4"
          variant="compact"
        />
      </section>

      <div className="cm-table-card">
        <SectionHeader
          icon={AlertCircle}
          title="Files Needing Assignment"
          count={filtered.length}
        />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by file, client, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table cm-table--case">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">File Name</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Category</th>
                <th className="cm-th cm-th-num">Unassigned</th>
                <th className="cm-th cm-th-num">Assigned</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Loan Total
                  <br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-view">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !permissionsLoaded ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={8}>
                    <div className="cm-loading">
                      <Loader2 className="icon-sm spin" />
                      Loading unassigned files…
                    </div>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={8}>
                    <div
                      className="empty-state-card"
                      style={{ margin: '1rem auto', maxWidth: '28rem' }}
                    >
                      <div className="empty-state-icon">
                        <FolderOpen className="empty-state-icon-svg" />
                      </div>
                      <h2 className="empty-state-title">All files assigned</h2>
                      <p className="empty-state-description">
                        There are no open batch files with unassigned cases right now. New uploads bound to your call center by a Senior Supervisor will show up here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((f, index) => (
                  <tr key={f.id}>
                    <td className="cm-td cm-td-index">{pageStart + index + 1}</td>
                    <td className="cm-td">
                      <span className="cfm-batch-name">{f.fileName || `Batch #${f.id}`}</span>
                    </td>
                    <td className="cm-td">
                      {f.clientName ? (
                        <span className="dm-client-link">
                          <Building2 className="dm-client-icon" />
                          {f.clientName}
                        </span>
                      ) : (
                        <span className="dm-muted">—</span>
                      )}
                    </td>
                    <td className="cm-td">{f.debtCategoryName || '—'}</td>
                    <td className="cm-td cm-td-num">
                      <span className="cfm-count cfm-count--warn">{f.unassignedCases || 0}</span>
                    </td>
                    <td className="cm-td cm-td-num">{f.assignedCases || 0}</td>
                    <td className="cm-td cm-td-num cm-money">
                      {formatMoneyDecimals(f.loanTotal)}
                    </td>
                    <td className="cm-td cm-td-actions">
                      <div className="cfm-row-actions">
                        <button
                          type="button"
                          className="cfm-pill-btn cfm-pill-btn--assign"
                          onClick={() => setAssignFile(f)}
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          className="cfm-pill-btn cfm-pill-btn--view"
                          onClick={() =>
                            navigate(
                              `/case-management/clients/${f.clientId}/files/${f.id}/cases`
                            )
                          }
                          disabled={!f.clientId}
                        >
                          View Cases
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && permissionsLoaded && filtered.length > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-size">
              <label htmlFor="uf-page-size">Rows per page</label>
              <select
                id="uf-page-size"
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

      <AssignCasesModal
        open={Boolean(assignFile)}
        file={assignFile}
        onClose={() => setAssignFile(null)}
        onChanged={loadFiles}
      />
    </div>
  );
}

export default UnassignedFilesPage;
