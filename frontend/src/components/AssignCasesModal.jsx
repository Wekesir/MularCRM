import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, UserCog, Search, Check, ArrowRightLeft, Send, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from './LoadingButton';
import { fetchAgents } from '../api/agents';
import { fetchAgentExperienceLevels } from '../api/agentExperienceLevels';
import { fetchAgentExpertiseAreas } from '../api/agentExpertiseAreas';
import {
  fetchFileAllocation,
  assignFileAgents,
  assignFileCases,
  unassignFileAgents,
  reallocateFileAgents,
} from '../api/caseManagement';
import { WORKLOAD_LEVELS } from '../utils/agentAttributes';

function toggleId(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function AgentPicker({ agents, selected, onToggle, search, onSearch, placeholder, busy }) {
  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [agents, search]);

  return (
    <div className="acm-picker">
      <div className="cm-search-wrap acm-picker-search">
        <Search className="cm-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="cm-search-input"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="acm-agent-list">
        {filtered.length === 0 ? (
          <p className="acm-empty">No agents match the current criteria.</p>
        ) : (
          filtered.map((agent) => {
            const checked = selected.has(agent.id);
            return (
              <label key={agent.id} className={`acm-agent-row ${checked ? 'acm-agent-row--selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(agent.id)}
                  disabled={busy}
                />
                <span className="acm-agent-avatar" aria-hidden="true">
                  <UserCog size={16} />
                </span>
                <span className="acm-agent-meta">
                  <span className="acm-agent-name">{agent.name}</span>
                  <span className="acm-agent-tags">
                    {[agent.experience, agent.expertise, agent.workload].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {checked && <Check size={16} className="acm-agent-check" />}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function AssignCasesModal({ open, onClose, file, onChanged, selectedDebtorIds }) {
  const casesMode = Array.isArray(selectedDebtorIds) && selectedDebtorIds.length > 0;
  const [tab, setTab] = useState('blind');
  const [allocation, setAllocation] = useState(null);
  const [allAgents, setAllAgents] = useState([]);
  const [ruleAgents, setRuleAgents] = useState([]);
  const [experienceLevels, setExperienceLevels] = useState([]);
  const [expertiseAreas, setExpertiseAreas] = useState([]);

  const [blindSearch, setBlindSearch] = useState('');
  const [blindSelected, setBlindSelected] = useState(new Set());

  const [experience, setExperience] = useState('');
  const [expertise, setExpertise] = useState('');
  const [workload, setWorkload] = useState('');
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleSelected, setRuleSelected] = useState(new Set());

  const [reallocateFrom, setReallocateFrom] = useState('');
  const [reallocateTo, setReallocateTo] = useState('');

  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unallocatingId, setUnallocatingId] = useState(null);
  const [reallocating, setReallocating] = useState(false);

  const loadAllocation = useCallback(async () => {
    if (!file?.id) return;
    try {
      const data = await fetchFileAllocation(file.id);
      setAllocation(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load allocation');
    }
  }, [file?.id]);

  const loadAll = useCallback(async () => {
    if (!file?.id) return;
    setLoading(true);
    try {
      const [agents, levels, areas, alloc] = await Promise.all([
        fetchAgents(),
        fetchAgentExperienceLevels(),
        fetchAgentExpertiseAreas(),
        fetchFileAllocation(file.id),
      ]);
      setAllAgents(agents);
      setExperienceLevels(levels);
      setExpertiseAreas(areas);
      setAllocation(alloc);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load assignment data');
    } finally {
      setLoading(false);
    }
  }, [file?.id]);

  useEffect(() => {
    if (open) {
      loadAll();
      setTab('blind');
      setBlindSearch('');
      setBlindSelected(new Set());
      setExperience('');
      setExpertise('');
      setWorkload('');
      setRuleSearch('');
      setRuleSelected(new Set());
      setReallocateFrom('');
      setReallocateTo('');
    }
  }, [open, loadAll]);

  // Refetch the rule-based agent list whenever a criterion changes.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const params = {};
        if (experience) params.experience = experience;
        if (expertise) params.expertise = expertise;
        if (workload) params.workload = workload;
        const data = await fetchAgents(params);
        if (!cancelled) {
          setRuleAgents(data);
          setRuleSelected(new Set());
        }
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.message || 'Failed to filter agents');
      }
    })();
    return () => { cancelled = true; };
  }, [open, experience, expertise, workload]);

  const handleAssign = async (selectedSet) => {
    const agentIds = Array.from(selectedSet);
    if (agentIds.length === 0) {
      toast.error('Select at least one agent');
      return;
    }
    setAssigning(true);
    try {
      if (casesMode) {
        const result = await assignFileCases(file.id, selectedDebtorIds, agentIds);
        toast.success(`Assigned ${result.assigned} case(s) across ${result.agents.length} agent(s).`);
      } else {
        const result = await assignFileAgents(file.id, agentIds);
        toast.success(`Distributed ${result.distributed} case(s) across ${result.agents.length} agent(s).`);
      }
      setBlindSelected(new Set());
      setRuleSelected(new Set());
      await loadAllocation();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign cases');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnallocate = async (agent) => {
    if (!agent.agentId) {
      toast.error('This agent cannot be unallocated (no linked user).');
      return;
    }
    setUnallocatingId(agent.agentId);
    try {
      const result = await unassignFileAgents(file.id, [agent.agentId]);
      toast.success(`Unallocated ${result.unallocated} case(s) from ${agent.agentName}.`);
      await loadAllocation();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unallocate cases');
    } finally {
      setUnallocatingId(null);
    }
  };

  const handleReallocate = async () => {
    if (!reallocateFrom || !reallocateTo) {
      toast.error('Select both a source and target agent');
      return;
    }
    if (reallocateFrom === String(reallocateTo)) {
      toast.error('Source and target agents must differ');
      return;
    }
    setReallocating(true);
    try {
      const result = await reallocateFileAgents(file.id, Number(reallocateFrom), Number(reallocateTo));
      if (!result.reallocated) {
        toast.info(
          `No cases moved from ${result.fromAgent?.name || 'source'} to ${result.toAgent?.name || 'target'}.`
        );
      } else {
        toast.success(
          `Reallocated ${result.reallocated} case(s) from ${result.fromAgent?.name} to ${result.toAgent?.name}.`
        );
      }
      setReallocateFrom('');
      setReallocateTo('');
      await loadAllocation();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reallocate cases');
    } finally {
      setReallocating(false);
    }
  };

  if (!open) return null;

  const allocatedAgents = allocation?.allocated || [];
  const unassignedCount = allocation?.unassignedCases ?? 0;
  const totalCases = allocation?.totalCases ?? 0;

  // Target candidates for reallocation: every agent (so cases can move to
  // someone not yet on the file). Source candidates: currently allocated agents.
  const sourceCandidates = allocatedAgents.filter((a) => a.agentId);
  const targetCandidates = allAgents;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div className="modal-panel acm-panel" role="dialog" aria-modal="true" aria-labelledby="acm-title">
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <UserCog className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="acm-title" className="cf-title">
                {casesMode ? 'Assign Selected Cases' : 'Assign Case Files'}
              </h2>
              <p className="cf-subtitle">
                {file?.fileName || `File #${file?.id}`}{file?.clientName ? ` · ${file.clientName}` : ''}
                {casesMode ? ` · ${selectedDebtorIds.length} case(s) selected` : ''}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={assigning}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="acm-body">
          <div className="acm-left">
            <div className="config-tabs">
              <button
                type="button"
                className={tab === 'blind' ? 'config-tab config-tab-active' : 'config-tab'}
                onClick={() => setTab('blind')}
              >
                Blind Assignment
              </button>
              <button
                type="button"
                className={tab === 'rule' ? 'config-tab config-tab-active' : 'config-tab'}
                onClick={() => setTab('rule')}
              >
                Rule-based Assignment
              </button>
            </div>

            {tab === 'blind' ? (
              <>
                <p className="acm-tab-help">
                  {casesMode ? (
                    <>Select agents to distribute the <strong>{selectedDebtorIds.length}</strong> selected case(s) across (round-robin).</>
                  ) : (
                    <>Select agents to distribute the file's <strong>{unassignedCount}</strong> unassigned case(s) across (round-robin).</>
                  )}
                </p>
                <AgentPicker
                  agents={allAgents}
                  selected={blindSelected}
                  onToggle={(id) => setBlindSelected((prev) => toggleId(prev, id))}
                  search={blindSearch}
                  onSearch={setBlindSearch}
                  placeholder="Search agents by name or email…"
                  busy={assigning}
                />
                <div className="acm-actions">
                  <LoadingButton
                    className="btn-primary btn-sm"
                    onClick={() => handleAssign(blindSelected)}
                    loading={assigning}
                    loadingText="Assigning…"
                  >
                    <Send size={14} />
                    Assign {blindSelected.size > 0 ? `(${blindSelected.size})` : ''}
                  </LoadingButton>
                </div>
              </>
            ) : (
              <>
                <p className="acm-tab-help">
                  {casesMode ? (
                    <>Filter agents by attributes, then assign the <strong>{selectedDebtorIds.length}</strong> selected case(s).</>
                  ) : (
                    <>Filter agents by attributes, then assign the file's <strong>{unassignedCount}</strong> unassigned case(s).</>
                  )}
                </p>
                <div className="acm-rule-filters">
                  <div className="cf-field cf-field-half">
                    <span className="cf-label">Experience</span>
                    <select
                      className="cf-select"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                    >
                      <option value="">Any</option>
                      {experienceLevels.map((l) => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cf-field cf-field-half">
                    <span className="cf-label">Expertise</span>
                    <select
                      className="cf-select"
                      value={expertise}
                      onChange={(e) => setExpertise(e.target.value)}
                    >
                      <option value="">Any</option>
                      {expertiseAreas.map((a) => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cf-field cf-field-half">
                    <span className="cf-label">Workload</span>
                    <select
                      className="cf-select"
                      value={workload}
                      onChange={(e) => setWorkload(e.target.value)}
                    >
                      <option value="">Any</option>
                      {WORKLOAD_LEVELS.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <AgentPicker
                  agents={ruleAgents}
                  selected={ruleSelected}
                  onToggle={(id) => setRuleSelected((prev) => toggleId(prev, id))}
                  search={ruleSearch}
                  onSearch={setRuleSearch}
                  placeholder="Search filtered agents…"
                  busy={assigning}
                />
                <div className="acm-actions">
                  <LoadingButton
                    className="btn-primary btn-sm"
                    onClick={() => handleAssign(ruleSelected)}
                    loading={assigning}
                    loadingText="Assigning…"
                  >
                    <Send size={14} />
                    Assign {ruleSelected.size > 0 ? `(${ruleSelected.size})` : ''}
                  </LoadingButton>
                </div>
              </>
            )}
          </div>

          <div className="acm-right">
            <div className="acm-allocation-head">
              <h3 className="acm-section-title">Current Allocation</h3>
              <span className="acm-allocation-meta">
                {allocation ? `${allocation.assignedCases} of ${totalCases} cases assigned` : 'Loading…'}
              </span>
            </div>

            <div className="acm-allocation-list">
              {loading && !allocation ? (
                <p className="acm-empty">Loading allocation…</p>
              ) : allocatedAgents.length === 0 ? (
                <p className="acm-empty">No agents allocated to this file yet.</p>
              ) : (
                allocatedAgents.map((a) => (
                  <div key={`${a.agentId}-${a.agentName}`} className="acm-allocation-row">
                    <span className="acm-allocation-avatar" aria-hidden="true">
                      <UserCog size={14} />
                    </span>
                    <div className="acm-allocation-meta">
                      <p className="acm-allocation-name">{a.agentName}</p>
                      <p className="acm-allocation-sub">{a.caseCount} case(s) · {a.outstandingTotal.toLocaleString()} outstanding</p>
                    </div>
                    <button
                      type="button"
                      className="btn-danger-sm acm-unalloc-btn"
                      onClick={() => handleUnallocate(a)}
                      disabled={unallocatingId === a.agentId || !a.agentId}
                      title={a.agentId ? 'Unallocate all cases' : 'Agent not linked to a user'}
                    >
                      <Trash2 size={14} />
                      Unallocate
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="acm-reallocate">
              <h4 className="acm-section-title acm-section-title--sm">Reallocate</h4>
              <div className="cf-field">
                <span className="cf-label">From agent</span>
                <select
                  className="cf-select"
                  value={reallocateFrom}
                  onChange={(e) => setReallocateFrom(e.target.value)}
                  disabled={reallocating || sourceCandidates.length === 0}
                >
                  <option value="">{sourceCandidates.length ? 'Select source' : 'No allocated agents'}</option>
                  {sourceCandidates.map((a) => (
                    <option key={a.agentId} value={a.agentId}>{a.agentName} ({a.caseCount})</option>
                  ))}
                </select>
              </div>
              <div className="cf-field">
                <span className="cf-label">To agent</span>
                <select
                  className="cf-select"
                  value={reallocateTo}
                  onChange={(e) => setReallocateTo(e.target.value)}
                  disabled={reallocating}
                >
                  <option value="">Select target</option>
                  {targetCandidates.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <LoadingButton
                className="btn-primary btn-sm acm-reallocate-btn"
                onClick={handleReallocate}
                loading={reallocating}
                loadingText="Reallocating…"
              >
                <ArrowRightLeft size={14} />
                Reallocate
              </LoadingButton>
            </div>
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={assigning}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignCasesModal;
