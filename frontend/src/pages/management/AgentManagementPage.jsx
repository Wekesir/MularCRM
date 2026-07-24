import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCog,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Download,
  Pencil,
  UserCheck,
  UserX,
  Target,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarClock,
  CalendarX2,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import AgentProfileModal from '../../components/AgentProfileModal';
import AgentKpiModal from '../../components/AgentKpiModal';
import AgentCoverageModal from '../../components/AgentCoverageModal';
import AgentHandoffModal from '../../components/AgentHandoffModal';
import ActionMenu from '../../components/ActionMenu';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  fetchAgents,
  updateAgentProfile,
  setAgentStatus,
  updateAgentKpis,
  fetchAgentCoverages,
  createAgentCoverage,
  endAgentCoverage,
  fetchAgentPortfolioCount,
  handoffAgentPortfolio,
} from '../../api/agents';
import { fetchAgentExperienceLevels } from '../../api/agentExperienceLevels';
import { fetchAgentExpertiseAreas } from '../../api/agentExpertiseAreas';
import { fetchCallCenters } from '../../api/callCenters';

const PAGE_SIZE = 10;

const SEARCH_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'callCenterName', label: 'Call Center' },
  { value: 'experience', label: 'Experience' },
  { value: 'expertise', label: 'Expertise' },
  { value: 'workload', label: 'Workload' },
];

const EMPTY_FILTERS = {
  searchField: 'name',
  searchValue: '',
  experience: '',
  expertise: '',
  workload: '',
  status: '',
  callCenterId: '',
};

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function MetricCell({ value, isMoney, currencySymbol }) {
  const n = Number(value) || 0;
  if (n === 0) return <span className="ama-muted">0</span>;
  if (isMoney) {
    return (
      <span className="ama-metric ama-metric-money">
        {currencySymbol} {formatMoney(n)}
      </span>
    );
  }
  return <span className="ama-metric">{formatMoney(n)}</span>;
}

