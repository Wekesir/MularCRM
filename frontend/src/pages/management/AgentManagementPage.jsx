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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import AgentProfileModal from '../../components/AgentProfileModal';
import AgentKpiModal from '../../components/AgentKpiModal';
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
} from '../../api/agents';
import { fetchAgentExperienceLevels } from '../../api/agentExperienceLevels';
import { fetchAgentExpertiseAreas } from '../../api/agentExpertiseAreas';

const PAGE_SIZE = 10;

const SEARCH_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
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
};

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function LastLoginCell({ value }) {
  const parts = formatDateTime(value);
  if (!parts) return <span className="ama-muted">Never</span>;
  return (
    <div className="ama-last-login">
      <span className="ama-last-login-date">{parts.date}</span>
      <span className="ama-last-login-time">{parts.time}</span>
    </div>
  );
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
  const { isSystemAdmin } = usePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [experienceLevels, setExperienceLevels] = useState([]);
  const [expertiseAreas, setExpertiseAreas] = useState([]);

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

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentData, levels, areas] = await Promise.all([
        fetchAgents({
          experience: appliedFilters.experience || undefined,
          expertise: appliedFilters.expertise || undefined,
          workload: appliedFilters.workload || undefined,
        }),
        fetchAgentExperienceLevels(),
        fetchAgentExpertiseAreas(),
      ]);
      setAgents(agentData);
      setExperienceLevels(levels);
      setExpertiseAreas(areas);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load agents');
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters.experience, appliedFilters.expertise, appliedFilters.workload]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    setAppliedFilters(filters);
    setShowFilters(false);
    setPage(1);
  };

  const clearFilters = () => {
    const empty = { ...EMPTY_FILTERS };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    const f = appliedFilters;
    let n = 0;
    if (f.searchValue.trim()) n += 1;
    if (f.experience) n += 1;
    if (f.expertise) n += 1;
    if (f.workload) n += 1;
    if (f.status) n += 1;
    return n;
  }, [appliedFilters]);

  // Client-side: quick table search + advanced (searchField/value, status)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = appliedFilters;
    const fieldQ = f.searchValue.trim().toLowerCase();
    return agents.filter((a) => {
      if (q) {
        const hay = `${a.name || ''} ${a.email || ''} ${a.experience || ''} ${a.expertise || ''} ${a.workload || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fieldQ) {
        const fieldValue = String(a[f.searchField] ?? '').toLowerCase();
        if (!fieldValue.includes(fieldQ)) return false;
      }
      if (f.status === 'active' && !a.isActive) return false;
      if (f.status === 'inactive' && a.isActive) return false;
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
      toast.error(err.response?.data?.message || 'Failed to update agent status');
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
        : 'The agent will no longer be able to log in. Existing case assignments are preserved.',
      confirmText: activating ? 'Activate' : 'Deactivate',
      confirmLoadingText: activating ? 'Activating…' : 'Deactivating…',
      onConfirm: () => handleToggleStatus(agent),
    });
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    const rows = filtered.map((a, i) => {
      const ll = formatDateTime(a.lastLogin);
      return {
        '#': i + 1,
        'Agent Name': a.name || '',
        Email: a.email || '',
        'Last Login': ll ? `${ll.date} ${ll.time}` : 'Never',
        Experience: a.experience || '',
        Expertise: a.expertise || '',
        Workload: a.workload || '',
        Status: a.isActive ? 'Active' : 'Inactive',
        'Files Assigned': a.filesAssigned || 0,
        'Collections': a.collections || 0,
        'PTP Amount': a.ptpAmount || 0,
        'PTP Count': a.ptpCount || 0,
        'Calls Made': a.callsMade || 0,
        'SMS Sent': a.smsSent || 0,
        'Emails Sent': a.emailsSent || 0,
        'WhatsApp': a.whatsapp || 0,
      };
    });
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
  }, [setActions, load, isSystemAdmin, navigate, showFilters, activeFilterCount, setShowFilters]);

  const colCount = 12; // # + 10 data cols + actions

  return (
    <div className="cm-page">
      {/* Filter panel */}
      {showFilters && (
        <div className="cfm-filter-panel">
          <div className="cfm-filter-grid">
            <div className="af-field ama-search-field">
              <span className="af-label">Search By</span>
              <select
                className="af-select"
                value={filters.searchField}
                onChange={(e) => setFilters((p) => ({ ...p, searchField: e.target.value }))}
              >
                {SEARCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="af-field ama-search-value">
              <span className="af-label">Value</span>
              <input
                type="text"
                className="af-input"
                placeholder="Enter value"
                value={filters.searchValue}
                onChange={(e) => setFilters((p) => ({ ...p, searchValue: e.target.value }))}
              />
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
        <SectionHeader icon={UserCog} title="Agent Management" count={filtered.length} />

        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search agents by name, email or attributes…"
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
                <th className="cm-th">Last Login</th>
                <th className="cm-th cm-th-num">Files Assigned</th>
                <th className="cm-th cm-th-num">Collections ({currencySymbol})</th>
                <th className="cm-th cm-th-num">PTP Amount ({currencySymbol})</th>
                <th className="cm-th cm-th-num">PTP Count</th>
                <th className="cm-th cm-th-num">Calls Made</th>
                <th className="cm-th cm-th-num">SMS Sent</th>
                <th className="cm-th cm-th-num">Emails Sent</th>
                <th className="cm-th cm-th-num">WhatsApp</th>
                {isSystemAdmin && <th className="cm-th cm-th-actions">Actions</th>}
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
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="cm-td"><LastLoginCell value={agent.lastLogin} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.filesAssigned} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.collections} isMoney currencySymbol={currencySymbol} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.ptpAmount} isMoney currencySymbol={currencySymbol} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.ptpCount} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.callsMade} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.smsSent} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.emailsSent} /></td>
                    <td className="cm-td cm-td-num"><MetricCell value={agent.whatsapp} /></td>
                    {isSystemAdmin && (
                      <td className="cm-td cm-td-actions">
                        <ActionMenu
                          ariaLabel={`Actions for ${agent.name}`}
                          items={[
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
                            },
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
                                },
                          ]}
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
    </div>
  );
}

export default AgentManagementPage;
