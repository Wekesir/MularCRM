import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Filter,
  Plus,
  Upload,
  Search,
  Eye,
  Download,
  RefreshCw,
  FileText,
  UserCog,
  CheckCircle2,
  XCircle,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import AssignCasesModal from '../../components/AssignCasesModal';
import { usePageActions } from '../../context/PageActionsContext';
import { usePageHeaderSticky } from '../../context/PageHeaderStickyContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchClientFiles, unassignFileCases } from '../../api/caseManagement';
import { fetchDebtors } from '../../api/debtors';

const PAGE_SIZE = 10;
const LOAD_PAGE_SIZE = 1000;

function formatMoneyDecimals(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_FILTERS = {
  priority: '',          // bucket value
  agents: [],            // array of assigned_agent names
  amountOp: '',          // gt | lt | eq | gte | lte
  amountValue: '',       // numeric string
  paymentStatus: '',     // paid | partial | unpaid
  assignment: '',        // assigned | unassigned
  dateFrom: '',          // YYYY-MM-DD (outsourced/created date range)
  dateTo: '',            // YYYY-MM-DD
};

const AMOUNT_OPS = [
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'eq', label: 'Equal to' },
  { value: 'gte', label: 'At least' },
  { value: 'lte', label: 'At most' },
];

function derivePaymentStatus(d) {
  const loan = Number(d.loanAmount) || 0;
  const paid = Number(d.totalPaid) || 0;
  if (loan > 0 && paid >= loan) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function FileCasesPage() {
  const { clientId, fileId } = useParams();
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { currencySymbol } = useSystemConfig();
  const { confirm } = useConfirm();
  const { canAssignCases } = usePermissions();
  const isDocked = !headerInView;

  const [file, setFile] = useState(null);
  const [debtors, setDebtors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [agentOpen, setAgentOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(new Set());
  const [assignModal, setAssignModal] = useState(null); // { selectedDebtorIds } | null
  const [working, setWorking] = useState(false);

  const loadAll = useCallback(async () => {
    if (!clientId || !fileId) return;
    setIsLoading(true);
    try {
      const [clientFiles, debtorsData] = await Promise.all([
        fetchClientFiles(clientId),
        fetchDebtors({ fileId, pageSize: LOAD_PAGE_SIZE }),
      ]);
      const found = clientFiles.find((f) => String(f.id) === String(fileId)) || null;
      setFile(found);
      setDebtors(debtorsData.items || []);
      if (debtorsData.hasMore) {
        toast.info(`Loaded the first ${debtorsData.items.length} cases. Refine your search to narrow further.`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load cases');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, fileId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
    setSelected(new Set());
    loadAll();
    toast.info('Case list refreshed');
  };

  const buckets = useMemo(
    () => Array.from(new Set(debtors.map((d) => d.bucket).filter(Boolean))).sort(),
    [debtors]
  );
  const agentOptions = useMemo(
    () => Array.from(new Set(debtors.map((d) => d.assignedAgent).filter(Boolean))).sort(),
    [debtors]
  );

  const toggleAgent = (name) => {
    setFilters((p) => ({
      ...p,
      agents: p.agents.includes(name)
        ? p.agents.filter((a) => a !== name)
        : [...p.agents, name],
    }));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = appliedFilters;
    const amt = f.amountValue !== '' ? Number(f.amountValue) : null;
    return debtors.filter((d) => {
      if (q) {
        const hay = `${d.name || ''} ${d.cfid || ''} ${d.id} ${d.phone || ''} ${d.assignedAgent || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.priority && d.bucket !== f.priority) return false;
      if (f.agents.length > 0 && !f.agents.includes(d.assignedAgent)) return false;
      if (f.amountOp && amt != null && Number.isFinite(amt)) {
        const loan = Number(d.loanAmount) || 0;
        if (f.amountOp === 'gt' && !(loan > amt)) return false;
        if (f.amountOp === 'lt' && !(loan < amt)) return false;
        if (f.amountOp === 'eq' && !(loan === amt)) return false;
        if (f.amountOp === 'gte' && !(loan >= amt)) return false;
        if (f.amountOp === 'lte' && !(loan <= amt)) return false;
      }
      if (f.paymentStatus && derivePaymentStatus(d) !== f.paymentStatus) return false;
      if (f.assignment === 'assigned' && !d.assignedAgent) return false;
      if (f.assignment === 'unassigned' && d.assignedAgent) return false;
      if (f.dateFrom || f.dateTo) {
        const created = toDateString(d.createdAt);
        if (!created) return false;
        if (f.dateFrom && created < f.dateFrom) return false;
        if (f.dateTo && created > f.dateTo) return false;
      }
      return true;
    });
  }, [debtors, search, appliedFilters]);

  useEffect(() => { setPage(1); }, [search, appliedFilters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const stats = useMemo(() => {
    const totalCases = debtors.length;
    const assigned = debtors.filter((d) => d.assignedAgent).length;
    const unassigned = totalCases - assigned;
    return { totalCases, assigned, unassigned };
  }, [debtors]);

  const activeFilterCount = useMemo(() => {
    const f = appliedFilters;
    let n = 0;
    if (f.priority) n += 1;
    if (f.agents.length > 0) n += 1;
    if (f.amountOp && f.amountValue !== '') n += 1;
    if (f.paymentStatus) n += 1;
    if (f.assignment) n += 1;
    if (f.dateFrom || f.dateTo) n += 1;
    return n;
  }, [appliedFilters]);

  const applyFilters = () => {
    setAppliedFilters(filters);
    setAgentOpen(false);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setAgentOpen(false);
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = pageRows.length > 0 && pageRows.every((d) => selected.has(d.id));
  const someVisibleSelected = selected.size > 0 && !allVisibleSelected;
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        pageRows.forEach((d) => next.delete(d.id));
      } else {
        pageRows.forEach((d) => next.add(d.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const openAssignSelected = () => {
    if (selected.size === 0) {
      toast.error('Select at least one case');
      return;
    }
    setAssignModal({ selectedDebtorIds: Array.from(selected) });
  };

  const openReassignRow = (debtor) => {
    setAssignModal({ selectedDebtorIds: [debtor.id] });
  };

  const openNewCaseAssignment = () => {
    setAssignModal({ selectedDebtorIds: null });
  };

  const handleUnassign = async (debtorIds, label) => {
    setWorking(true);
    try {
      const result = await unassignFileCases(fileId, debtorIds);
      toast.success(`Unassigned ${result.unallocated} case(s)${label ? ` from ${label}` : ''}.`);
      clearSelection();
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unassign cases');
    } finally {
      setWorking(false);
    }
  };

  const confirmUnassignSelected = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one case');
      return;
    }
    await confirm({
      title: 'Unassign selected cases',
      message: `Unassign ${selected.size} selected case(s)?`,
      detail: 'The chosen cases will no longer have an assigned agent. Affected agents will be notified.',
      confirmText: 'Unassign Selected',
      confirmLoadingText: 'Unassigning…',
      onConfirm: () => handleUnassign(Array.from(selected)),
    });
  };

  const confirmUnassignRow = async (debtor) => {
    await confirm({
      title: 'Unassign case',
      message: `Unassign case ${debtor.cfid || debtor.id} from ${debtor.assignedAgent}?`,
      detail: 'The agent currently assigned will be notified.',
      confirmText: 'Unassign',
      confirmLoadingText: 'Unassigning…',
      onConfirm: () => handleUnassign([debtor.id], debtor.assignedAgent),
    });
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    const rows = filtered.map((d, i) => ({
      '#': i + 1,
      'Debtor Name': d.name || '',
      CFID: d.cfid || '',
      'Case Id': d.id,
      'Loan Amount': d.loanAmount || 0,
      'Total Paid': d.totalPaid || 0,
      Phone: d.phone || '',
      'Priority (Bucket)': d.bucket || '',
      'Payment Status': derivePaymentStatus(d),
      'Assigned Agent': d.assignedAgent || '',
      'Case Status': d.assignedAgent ? 'assigned' : 'unassigned',
      'Outsourced Date': toDateString(d.createdAt) || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cases');
    XLSX.writeFile(wb, `file-${fileId}-cases-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} case${rows.length === 1 ? '' : 's'} exported`);
  };

  const importStub = () => {
    toast.info('Import Assignments workflow is being finalized. Check back soon.');
  };

  useEffect(() => {
    if (canAssignCases) {
      setActions(
        <>
          <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
            <RefreshCw className="icon-sm" />
          </button>
          <button type="button" className="btn-sm dm-export-btn" onClick={importStub}>
            <Upload className="icon-sm" />
            Import Assignments
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={openNewCaseAssignment}>
            <Plus className="icon-sm" />
            New Case Assignment
          </button>
        </>,
      );
    } else {
      setActions(
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
          <RefreshCw className="icon-sm" />
        </button>,
      );
    }
    return () => setActions(null);
  }, [setActions, canAssignCases]);

  const fileName = file?.fileName || `File #${fileId}`;
  const clientName = file?.clientName || '';

  return (
    <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
      {/* Top action bar */}
      <div className="cfm-top-bar">
        <div className="cfm-top-bar-left">
          <button
            type="button"
            className="cfm-btn-back"
            onClick={() => navigate(`/case-management/clients/${clientId}/files`)}
          >
            <ArrowLeft className="icon-sm" />
            Back to Batches
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
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="cfm-filter-panel">
          <div className="cfm-filter-grid">
            {/* Priority → bucket */}
            <div className="af-field">
              <span className="af-label">Priority</span>
              <select
                className="af-select"
                value={filters.priority}
                onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value }))}
              >
                <option value="">Select…</option>
                {buckets.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Agent → multi-select */}
            <div className="af-field">
              <span className="af-label">Agent</span>
              <div className="fca-multi">
                <button
                  type="button"
                  className={`af-select fca-multi-trigger${agentOpen ? ' is-open' : ''}`}
                  onClick={() => setAgentOpen((v) => !v)}
                  aria-expanded={agentOpen}
                >
                  <span className="fca-multi-value">
                    {filters.agents.length === 0
                      ? 'Select Agents'
                      : filters.agents.length === 1
                        ? filters.agents[0]
                        : `${filters.agents.length} agents selected`}
                  </span>
                  <ChevronDown className="fca-multi-chevron" />
                </button>
                {agentOpen && (
                  <>
                    <button
                      type="button"
                      className="fca-multi-backdrop"
                      onClick={() => setAgentOpen(false)}
                      aria-label="Close agent picker"
                      tabIndex={-1}
                    />
                    <div className="fca-multi-panel">
                      {agentOptions.length === 0 ? (
                        <p className="fca-multi-empty">No agents assigned in this file.</p>
                      ) : (
                        agentOptions.map((a) => {
                          const checked = filters.agents.includes(a);
                          return (
                            <label key={a} className="fca-multi-option">
                              <input
                                type="checkbox"
                                className="fca-check"
                                checked={checked}
                                onChange={() => toggleAgent(a)}
                              />
                              <span>{a}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Amount comparison */}
            <div className="af-field">
              <span className="af-label">Amount Comparison</span>
              <div className="fca-amount-row">
                <select
                  className="af-select"
                  value={filters.amountOp}
                  onChange={(e) => setFilters((p) => ({ ...p, amountOp: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {AMOUNT_OPS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="af-input"
                  placeholder="Enter amount"
                  value={filters.amountValue}
                  onChange={(e) => setFilters((p) => ({ ...p, amountValue: e.target.value }))}
                />
              </div>
            </div>

            {/* Payment status */}
            <div className="af-field">
              <span className="af-label">Payment Status</span>
              <select
                className="af-select"
                value={filters.paymentStatus}
                onChange={(e) => setFilters((p) => ({ ...p, paymentStatus: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="paid">Paid</option>
                <option value="partial">Partially Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            {/* Assignment status */}
            <div className="af-field">
              <span className="af-label">Assignment Status</span>
              <select
                className="af-select"
                value={filters.assignment}
                onChange={(e) => setFilters((p) => ({ ...p, assignment: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Outsourced date range → createdAt */}
            <div className="af-field af-field-range">
              <span className="af-label">Outsourced Date Range</span>
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

      {/* Bulk action bar (supervisors / non-Agent users) */}
      {canAssignCases && (
        <div className="fca-bulk-bar">
          <div className="fca-bulk-meta">
            <CheckCircle2 className="icon-sm" />
            <span>{selected.size} selected</span>
            {selected.size > 0 && (
              <button type="button" className="fca-clear-selection" onClick={clearSelection}>
                Clear
              </button>
            )}
          </div>
          <div className="fca-bulk-actions">
            <button
              type="button"
              className="fca-bulk-btn"
              onClick={openAssignSelected}
              disabled={selected.size === 0 || working}
            >
              <UserCog className="icon-sm" />
              Assign Selected Cases
            </button>
            <button
              type="button"
              className="fca-bulk-btn fca-bulk-btn--danger"
              onClick={confirmUnassignSelected}
              disabled={selected.size === 0 || working}
            >
              <XCircle className="icon-sm" />
              Unassign Selected Cases
            </button>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="cm-table-card">
        <SectionHeader
          icon={FileText}
          title={fileName}
          count={filtered.length}
        />

        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by debtor, CFID, case id, phone or agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cfm-toolbar-actions">
            <button type="button" className="cfm-utility-btn" onClick={handleRefresh} aria-label="Refresh view">
              <Eye className="icon-sm" />
              <span>View</span>
            </button>
            <button type="button" className="cfm-utility-btn" onClick={handleExport} aria-label="Export cases">
              <Download className="icon-sm" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="cm-table-wrap">
          <table className="cm-table fca-table">
            <thead>
              <tr>
                {canAssignCases && (
                  <th className="cm-th fca-th-check">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="fca-check"
                      aria-label="Select all visible cases"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      disabled={pageRows.length === 0}
                    />
                  </th>
                )}
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor Name</th>
                <th className="cm-th">CFID</th>
                <th className="cm-th">Case Id</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Loan Amount<br />
                  <span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th">Phone</th>
                <th className="cm-th">Assigned Agent</th>
                <th className="cm-th">Case Status</th>
                {canAssignCases && <th className="cm-th cm-th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={canAssignCases ? 10 : 9}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading cases…</p>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={canAssignCases ? 10 : 9}>
                    <div className="cm-empty-state">
                      <FileText className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No cases found</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'This batch file has no debtor cases yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((d, idx) => {
                  const isAssigned = Boolean(d.assignedAgent);
                  const checked = selected.has(d.id);
                  return (
                    <tr key={d.id} className={`cm-table-row${checked ? ' fca-row--selected' : ''}`}>
                      {canAssignCases && (
                        <td className="cm-td fca-td-check">
                          <input
                            type="checkbox"
                            className="fca-check"
                            aria-label={`Select case ${d.cfid || d.id}`}
                            checked={checked}
                            onChange={() => toggleRow(d.id)}
                          />
                        </td>
                      )}
                      <td className="cm-td cm-td-index">{pageStart + idx + 1}</td>
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="dm-debtor-avatar" aria-hidden="true">
                            <UserCog className="cm-client-avatar-icon" />
                          </span>
                          <p className="cm-client-name">{d.name || '—'}</p>
                        </div>
                      </td>
                      <td className="cm-td dm-td-cfid">
                        <code className="dm-cfid-badge dm-cfid-badge--sm">{d.cfid || '—'}</code>
                      </td>
                      <td className="cm-td cm-td-num">{d.id}</td>
                      <td className="cm-td cm-td-num cm-money">{formatMoneyDecimals(d.loanAmount)}</td>
                      <td className="cm-td dm-td-phone">
                        {d.phone ? (
                          <span className="dm-phone-cell">
                            <span className="dm-phone-icon">@</span>
                            {d.phone}
                          </span>
                        ) : (<span className="dm-muted">—</span>)}
                      </td>
                      <td className="cm-td dm-td-agent">
                        {d.assignedAgent ? (
                          <span className="dm-agent-cell">
                            <span className="dm-agent-dot" />
                            {d.assignedAgent}
                          </span>
                        ) : (<span className="dm-unassigned">Unassigned</span>)}
                      </td>
                      <td className="cm-td">
                        <span className={`fca-status-pill ${isAssigned ? 'fca-status-pill--assigned' : 'fca-status-pill--unassigned'}`}>
                          {isAssigned ? 'assigned' : 'unassigned'}
                        </span>
                      </td>
                      {canAssignCases && (
                        <td className="cm-td cm-td-actions">
                          <div className="fca-row-actions">
                            <button
                              type="button"
                              className="fca-row-btn fca-row-btn--reassign"
                              onClick={() => openReassignRow(d)}
                              disabled={working}
                            >
                              Reassign
                            </button>
                            <button
                              type="button"
                              className="fca-row-btn fca-row-btn--unassign"
                              onClick={() => confirmUnassignRow(d)}
                              disabled={working || !isAssigned}
                              title={isAssigned ? 'Unassign this case' : 'Case is not assigned'}
                            >
                              Unassign
                            </button>
                          </div>
                        </td>
                      )}
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
              <label htmlFor="fca-page-size">Rows per page</label>
              <select
                id="fca-page-size"
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
        open={Boolean(assignModal)}
        file={file ? { id: file.id, fileName: file.fileName, clientName: file.clientName } : { id: Number(fileId) }}
        selectedDebtorIds={assignModal?.selectedDebtorIds ?? undefined}
        onClose={() => setAssignModal(null)}
        onChanged={loadAll}
      />
    </div>
  );
}

export default FileCasesPage;