function AgentManagementPage() {
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();
  const { confirm } = useConfirm();
  const { isSystemAdmin, canAssignCases } = usePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [coverages, setCoverages] = useState([]);
  const [experienceLevels, setExperienceLevels] = useState([]);
  const [expertiseAreas, setExpertiseAreas] = useState([]);
  const [callCenters, setCallCenters] = useState([]);

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [editingAgent, setEditingAgent] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [kpiAgent, setKpiAgent] = useState(null);
  const [isSavingKpis, setIsSavingKpis] = useState(false);
  const [workingId, setWorkingId] = useState(null);

  const [coverageAgent, setCoverageAgent] = useState(null);
  const [coveragePortfolio, setCoveragePortfolio] = useState(null);
  const [isSavingCoverage, setIsSavingCoverage] = useState(false);
  const [handoffAgent, setHandoffAgent] = useState(null);
  const [handoffPortfolio, setHandoffPortfolio] = useState(null);
  const [isSavingHandoff, setIsSavingHandoff] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const callCenterId =
        appliedFilters.callCenterId && appliedFilters.callCenterId !== 'unbound'
          ? appliedFilters.callCenterId
          : undefined;
      const [agentData, levels, areas, centers, coverageData] = await Promise.all([
        fetchAgents({
          experience: appliedFilters.experience || undefined,
          expertise: appliedFilters.expertise || undefined,
          workload: appliedFilters.workload || undefined,
          callCenterId,
        }),
        fetchAgentExperienceLevels(),
        fetchAgentExpertiseAreas(),
        fetchCallCenters({ includeInactive: false }).catch(() => []),
        canAssignCases
          ? fetchAgentCoverages().catch(() => [])
          : Promise.resolve([]),
      ]);
      setAgents(agentData);
      setExperienceLevels(levels);
      setExpertiseAreas(areas);
      setCallCenters(Array.isArray(centers) ? centers : []);
      setCoverages(Array.isArray(coverageData) ? coverageData : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load agents');
    } finally {
      setIsLoading(false);
    }
  }, [
    appliedFilters.experience,
    appliedFilters.expertise,
    appliedFilters.workload,
    appliedFilters.callCenterId,
    canAssignCases,
  ]);

  const coverageByAbsentId = useMemo(() => {
    const map = new Map();
    for (const c of coverages) {
      if (c.status === 'active' || c.status === 'scheduled') {
        map.set(Number(c.absentAgentUserId), c);
      }
    }
    return map;
  }, [coverages]);

  useEffect(() => { load(); }, [load]);

  const openFilters = useCallback(() => {
    setFilters({ ...appliedFilters });
    setShowFilters(true);
  }, [appliedFilters]);

  const closeFilters = useCallback(() => setShowFilters(false), []);

  const applyFilters = useCallback(() => {
    setAppliedFilters(filters);
    setShowFilters(false);
    setPage(1);
  }, [filters]);

  const clearFilters = useCallback(() => {
    const empty = { ...EMPTY_FILTERS };
    setFilters(empty);
    setAppliedFilters(empty);
    setShowFilters(false);
    setPage(1);
  }, []);

  useEffect(() => {
    if (!showFilters) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeFilters();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showFilters, closeFilters]);

  const activeFilterCount = useMemo(() => {
    const f = appliedFilters;
    let n = 0;
    if (f.searchValue.trim()) n += 1;
    if (f.experience) n += 1;
    if (f.expertise) n += 1;
    if (f.workload) n += 1;
    if (f.status) n += 1;
    if (f.callCenterId) n += 1;
    return n;
  }, [appliedFilters]);

  // Client-side: quick table search + advanced (searchField/value, status, call center)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = appliedFilters;
    const fieldQ = f.searchValue.trim().toLowerCase();
    return agents.filter((a) => {
      if (q) {
        const hay = `${a.name || ''} ${a.email || ''} ${a.callCenterName || ''} ${a.experience || ''} ${a.expertise || ''} ${a.workload || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fieldQ) {
        const fieldValue = String(a[f.searchField] ?? '').toLowerCase();
        if (!fieldValue.includes(fieldQ)) return false;
      }
      if (f.status === 'active' && !a.isActive) return false;
      if (f.status === 'inactive' && a.isActive) return false;
      if (f.callCenterId === 'unbound') {
        if (a.callCenterId) return false;
      } else if (f.callCenterId) {
        if (Number(a.callCenterId) !== Number(f.callCenterId)) return false;
      }
      return true;
    });
  }, [agents, search, appliedFilters]);

  useEffect(() => { setPage(1); }, [search, appliedFilters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const handleSaveProfile = async (payload) => {
    if (!editingAgent) return;
    setIsSavingProfile(true);
    try {
      const updated = await updateAgentProfile(editingAgent.id, payload);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      toast.success(`Profile updated for ${updated.name}`);
      setEditingAgent(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update agent profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveKpis = async (payload) => {
    if (!kpiAgent) return;
    setIsSavingKpis(true);
    try {
      await updateAgentKpis(kpiAgent.id, payload);
      toast.success(`KPIs saved for ${kpiAgent.name}`);
      setKpiAgent(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save agent KPIs');
    } finally {
      setIsSavingKpis(false);
    }
  };

  const handleToggleStatus = async (agent) => {
    const next = !agent.isActive;
    setWorkingId(agent.id);
    try {
      const updated = await setAgentStatus(agent.id, next);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      toast.success(`${updated.name} ${next ? 'activated' : 'deactivated'}`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update agent status';
      toast.error(msg);
      if (err.response?.status === 409 || err.response?.data?.code === 'PORTFOLIO_PENDING') {
        toast.info('Complete a portfolio handoff first, then deactivate.');
      }
    } finally {
      setWorkingId(null);
    }
  };

  const confirmToggleStatus = (agent) => {
    const activating = !agent.isActive;
    confirm({
      title: `${activating ? 'Activate' : 'Deactivate'} agent`,
      message: `${activating ? 'Activate' : 'Deactivate'} ${agent.name}?`,
      detail: activating
        ? 'The agent will be able to log in and receive case assignments again.'
        : 'The agent will no longer be able to log in. Open portfolios must be handed off first.',
      confirmText: activating ? 'Activate' : 'Deactivate',
      confirmLoadingText: activating ? 'Activating…' : 'Deactivating…',
      onConfirm: () => handleToggleStatus(agent),
    });
  };

  const openCoverageModal = async (agent) => {
    setCoverageAgent(agent);
    setCoveragePortfolio(null);
    try {
      const counts = await fetchAgentPortfolioCount(agent.id);
      setCoveragePortfolio(counts);
    } catch {
      setCoveragePortfolio(null);
    }
  };

  const handleCreateCoverage = async (payload) => {
    setIsSavingCoverage(true);
    try {
      await createAgentCoverage(payload);
      toast.success(`Leave coverage started for ${coverageAgent?.name}`);
      setCoverageAgent(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start coverage');
    } finally {
      setIsSavingCoverage(false);
    }
  };

  const confirmEndCoverage = (agent) => {
    const coverage = coverageByAbsentId.get(Number(agent.id));
    if (!coverage) {
      toast.info('No active or scheduled coverage for this agent');
      return;
    }
    confirm({
      title: 'End leave coverage',
      message: `End coverage for ${agent.name}?`,
      detail: `${coverage.coveringAgentName || 'The covering agent'} will lose access to this portfolio. Cases remain assigned to ${agent.name}.`,
      confirmText: 'End coverage',
      confirmLoadingText: 'Ending…',
      onConfirm: async () => {
        setWorkingId(agent.id);
        try {
          await endAgentCoverage(coverage.id);
          toast.success(`Coverage ended for ${agent.name}`);
          await load();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to end coverage');
        } finally {
          setWorkingId(null);
        }
      },
    });
  };

  const openHandoffModal = async (agent) => {
    setHandoffAgent(agent);
    setHandoffPortfolio(null);
    try {
      const counts = await fetchAgentPortfolioCount(agent.id);
      setHandoffPortfolio(counts);
    } catch {
      setHandoffPortfolio(null);
    }
  };

  const handleHandoff = async (payload) => {
    if (!handoffAgent) return;
    setIsSavingHandoff(true);
    try {
      const result = await handoffAgentPortfolio(handoffAgent.id, payload);
      toast.success(
        result.mode === 'unassign'
          ? `Unassigned ${result.debtorCount} case(s) from ${handoffAgent.name}`
          : `Transferred ${result.debtorCount} case(s) from ${handoffAgent.name}`
      );
      setHandoffAgent(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to hand off portfolio');
    } finally {
      setIsSavingHandoff(false);
    }
  };

  const buildActionItems = (agent) => {
    const items = [];
    if (isSystemAdmin) {
      items.push(
        {
          key: 'edit',
          label: 'Edit Profile',
          icon: Pencil,
          onClick: () => setEditingAgent(agent),
        },
        {
          key: 'kpis',
          label: 'Agent KPIs',
          icon: Target,
          onClick: () => setKpiAgent(agent),
        }
      );
    }
    if (canAssignCases) {
      const activeCoverage = coverageByAbsentId.get(Number(agent.id));
      if (!activeCoverage) {
        items.push({
          key: 'coverage-start',
          label: 'Start leave coverage',
          icon: CalendarClock,
          onClick: () => openCoverageModal(agent),
          disabled: workingId === agent.id,
        });
      } else {
        items.push({
          key: 'coverage-end',
          label: 'End coverage',
          icon: CalendarX2,
          onClick: () => confirmEndCoverage(agent),
          disabled: workingId === agent.id,
        });
      }
      items.push({
        key: 'handoff',
        label: 'Handoff portfolio',
        icon: ArrowRightLeft,
        onClick: () => openHandoffModal(agent),
        disabled: workingId === agent.id,
      });
    }
    if (isSystemAdmin) {
      items.push(
        agent.isActive
          ? {
              key: 'deactivate',
              label: 'Deactivate',
              icon: UserX,
              danger: true,
              onClick: () => confirmToggleStatus(agent),
              disabled: workingId === agent.id,
            }
          : {
              key: 'activate',
              label: 'Activate',
              icon: UserCheck,
              onClick: () => confirmToggleStatus(agent),
              disabled: workingId === agent.id,
            }
      );
    }
    return items;
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    const rows = filtered.map((a, i) => ({
      '#': i + 1,
      'Agent Name': a.name || '',
      Email: a.email || '',
      'Call Center': a.callCenterName || 'Unbound',
      Experience: a.experience || '',
      Expertise: a.expertise || '',
      Workload: a.workload || '',
      Status: a.isActive ? 'Active' : 'Inactive',
      'Files Assigned': a.filesAssigned || 0,
      Collections: a.collections || 0,
      'PTP Amount': a.ptpAmount || 0,
      'PTP Count': a.ptpCount || 0,
      'Calls Made': a.callsMade || 0,
      'SMS Sent': a.smsSent || 0,
      'Emails Sent': a.emailsSent || 0,
      WhatsApp: a.whatsapp || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Agents');
    XLSX.writeFile(wb, `agents-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} agent${rows.length === 1 ? '' : 's'} exported`);
  };

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button
          type="button"
          className={`btn-icon-outline${showFilters || activeFilterCount > 0 ? ' btn-icon-outline--active' : ''}`}
          aria-label="Open filters"
          aria-haspopup="dialog"
          aria-expanded={showFilters}
          onClick={openFilters}
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
        {isSystemAdmin && (
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => navigate('/users')}
          >
            <Plus className="icon-sm" />
            Add Agent
          </button>
        )}
      </>,
    );
    return () => setActions(null);
  }, [setActions, load, isSystemAdmin, navigate, showFilters, activeFilterCount, openFilters]);

  const showActions = isSystemAdmin || canAssignCases;
  const colCount = showActions ? 12 : 11; // # + agent + call center + 8 metrics (+ actions)

  return (
    <div className="cm-page">
      {showFilters && (
        <div
          className="modal-backdrop modal-backdrop-static"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFilters();
          }}
        >
          <div
            className="modal-panel rpt-filter-modal rpt-filter-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ama-filters-modal-title"
          >
            <div className="rpt-filter-modal-header">
              <div className="rpt-filter-modal-title-wrap">
                <span className="rpt-filter-modal-icon" aria-hidden="true">
                  <Filter className="icon-sm" />
                </span>
                <h2 id="ama-filters-modal-title" className="rpt-filter-modal-title">Filters</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeFilters}
                aria-label="Close filters"
              >
                <X className="icon-sm" />
              </button>
            </div>

            <div className="rpt-filter-modal-body">
              <div className="cfm-filter-grid">
                <div className="af-field ama-search-field">
                  <span className="af-label">Search By</span>
                  <select
                    className="af-select"
                    value={filters.searchField}
                    onChange={(e) => {
                      const nextField = e.target.value;
                      setFilters((p) => ({
                        ...p,
                        searchField: nextField,
                        // Switching away from Call Center clears free-text; keep callCenterId
                        // so an already-chosen center still applies until cleared.
                        searchValue: nextField === 'callCenterName' ? '' : p.searchValue,
                      }));
                    }}
                  >
                    {SEARCH_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="af-field ama-search-value">
                  <span className="af-label">
                    {filters.searchField === 'callCenterName' ? 'Call Center' : 'Value'}
                  </span>
                  {filters.searchField === 'callCenterName' ? (
                    <select
                      className="af-select"
                      value={filters.callCenterId}
                      onChange={(e) => setFilters((p) => ({
                        ...p,
                        callCenterId: e.target.value,
                        searchValue: '',
                      }))}
                    >
                      <option value="">Select call center…</option>
                      <option value="unbound">Unbound</option>
                      {callCenters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="af-input"
                      placeholder="Enter value"
                      value={filters.searchValue}
                      onChange={(e) => setFilters((p) => ({ ...p, searchValue: e.target.value }))}
                    />
                  )}
                </div>
                <div className="af-field">
                  <span className="af-label">Experience</span>
                  <select
                    className="af-select"
                    value={filters.experience}
                    onChange={(e) => setFilters((p) => ({ ...p, experience: e.target.value }))}
                  >
                    <option value="">Any</option>
                    {experienceLevels.map((l) => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="af-field">
                  <span className="af-label">Expertise</span>
                  <select
                    className="af-select"
                    value={filters.expertise}
                    onChange={(e) => setFilters((p) => ({ ...p, expertise: e.target.value }))}
                  >
                    <option value="">Any</option>
                    {expertiseAreas.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="af-field">
                  <span className="af-label">Workload</span>
                  <select
                    className="af-select"
                    value={filters.workload}
                    onChange={(e) => setFilters((p) => ({ ...p, workload: e.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="Light">Light</option>
                    <option value="Medium">Medium</option>
                    <option value="Heavy">Heavy</option>
                  </select>
                </div>
                {filters.searchField !== 'callCenterName' && (
                  <div className="af-field">
                    <span className="af-label">Call Center</span>
                    <select
                      className="af-select"
                      value={filters.callCenterId}
                      onChange={(e) => setFilters((p) => ({ ...p, callCenterId: e.target.value }))}
                    >
                      <option value="">Any</option>
                      <option value="unbound">Unbound</option>
                      {callCenters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="af-field">
                  <span className="af-label">Status</span>
                  <select
                    className="af-select"
                    value={filters.status}
                    onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="rpt-filter-modal-actions">
                <button type="button" className="btn-icon-outline af-clear-btn" onClick={clearFilters}>
                  Clear All
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={applyFilters}>
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="cm-table-card">
        <SectionHeader icon={UserCog} title="Agent Management" count={filtered.length} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search agents by name, email, call center or attributes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cfm-toolbar-actions">
            <button type="button" className="cfm-utility-btn" onClick={handleExport} aria-label="Export agents">
              <Download className="icon-sm" />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="cm-table-wrap ama-table-wrap">
          <table className="cm-table ama-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Agent Name</th>
                <th className="cm-th">Call Center</th>
                <th className="cm-th cm-th-num">Files Assigned</th>
                <th className="cm-th cm-th-num">Collections ({currencySymbol})</th>
                <th className="cm-th cm-th-num">PTP Amount ({currencySymbol})</th>
                <th className="cm-th cm-th-num">PTP Count</th>
                <th className="cm-th cm-th-num">Calls Made</th>
                <th className="cm-th cm-th-num">SMS Sent</th>
                <th className="cm-th cm-th-num">Emails Sent</th>
                <th className="cm-th cm-th-num">WhatsApp</th>
                {showActions && <th className="cm-th cm-th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading agents…</p>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount}>
                    <div className="cm-empty-state">
                      <UserCog className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No agents found</p>
                      <p className="cm-empty-desc">
                        {search || activeFilterCount > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Agents appear here once their user accounts are assigned the Agent role.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((agent, idx) => (
                  <tr key={agent.id} className="cm-table-row">
                    <td className="cm-td cm-td-index">{pageStart + idx + 1}</td>
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="cm-client-avatar" aria-hidden="true">
                          <UserCog className="cm-client-avatar-icon" />
                        </span>
                        <div className="ama-agent-meta">
                          <p className="cm-client-name">{agent.name}</p>
                          <p className="cm-client-type">{agent.email}</p>
                          <div className="ama-tags">
                            {agent.experience && <span className="ama-tag">{agent.experience}</span>}
                            {agent.expertise && <span className="ama-tag">{agent.expertise}</span>}
                            {agent.workload && <span className="ama-tag ama-tag--workload">{agent.workload}</span>}
                            {coverageByAbsentId.has(Number(agent.id)) && (
                              <span className="ama-tag ama-tag--coverage">On leave</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="cm-td">
                      {agent.callCenterName ? (
                        <span className="fm-chip">{agent.callCenterName}</span>
                      ) : (
                        <span className="dm-muted">Unbound</span>
                      )}
                    </td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.filesAssigned} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.collections} isMoney currencySymbol={currencySymbol} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.ptpAmount} isMoney currencySymbol={currencySymbol} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.ptpCount} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.callsMade} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.smsSent} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.emailsSent} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.whatsapp} /></td>
                    {showActions && (
                      <td className="cm-td cm-td-actions">
                        <ActionMenu
                          ariaLabel={`Actions for ${agent.name}`}
                          items={buildActionItems(agent)}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-size">
              <label htmlFor="ama-page-size">Rows per page</label>
              <select
                id="ama-page-size"
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

      <AgentProfileModal
        open={Boolean(editingAgent)}
        agent={editingAgent}
        experienceLevels={experienceLevels}
        expertiseAreas={expertiseAreas}
        isSaving={isSavingProfile}
        onClose={() => setEditingAgent(null)}
        onSave={handleSaveProfile}
      />

      <AgentKpiModal
        open={Boolean(kpiAgent)}
        agent={kpiAgent}
        isSaving={isSavingKpis}
        currencySymbol={currencySymbol}
        onClose={() => setKpiAgent(null)}
        onSave={handleSaveKpis}
      />

      <AgentCoverageModal
        open={Boolean(coverageAgent)}
        absentAgent={coverageAgent}
        agents={agents}
        portfolioCount={coveragePortfolio}
        isSaving={isSavingCoverage}
        onClose={() => setCoverageAgent(null)}
        onSave={handleCreateCoverage}
      />

      <AgentHandoffModal
        open={Boolean(handoffAgent)}
        fromAgent={handoffAgent}
        agents={agents}
        portfolioCount={handoffPortfolio}
        isSaving={isSavingHandoff}
        onClose={() => setHandoffAgent(null)}
        onSave={handleHandoff}
      />
    </div>
  );
}

export default AgentManagementPage;
