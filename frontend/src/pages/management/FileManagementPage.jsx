import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  RefreshCw,
  FileText,
  Search,
  Building2,
  Layers,
  Tags,
  Coins,
  UserCog,
  Eye,
  Trash2,
  Wallet,
  TrendingUp,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import { usePageActions } from '../../context/PageActionsContext';
import { usePageHeaderSticky } from '../../context/PageHeaderStickyContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useConfirm } from '../../context/ConfirmContext';
import { fetchDebtorFiles, deleteDebtorFile } from '../../api/debtors';

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function FileManagementPage() {
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const isDocked = !headerInView;
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDebtorFiles();
      setFiles(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleRefresh = () => {
    setSearch('');
    loadFiles();
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
  }, [setActions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return files;
    return files.filter((f) =>
      `${f.fileName || ''} #${f.id} ${f.clientName || ''} ${f.debtCategoryName || ''} ${f.debtTypeName || ''} ${f.uploadedByName || ''}`
        .toLowerCase().includes(q)
    );
  }, [files, search]);

  const stats = useMemo(() => {
    const totalImported = files.reduce((s, f) => s + (f.importedCount || 0), 0);
    const loanTotal = files.reduce((s, f) => s + (f.loanTotal || 0), 0);
    const outstandingTotal = files.reduce((s, f) => s + (f.outstandingTotal || 0), 0);
    return { fileCount: files.length, totalImported, loanTotal, outstandingTotal };
  }, [files]);

  const collectionRate = stats.loanTotal > 0
    ? Math.round(((stats.loanTotal - stats.outstandingTotal) / stats.loanTotal) * 100)
    : 0;

  const viewDebtors = (file) => {
    navigate(`/management/debtor-management?fileId=${file.id}`);
  };

  const handleDelete = async (file) => {
    await confirm({
      title: 'Delete file',
      message: `Delete "${file.fileName || `Batch #${file.id}`}"?`,
      detail: `This will soft-delete the file and all ${file.importedCount} debtor${file.importedCount === 1 ? '' : 's'} in it. They will no longer appear in Debtor Management, but the data is preserved and can be restored later.`,
      confirmText: 'Delete File',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteDebtorFile(file.id);
          setFiles((prev) => prev.filter((f) => f.id !== file.id));
          toast.success(`File "${file.fileName || `Batch #${file.id}`}" deleted`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete file');
          throw err;
        }
      },
    });
  };

  return (
    <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
      {/* ── Stat Cards ── */}
      <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
        <StatCard
          icon={FolderOpen}
          numericValue={stats.fileCount}
          label="Upload Batches"
          meta="Files imported into the system"
          accent="#6366f1"
          variant="compact"
        />
        <StatCard
          icon={FileText}
          numericValue={stats.totalImported}
          label="Imported Debtors"
          meta="Across all batch files"
          accent="#06b6d4"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          numericValue={stats.loanTotal}
          label={`Portfolio Value (${currencySymbol})`}
          meta="Total debt across files"
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={AlertCircle}
          numericValue={stats.outstandingTotal}
          label={`Outstanding (${currencySymbol})`}
          meta={`${collectionRate}% recovered`}
          accent="#f59e0b"
          variant="compact"
        />
      </section>

      {/* ── Table card ── */}
      <div className="cm-table-card">
        <SectionHeader icon={FolderOpen} title="Upload Files" count={filtered.length} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by file name, batch #, client, category or uploader…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table fm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">File</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Category</th>
                <th className="cm-th">Type</th>
                <th className="cm-th">Currency</th>
                <th className="cm-th cm-th-num">Imported</th>
                <th className="cm-th cm-th-num">Skipped</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Portfolio<br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-num cm-th-money">
                  Outstanding<br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th">Uploaded By</th>
                <th className="cm-th cm-th-date">Uploaded</th>
                <th className="cm-th cm-th-view">View</th>
                <th className="cm-th cm-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={14}>
                    <div className="cm-empty-state">
                      <p className="cm-empty-title">Loading files…</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={14}>
                    <div className="cm-empty-state">
                      <FolderOpen className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No upload files yet</p>
                      <p className="cm-empty-desc">
                        {search
                          ? 'Try adjusting your search.'
                          : 'Bulk-upload a CSV from Debtor Management to create a file entry here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((f, idx) => (
                  <tr key={f.id} className="cm-table-row">
                    <td className="cm-td cm-td-index">{idx + 1}</td>

                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="fm-file-avatar" aria-hidden="true">
                          <FileText className="cm-client-avatar-icon" />
                        </span>
                        <div>
                          <button
                            type="button"
                            className="cm-client-name fm-file-name-btn"
                            onClick={() => viewDebtors(f)}
                            aria-label={`View debtors in ${f.fileName || `batch #${f.id}`}`}
                          >
                            {f.fileName || `Batch #${f.id}`}
                          </button>
                          <p className="cm-client-type dm-cfid-sub">
                            CFID <code className="dm-cfid-badge dm-cfid-badge--sm">{f.id}</code>
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
                      ) : (
                        <span className="dm-muted">—</span>
                      )}
                    </td>

                    <td className="cm-td">
                      {f.debtCategoryName ? (
                        <span className="fm-chip"><Layers className="fm-chip-icon" />{f.debtCategoryName}</span>
                      ) : <span className="dm-muted">—</span>}
                    </td>
                    <td className="cm-td">
                      {f.debtTypeName ? (
                        <span className="fm-chip"><Tags className="fm-chip-icon" />{f.debtTypeName}</span>
                      ) : <span className="dm-muted">—</span>}
                    </td>
                    <td className="cm-td">
                      {f.currencyCode ? (
                        <span className="fm-chip"><Coins className="fm-chip-icon" />{f.currencyCode}</span>
                      ) : <span className="dm-muted">—</span>}
                    </td>

                    <td className="cm-td cm-td-num">
                      <span className="fm-count fm-count--ok">{f.importedCount}</span>
                    </td>
                    <td className="cm-td cm-td-num">
                      {f.skippedCount > 0 ? (
                        <span className="fm-count fm-count--warn">{f.skippedCount}</span>
                      ) : (
                        <span className="dm-muted">0</span>
                      )}
                    </td>
                    <td className="cm-td cm-td-num cm-money">{formatMoney(f.loanTotal)}</td>
                    <td className="cm-td cm-td-num cm-money dm-outstanding">{formatMoney(f.outstandingTotal)}</td>

                    <td className="cm-td dm-td-agent">
                      {f.uploadedByName ? (
                        <span className="dm-agent-cell">
                          <UserCog className="fm-uploader-icon" />
                          {f.uploadedByName}
                        </span>
                      ) : (
                        <span className="dm-muted">—</span>
                      )}
                    </td>
                    <td className="cm-td cm-td-date">
                      <span className="fm-date-cell">
                        <CalendarDays className="fm-date-icon" />
                        {formatDate(f.createdAt)}
                      </span>
                    </td>

                    <td className="cm-td cm-td-view">
                      <button
                        type="button"
                        className="cm-contact-btn"
                        onClick={() => viewDebtors(f)}
                        aria-label={`View debtors in ${f.fileName || `batch #${f.id}`}`}
                      >
                        <Eye className="cm-contact-btn-icon" />
                        <span>View</span>
                      </button>
                    </td>
                    <td className="cm-td cm-td-actions">
                      <button
                        type="button"
                        className="cm-action-btn cm-action-btn-danger"
                        onClick={() => handleDelete(f)}
                        aria-label={`Delete file ${f.fileName || `batch #${f.id}`}`}
                        title="Delete file"
                      >
                        <Trash2 className="cm-action-icon" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <p className="cm-table-footer">
            Showing <strong>{filtered.length}</strong> of <strong>{files.length}</strong> files
          </p>
        )}
      </div>
    </div>
  );
}

export default FileManagementPage;
