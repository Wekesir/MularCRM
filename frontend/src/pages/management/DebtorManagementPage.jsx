import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  UsersRound,
  RefreshCw,
  Building2,
  User,
  Phone,
  Search,
  SlidersHorizontal,
  Upload,
  Download,
  Eye,
  Wallet,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Archive,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import DebtorHistoryModal from '../../components/DebtorHistoryModal';
import DebtorBulkUploadModal from '../../components/DebtorBulkUploadModal';
import CloseCaseModal from '../../components/CloseCaseModal';
import { usePageActions } from '../../context/PageActionsContext';
import { usePageHeaderSticky } from '../../context/PageHeaderStickyContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  fetchDebtors,
  fetchDebtorTotals,
  fetchDebtorFiles,
  fetchDebtorBuckets,
  fetchDebtorAgents,
  fetchDebtorsForExport,
  closeDebtorCase,
} from '../../api/debtors';
import { fetchClients } from '../../api/clients';
import { fetchContactStatuses } from '../../api/contactStatuses';
import { fetchRegions } from '../../api/regions';

const PAGE_SIZE = 25;

const EMPTY_ADV = {
  clientId: '',
  regionId: '',
  agent: '',
  closed: '',
  lastContactedFrom: '',
  lastContactedTo: '',
  nextActionFrom: '',
  nextActionTo: '',
  dpdMin: '',
  dpdMax: '',
  ptp: '',
  balanceMin: '',
  balanceMax: '',
  contactStatusId: '',
  assignmentStatus: '',
  discounted: '',
};

function countActiveAdv(adv) {
  return Object.values(adv).filter((v) => v !== '' && v !== null && v !== undefined).length;
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function bucketClass(bucket) {
  const b = String(bucket || '').toLowerCase();
  if (b.includes('90') || b.includes('120') || b.includes('180') || b.includes('365')) {
    return 'dm-bucket dm-bucket--danger';
  }
  if (b.includes('60')) return 'dm-bucket dm-bucket--warn';
  if (b.includes('30')) return 'dm-bucket dm-bucket--caution';
  return 'dm-bucket dm-bucket--ok';
}

// ── Export helpers ────────────────────────────────────────────────────────────

const EXPORT_COLUMNS = [
  { label: '#', key: '_idx' },
  { label: 'Debtor Name', key: 'name' },
  { label: 'Loan ID', key: 'loanId' },
  { label: 'ID Number', key: 'idNumber' },
  { label: 'Phone', key: 'phone' },
  { label: 'Secondary Phone', key: 'secondaryPhoneNumber' },
  { label: 'Email', key: 'email' },
  { label: 'Client', key: 'clientName' },
  { label: 'Debt Category', key: 'debtCategoryName' },
  { label: 'Debt Type', key: 'debtTypeName' },
  { label: 'Currency', key: 'currencyCode' },
  { label: 'Loan Amount', key: 'loanAmount' },
  { label: 'Principal Amount', key: 'principalAmount' },
  { label: 'Amount Repaid', key: 'totalPaid' },
  { label: 'Arrears', key: 'outstandingBalance' },
  { label: 'Waived Amount', key: 'waivedAmount' },
  { label: 'Penalty', key: 'penalty' },
  { label: 'Installment Amount', key: 'installmentAmount' },
  { label: 'DPD', key: 'overdueDays' },
  { label: 'Bucket', key: 'bucket' },
  { label: 'Contact Status', key: 'contactStatusName' },
  { label: 'Last Contacted', key: 'lastContactedAt' },
  { label: 'Next Action Date', key: 'nextActionDate' },
  { label: 'Loan Taken Date', key: 'borrowDate' },
  { label: 'Loan Due Date', key: 'loanDueDate' },
  { label: 'Last Paid Amount', key: 'lastPaidAmount' },
  { label: 'Last Paid Date', key: 'lastPaidDate' },
  { label: 'Loan Counter', key: 'loanCounter' },
  { label: 'Account Number', key: 'accountNumber' },
  { label: 'Contract Number', key: 'contractNumber' },
  { label: 'Physical Address', key: 'physicalAddress' },
  { label: 'Employer & Address', key: 'employerAndAddress' },
  { label: 'Next of Kin Name', key: 'nextOfKinFullName' },
  { label: 'NOK Relationship', key: 'nextOfKinRelationship' },
  { label: 'NOK Phone', key: 'nextOfKinPhoneNumber' },
  { label: 'NOK Email', key: 'nextOfKinEmail' },
  { label: 'Guarantor Name', key: 'guarantorFullName' },
  { label: 'Guarantor Phones', key: 'guarantorPhones' },
  { label: 'Guarantor Email', key: 'guarantorEmail' },
  { label: 'Guarantor Address', key: 'guarantorAddress' },
  { label: 'Assigned Agent', key: 'assignedAgent' },
  { label: 'Batch #', key: 'cfid' },
];

function buildRows(rows) {
  return rows.map((d, i) =>
    EXPORT_COLUMNS.reduce((obj, col) => {
      obj[col.label] = col.key === '_idx' ? i + 1 : (d[col.key] ?? '');
      return obj;
    }, {})
  );
}

function exportCsv(rows, filename) {
  const headers = EXPORT_COLUMNS.map((c) => c.label);
  const escape = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((d, i) =>
      EXPORT_COLUMNS.map((col) =>
        escape(col.key === '_idx' ? i + 1 : (d[col.key] ?? ''))
      ).join(',')
    ),
  ];
  const csv = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportExcel(rows, filename) {
  const data = buildRows(rows);
  const labels = EXPORT_COLUMNS.map((c) => c.label);
  const ws = XLSX.utils.json_to_sheet(data, { header: labels });
  const colWidths = EXPORT_COLUMNS.map((col) => {
    const maxLen = Math.max(
      col.label.length,
      ...rows.map((d) => String(d[col.key] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Debtors');
  XLSX.writeFile(wb, filename);
}

function timestamp() {
  return new Date().toISOString().slice(0, 10);
}

// ── Page component ────────────────────────────────────────────────────────────

function DebtorManagementPage() {
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const isDocked = !headerInView;
  const [searchParams] = useSearchParams();
  const initialFileId = searchParams.get('fileId') || '';

  // Paginated table state.
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const [fileFilter, setFileFilter] = useState(initialFileId);
  const [advForm, setAdvForm] = useState(EMPTY_ADV);
  const [adv, setAdv] = useState(EMPTY_ADV);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lookups / stats.
  const [debtorFiles, setDebtorFiles] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [clients, setClients] = useState([]);
  const [regions, setRegions] = useState([]);
  const [contactStatuses, setContactStatuses] = useState([]);
  const [stats, setStats] = useState({ total: 0, loanAmount: 0, totalPaid: 0, outstanding: 0 });

  const [historyDebtor, setHistoryDebtor] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [isClosingDebtor, setIsClosingDebtor] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const exportRef = useRef(null);
  const exportBtnRef = useRef(null);
  const sentinelRef = useRef(null);
  const reqId = useRef(0);
  const { isSystemAdmin, isSeniorSupervisor, isRegionalManager, permissions } = usePermissions();
  const canBulkUpload =
    isSystemAdmin ||
    isSeniorSupervisor ||
    isRegionalManager ||
    Boolean(permissions?.management?.debtor_management?.create);

  const collectionRate = stats.loanAmount > 0
    ? Math.round((stats.totalPaid / stats.loanAmount) * 100)
    : 0;

  // The combined filter object sent to the server.
  const filters = useMemo(
    () => ({
      search: searchTerm || null,
      fileId: fileFilter || null,
      bucket: bucketFilter || null,
      ...adv,
    }),
    [searchTerm, fileFilter, bucketFilter, adv]
  );

  // Filters for the buckets dropdown (exclude bucket itself).
  const bucketsScope = useMemo(() => {
    const { bucket, ...rest } = filters;
    return rest;
  }, [filters]);
  // Filters for the agents dropdown (exclude agent itself).
  const agentsScope = useMemo(() => {
    const { agent, ...rest } = filters;
    return rest;
  }, [filters]);

  // Load stable lookups once.
  useEffect(() => {
    Promise.all([fetchClients(), fetchContactStatuses(), fetchRegions({ includeInactive: false })])
      .then(([c, cs, regs]) => {
        setClients(c);
        setContactStatuses(cs);
        setRegions(Array.isArray(regs) ? regs : []);
      })
      .catch(() => {});
  }, []);

  // ── Load page 1 (filters changed) ──
  const loadFirstPage = useCallback(async () => {
    const id = ++reqId.current;
    setIsLoading(true);
    try {
      const [pageData, totals, files, bucketsList, agentsList] = await Promise.all([
        fetchDebtors({ ...filters, page: 1, pageSize: PAGE_SIZE }),
        fetchDebtorTotals(filters),
        fetchDebtorFiles(),
        fetchDebtorBuckets(bucketsScope),
        fetchDebtorAgents(agentsScope),
      ]);
      if (id !== reqId.current) return; // stale
      setItems(pageData.items);
      setTotal(pageData.total);
      setPage(1);
      setHasMore(pageData.hasMore);
      setStats(totals);
      setDebtorFiles(files);
      setBuckets(bucketsList);
      setAgents(agentsList);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load debtors');
    } finally {
      if (id === reqId.current) setIsLoading(false);
    }
  }, [filters, bucketsScope, agentsScope]);

  const handleCloseCase = async (reason) => {
    if (!closeTarget) return;
    setIsClosingDebtor(true);
    try {
      await closeDebtorCase(closeTarget.id, reason);
      toast.success(`${closeTarget.name}'s case closed`);
      setCloseTarget(null);
      loadFirstPage();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to close case');
    } finally {
      setIsClosingDebtor(false);
    }
  };

  // ── Load next page (infinite scroll) ──
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || isLoading) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchDebtors({ ...filters, page: nextPage, pageSize: PAGE_SIZE });
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
      setHasMore(data.hasMore);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load more debtors');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, isLoading, page, filters]);

  // Debounce search input → searchTerm.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reload when filters change.
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  // Infinite scroll sentinel.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Close export dropdown on outside click or scroll.
  useEffect(() => {
    if (!exportOpen) return undefined;
    const close = (e) => {
      if (exportBtnRef.current && exportBtnRef.current.contains(e.target)) return;
      setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [exportOpen]);

  const activeAdvCount = countActiveAdv(adv);

  const handleRefresh = () => {
    setSearchInput('');
    setSearchTerm('');
    setBucketFilter('');
    setFileFilter('');
    setAdvForm(EMPTY_ADV);
    setAdv(EMPTY_ADV);
    toast.info('Debtor list refreshed');
  };

  const handleApplyAdvanced = () => {
    setAdv(advForm);
    setShowAdvanced(false);
  };

  const handleClearAdvanced = () => {
    setAdvForm(EMPTY_ADV);
    setAdv(EMPTY_ADV);
  };

  const handleBulkUploadCompleted = (res) => {
    if (!res) return;
    if (res.createdCount > 0) loadFirstPage();
    let summary = `${res.createdCount} debtor${res.createdCount === 1 ? '' : 's'} imported`;
    if (res.failedCount > 0) summary += `, ${res.failedCount} row${res.failedCount === 1 ? '' : 's'} skipped`;
    if (res.createdCount > 0 && res.failedCount > 0) toast.warning(summary);
    else if (res.failedCount > 0 && res.createdCount === 0) toast.error(summary);
    else toast.success(summary);
  };

  const runExport = async (kind) => {
    setExportOpen(false);
    setIsExporting(true);
    try {
      const rows = await fetchDebtorsForExport(filters);
      const fname = `debtors-${timestamp()}.${kind === 'csv' ? 'csv' : 'xlsx'}`;
      if (kind === 'csv') exportCsv(rows, fname);
      else exportExcel(rows, fname);
      toast.success(`${rows.length} debtor${rows.length === 1 ? '' : 's'} exported as ${kind.toUpperCase()}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export debtors');
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
        <div className="dm-export-wrap" ref={exportRef}>
          <button
            ref={exportBtnRef}
            type="button"
            className="btn-sm dm-export-btn"
            aria-label="Export debtors"
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            disabled={isExporting}
            onClick={() => {
              if (exportOpen) { setExportOpen(false); return; }
              const rect = exportBtnRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
              setExportOpen(true);
            }}
          >
            {isExporting ? <Loader2 className="icon-sm spin" /> : <Download className="icon-sm" />}
            <span className="dm-export-label">{isExporting ? 'Exporting…' : 'Export'}</span>
            <ChevronDown className={`dm-export-chevron${exportOpen ? ' dm-export-chevron--open' : ''}`} />
          </button>
        </div>
        {canBulkUpload && (
          <button
            type="button"
            className="btn-sm cm-bulk-upload-btn"
            aria-label="Bulk upload debtors"
            title="Bulk Upload"
            onClick={() => setBulkUploadOpen(true)}
          >
            <Upload className="icon-sm" />
            <span className="cm-bulk-upload-label">Bulk Upload</span>
          </button>
        )}
      </>
    );
    return () => setActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActions, exportOpen, isExporting, canBulkUpload]);

  return (
    <>
      {exportOpen && createPortal(
        <div className="dm-export-menu" role="menu" style={{ top: menuPos.top, right: menuPos.right }}>
          <button type="button" className="dm-export-item" role="menuitem" onClick={() => runExport('csv')}>
            <FileDown className="dm-export-item-icon" aria-hidden="true" />
            <div className="dm-export-item-text">
              <span className="dm-export-item-label">Export as CSV</span>
              <span className="dm-export-item-desc">Full filtered set · plain text</span>
            </div>
          </button>
          <button type="button" className="dm-export-item" role="menuitem" onClick={() => runExport('xlsx')}>
            <FileSpreadsheet className="dm-export-item-icon" aria-hidden="true" />
            <div className="dm-export-item-text">
              <span className="dm-export-item-label">Export as Excel</span>
              <span className="dm-export-item-desc">Full filtered set · formatted .xlsx</span>
            </div>
          </button>
        </div>,
        document.body
      )}

      <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
        {/* ── Stat Cards ── */}
        <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
          <StatCard icon={UsersRound} numericValue={stats.total} label="Total Debtors" meta="Accounts under management" accent="#6366f1" variant="compact" />
          <StatCard icon={Wallet} numericValue={stats.loanAmount} label={`Loan Portfolio (${currencySymbol})`} meta="Total debt under collection" accent="#06b6d4" variant="compact" />
          <StatCard icon={TrendingUp} numericValue={stats.totalPaid} label={`Collected (${currencySymbol})`} meta={`${collectionRate}% recovery rate`} accent="#10b981" variant="compact" />
          <StatCard icon={AlertCircle} numericValue={stats.outstanding} label={`Outstanding (${currencySymbol})`} meta="Balance yet to be recovered" accent="#f59e0b" variant="compact" />
        </section>

        {/* ── Table card ── */}
        <div className="cm-table-card">
          <SectionHeader icon={UsersRound} title="Debtor Directory" count={total} />

          {/* Toolbar */}
          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by debtor, loan ID, phone, ID no., client…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="cm-filters">
              <select className="cm-filter-select" value={fileFilter} onChange={(e) => setFileFilter(e.target.value)} aria-label="Filter by batch file">
                <option value="">All Batches</option>
                {debtorFiles.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    #{f.id}{f.fileName ? ` — ${f.fileName}` : ''} ({f.importedCount})
                  </option>
                ))}
              </select>
              <select className="cm-filter-select" value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)} aria-label="Filter by bucket">
                <option value="">All Buckets</option>
                {buckets.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
              <button
                type="button"
                className={`af-toggle${showAdvanced ? ' af-toggle--active' : ''}${activeAdvCount > 0 ? ' af-toggle--has' : ''}`}
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                <SlidersHorizontal className="icon-sm" />
                <span>Advanced</span>
                {activeAdvCount > 0 && <span className="af-toggle-count">{activeAdvCount}</span>}
                {showAdvanced ? <ChevronUp className="icon-sm" /> : <ChevronDown className="icon-sm" />}
              </button>
            </div>
          </div>

          {/* Advanced filters panel */}
          {showAdvanced && (
            <div className="af-panel">
              <div className="af-grid">
                <div className="af-field">
                  <span className="af-label">Client</span>
                  <select className="af-select" value={advForm.clientId} onChange={(e) => setAdvForm((p) => ({ ...p, clientId: e.target.value }))}>
                    <option value="">All clients</option>
                    {clients.map((c) => (<option key={c.id} value={String(c.id)}>{c.name}</option>))}
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Region</span>
                  <select className="af-select" value={advForm.regionId} onChange={(e) => setAdvForm((p) => ({ ...p, regionId: e.target.value }))}>
                    <option value="">All regions</option>
                    {regions.map((r) => (<option key={r.id} value={String(r.id)}>{r.name}</option>))}
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Agent</span>
                  <select className="af-select" value={advForm.agent} onChange={(e) => setAdvForm((p) => ({ ...p, agent: e.target.value }))}>
                    <option value="">All agents</option>
                    {agents.map((a) => (<option key={a} value={a}>{a}</option>))}
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Contactability Status</span>
                  <select className="af-select" value={advForm.contactStatusId} onChange={(e) => setAdvForm((p) => ({ ...p, contactStatusId: e.target.value }))}>
                    <option value="">Any status</option>
                    {contactStatuses.map((s) => (<option key={s.id} value={String(s.id)}>{s.name}</option>))}
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Assignment Status</span>
                  <select className="af-select" value={advForm.assignmentStatus} onChange={(e) => setAdvForm((p) => ({ ...p, assignmentStatus: e.target.value }))}>
                    <option value="">Any</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Closed File</span>
                  <select className="af-select" value={advForm.closed} onChange={(e) => setAdvForm((p) => ({ ...p, closed: e.target.value }))}>
                    <option value="">Any</option>
                    <option value="1">Closed only</option>
                    <option value="0">Open only</option>
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">PTP (Promise To Pay)</span>
                  <select className="af-select" value={advForm.ptp} onChange={(e) => setAdvForm((p) => ({ ...p, ptp: e.target.value }))}>
                    <option value="">Any</option>
                    <option value="1">Has PTP</option>
                    <option value="0">No PTP</option>
                  </select>
                </div>

                <div className="af-field">
                  <span className="af-label">Discounted / Waived</span>
                  <select className="af-select" value={advForm.discounted} onChange={(e) => setAdvForm((p) => ({ ...p, discounted: e.target.value }))}>
                    <option value="">Any</option>
                    <option value="1">Waived accounts only</option>
                  </select>
                </div>

                <div className="af-field af-field-range">
                  <span className="af-label">DPD Range</span>
                  <div className="af-range">
                    <input type="number" min="0" className="af-input" placeholder="Min" value={advForm.dpdMin} onChange={(e) => setAdvForm((p) => ({ ...p, dpdMin: e.target.value }))} />
                    <span className="af-range-sep">–</span>
                    <input type="number" min="0" className="af-input" placeholder="Max" value={advForm.dpdMax} onChange={(e) => setAdvForm((p) => ({ ...p, dpdMax: e.target.value }))} />
                  </div>
                </div>

                <div className="af-field af-field-range">
                  <span className="af-label">Balance Range ({currencySymbol})</span>
                  <div className="af-range">
                    <input type="number" min="0" className="af-input" placeholder="Min" value={advForm.balanceMin} onChange={(e) => setAdvForm((p) => ({ ...p, balanceMin: e.target.value }))} />
                    <span className="af-range-sep">–</span>
                    <input type="number" min="0" className="af-input" placeholder="Max" value={advForm.balanceMax} onChange={(e) => setAdvForm((p) => ({ ...p, balanceMax: e.target.value }))} />
                  </div>
                </div>

                <div className="af-field af-field-range">
                  <span className="af-label">Last Contacted</span>
                  <div className="af-range">
                    <input type="date" className="af-input" value={advForm.lastContactedFrom} onChange={(e) => setAdvForm((p) => ({ ...p, lastContactedFrom: e.target.value }))} />
                    <span className="af-range-sep">→</span>
                    <input type="date" className="af-input" value={advForm.lastContactedTo} onChange={(e) => setAdvForm((p) => ({ ...p, lastContactedTo: e.target.value }))} />
                  </div>
                </div>

                <div className="af-field af-field-range">
                  <span className="af-label">Next Action Date</span>
                  <div className="af-range">
                    <input type="date" className="af-input" value={advForm.nextActionFrom} onChange={(e) => setAdvForm((p) => ({ ...p, nextActionFrom: e.target.value }))} />
                    <span className="af-range-sep">→</span>
                    <input type="date" className="af-input" value={advForm.nextActionTo} onChange={(e) => setAdvForm((p) => ({ ...p, nextActionTo: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="af-actions">
                <button type="button" className="btn-icon-outline af-clear-btn" onClick={handleClearAdvanced}>
                  <X className="icon-sm" /> Clear all
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={handleApplyAdvanced}>
                  Apply Filters
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="cm-table-wrap">
            <table className="cm-table dm-table">
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
                  <th className="cm-th cm-th-num">Overdue<br />Days</th>
                  <th className="cm-th">Bucket</th>
                  <th className="cm-th cm-th-date">Borrow<br />Date</th>
                  <th className="cm-th cm-th-view">View</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={13}>
                      <div className="cm-empty-state">
                        <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                        <p className="cm-empty-title">Loading debtors…</p>
                        <p className="cm-empty-desc">Fetching the first page from the system database.</p>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={13}>
                      <div className="cm-empty-state">
                        <UsersRound className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">No debtors found</p>
                        <p className="cm-empty-desc">
                          {searchTerm || bucketFilter || fileFilter || activeAdvCount > 0
                            ? 'Try adjusting your search or filters.'
                            : canBulkUpload
                              ? 'Click "Bulk Upload" to import debtors from a CSV file.'
                              : 'No debtor records match the current filters.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {items.map((debtor, idx) => (
                      <tr key={debtor.id} className="cm-table-row">
                        <td className="cm-td cm-td-index">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="cm-td">
                          <div className="cm-client-name-cell">
                            <span className="dm-debtor-avatar" aria-hidden="true"><User className="cm-client-avatar-icon" /></span>
                            <div>
                              <button
                                type="button"
                                className="cm-client-name-btn"
                                onClick={() => setHistoryDebtor(debtor)}
                                title={`View activity for ${debtor.name}`}
                              >
                                {debtor.name}
                              </button>
                              <p className="cm-client-type dm-cfid-sub">{debtor.loanId || debtor.cfid}</p>
                            </div>
                          </div>
                        </td>
                        <td className="cm-td dm-td-client">
                          {debtor.clientName ? (
                            <span className="dm-client-link"><Building2 className="dm-client-icon" />{debtor.clientName}</span>
                          ) : (<span className="dm-muted">—</span>)}
                        </td>
                        <td className="cm-td dm-td-cfid"><code className="dm-cfid-badge">{debtor.cfid}</code></td>
                        <td className="cm-td dm-td-phone">
                          {debtor.phone ? (
                            <span className="dm-phone-cell"><Phone className="dm-phone-icon" />{debtor.phone}</span>
                          ) : (<span className="dm-muted">—</span>)}
                        </td>
                        <td className="cm-td dm-td-agent">
                          {debtor.assignedAgent ? (
                            <span className="dm-agent-cell"><span className="dm-agent-dot" aria-hidden="true" />{debtor.assignedAgent}</span>
                          ) : (<span className="dm-unassigned">Unassigned</span>)}
                        </td>
                        <td className="cm-td cm-td-num cm-money">{formatMoney(debtor.loanAmount)}</td>
                        <td className="cm-td cm-td-num cm-money cm-money--positive">{formatMoney(debtor.totalPaid)}</td>
                        <td className="cm-td cm-td-num cm-money dm-outstanding">{formatMoney(debtor.outstandingBalance)}</td>
                        <td className="cm-td cm-td-num">
                          {debtor.overdueDays > 0 ? (
                            <span className={debtor.overdueDays > 90 ? 'dm-overdue-badge dm-overdue-badge--danger' : debtor.overdueDays > 60 ? 'dm-overdue-badge dm-overdue-badge--warn' : 'dm-overdue-badge dm-overdue-badge--caution'}>
                              {debtor.overdueDays}d
                            </span>
                          ) : (<span className="dm-muted">—</span>)}
                        </td>
                        <td className="cm-td dm-td-bucket">
                          {debtor.bucket ? (<span className={bucketClass(debtor.bucket)}>{debtor.bucket}</span>) : (<span className="dm-muted">—</span>)}
                        </td>
                        <td className="cm-td cm-td-date">{debtor.borrowDate || '—'}</td>
                        <td className="cm-td cm-td-view">
                          <div className="clf-view-actions">
                            <button type="button" className="cm-contact-btn" onClick={() => setHistoryDebtor(debtor)} aria-label={`View history for ${debtor.name}`}>
                              <Eye className="cm-contact-btn-icon" /><span>View</span>
                            </button>
                            {isSystemAdmin && (
                              <button
                                type="button"
                                className="clf-close-btn"
                                onClick={() => setCloseTarget(debtor)}
                                aria-label={`Close case for ${debtor.name}`}
                                title="Close case"
                              >
                                <Archive className="icon-sm" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {hasMore && (
                      <tr ref={sentinelRef} className="dm-loadmore-row">
                        <td className="cm-td dm-loadmore-cell" colSpan={13}>
                          {loadingMore ? (
                            <span className="dm-loadmore-inner"><Loader2 className="dm-loadmore-icon spin" aria-hidden="true" />Loading more debtors…</span>
                          ) : (
                            <span className="dm-loadmore-inner dm-loadmore-inner--idle">Scroll to load more…</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <p className="cm-table-footer">
              Showing <strong>{items.length}</strong> of <strong>{total}</strong> debtors
            </p>
          )}
        </div>
      </div>

      <DebtorHistoryModal debtor={historyDebtor} onClose={() => setHistoryDebtor(null)} />
      <CloseCaseModal
        open={Boolean(closeTarget)}
        debtor={closeTarget}
        isSaving={isClosingDebtor}
        onClose={() => setCloseTarget(null)}
        onSave={handleCloseCase}
      />
      <DebtorBulkUploadModal open={bulkUploadOpen} onClose={() => setBulkUploadOpen(false)} onCompleted={handleBulkUploadCompleted} />
    </>
  );
}

export default DebtorManagementPage;
