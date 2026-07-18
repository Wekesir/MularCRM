import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CalendarClock,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchPtpArrangements, fetchPtpTotals, updatePtpArrangement } from '../../api/ptp';
import { fetchClients } from '../../api/clients';
import { fetchAgents } from '../../api/agents';

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  clientId: '',
  agentId: '',
  status: '',
  channel: '',
  reminderDue: '',
  promiseFrom: '',
  promiseTo: '',
  reminderFrom: '',
  reminderTo: '',
};

const STATUS_META = {
  pending: { label: 'Pending', cls: 'ptp-status ptp-status--pending' },
  kept:    { label: 'Kept',    cls: 'ptp-status ptp-status--kept' },
  broken:  { label: 'Broken',  cls: 'ptp-status ptp-status--broken' },
  cancelled: { label: 'Cancelled', cls: 'ptp-status ptp-status--cancelled' },
};

const CHANNEL_ICONS = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
};

function formatMoney(value, symbol = '') {
  const n = Number(value) || 0;
  const prefix = symbol ? `${symbol} ` : '';
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

function ChannelBadge({ channel }) {
  if (!channel) return <span className="dm-muted">—</span>;
  const Icon = CHANNEL_ICONS[channel] || null;
  return (
    <span className={`mp-chip mp-chip--${channel}`}>
      {Icon && <Icon className="icon-sm" />}
      <span>{channel.charAt(0).toUpperCase() + channel.slice(1)}</span>
    </span>
  );
}

function ReminderCell({ date, status }) {
  if (!date) return <span className="dm-muted">—</span>;
  const formatted = formatDate(date);
  if (status === 'pending' && isOverdue(date)) {
    return <span className="mp-reminder mp-reminder--overdue" title="Overdue reminder">{formatted}</span>;
  }
  if (status === 'pending' && isToday(date)) {
    return <span className="mp-reminder mp-reminder--today" title="Due today">{formatted}</span>;
  }
  return <span className="mp-reminder">{formatted}</span>;
}

function PtpPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();
  const { isAgent } = usePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0, promisedAmount: 0, pendingCount: 0, keptCount: 0,
    brokenCount: 0, remindersDue: 0, pendingAmount: 0,
  });

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [clients, setClients] = useState([]);
  const [agents, setAgents] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '' && v != null).length,
    [appliedFilters]
  );

  const queryFilters = useMemo(
    () => ({ ...appliedFilters, search: search.trim() || undefined }),
    [appliedFilters, search]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, totals] = await Promise.all([
        fetchPtpArrangements({ page, pageSize: PAGE_SIZE, ...queryFilters }),
        fetchPtpTotals(queryFilters),
      ]);
      setItems(list.items || []);
      setTotal(list.total || 0);
      setStats({
        total: totals.total || 0,
        promisedAmount: totals.promisedAmount || 0,
        pendingCount: totals.pendingCount || 0,
        keptCount: totals.keptCount || 0,
        brokenCount: totals.brokenCount || 0,
        remindersDue: totals.remindersDue || 0,
        pendingAmount: totals.pendingAmount || 0,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load PTP arrangements');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, queryFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const tasks = [fetchClients()];
    if (!isAgent) tasks.push(fetchAgents());
    Promise.all(tasks)
      .then(([clientRows, agentRows]) => {
        if (cancelled) return;
        setClients(Array.isArray(clientRows) ? clientRows : clientRows?.items || []);
        if (agentRows) setAgents(Array.isArray(agentRows) ? agentRows : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAgent]);

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={loadData}>
          <RefreshCw className={`icon-sm${isLoading ? ' animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          className={`af-toggle${showFilters ? ' af-toggle--active' : ''}${activeFilterCount > 0 ? ' af-toggle--has' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="icon-sm" />
          <span>Filters</span>
          {activeFilterCount > 0 && <span className="af-toggle-count">{activeFilterCount}</span>}
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, loadData, isLoading, showFilters, activeFilterCount]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const applyFilters = () => { setAppliedFilters(filters); setPage(1); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setPage(1); };

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    try {
      await updatePtpArrangement(id, { status });
      toast.success('PTP status updated');
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update PTP');
    } finally {
      setUpdatingId(null);
    }
  };

  const colCount = isAgent ? 7 : 8;

  return (
    <div className="space-y-6 min-h-[50vh]">
      <section className="cm-stat-grid">
        <StatCard
          icon={CalendarCheck2}
          numericValue={stats.total}
          label="Total PTPs"
          meta="All arrangements"
          accent="var(--theme-color)"
          variant="compact"
        />
        <StatCard
          icon={CalendarClock}
          numericValue={stats.remindersDue}
          label="Reminders due"
          meta="Pending &amp; overdue"
          accent="#ef4444"
          variant="compact"
        />
        <StatCard
          icon={CircleCheck}
          numericValue={stats.pendingAmount}
          label={`Pending (${currencySymbol})`}
          meta={`${stats.pendingCount} open promises`}
          accent="#f59e0b"
          variant="compact"
        />
        <StatCard
          icon={CircleX}
          numericValue={stats.brokenCount}
          label="Broken"
          meta={`${stats.keptCount} kept`}
          accent="#64748b"
          variant="compact"
        />
      </section>

      <div className="cm-table-card">
        <SectionHeader
          icon={CalendarCheck2}
          title="Arrangements"
          count={total}
        />

        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <CalendarCheck2 className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search debtor, client, agent…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="af-panel">
            <div className="af-grid">
              <div className="af-field">
                <span className="af-label">Client</span>
                <select className="af-select" value={filters.clientId} onChange={(e) => setFilters((p) => ({ ...p, clientId: e.target.value }))}>
                  <option value="">All clients</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {!isAgent && (
                <div className="af-field">
                  <span className="af-label">Agent</span>
                  <select className="af-select" value={filters.agentId} onChange={(e) => setFilters((p) => ({ ...p, agentId: e.target.value }))}>
                    <option value="">All agents</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="af-field">
                <span className="af-label">Status</span>
                <select className="af-select" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                  <option value="">Any status</option>
                  {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
              </div>
              <div className="af-field">
                <span className="af-label">Channel</span>
                <select className="af-select" value={filters.channel} onChange={(e) => setFilters((p) => ({ ...p, channel: e.target.value }))}>
                  <option value="">Any channel</option>
                  <option value="call">Call</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div className="af-field">
                <span className="af-label">Reminder due</span>
                <select className="af-select" value={filters.reminderDue} onChange={(e) => setFilters((p) => ({ ...p, reminderDue: e.target.value }))}>
                  <option value="">Any</option>
                  <option value="due">Due / overdue</option>
                  <option value="today">Today</option>
                  <option value="overdue">Overdue</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
              <div className="af-field af-field-range">
                <span className="af-label">Promise date</span>
                <div className="af-range">
                  <input type="date" className="af-input" value={filters.promiseFrom} onChange={(e) => setFilters((p) => ({ ...p, promiseFrom: e.target.value }))} />
                  <span className="af-range-sep">→</span>
                  <input type="date" className="af-input" value={filters.promiseTo} onChange={(e) => setFilters((p) => ({ ...p, promiseTo: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="af-actions">
              <button type="button" className="btn-icon-outline af-clear-btn" onClick={clearFilters}>
                <X className="icon-sm" /> Clear all
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor</th>
                <th className="cm-th">Client</th>
                {!isAgent && <th className="cm-th">Agent</th>}
                <th className="cm-th cm-th-num cm-th-money">
                  Amount<br /><span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th cm-th-date">Promise Date</th>
                <th className="cm-th cm-th-date">Reminder</th>
                <th className="cm-th">Channel</th>
                <th className="cm-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading PTP arrangements…</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={colCount}>
                    <div className="cm-empty-state">
                      <CalendarCheck2 className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No PTP arrangements yet</p>
                      <p className="cm-empty-desc">
                        {activeFilterCount > 0 || search
                          ? 'Try clearing filters.'
                          : 'When an agent logs a Promise to Pay response in My Portfolio, it will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const meta = STATUS_META[item.status] || STATUS_META.pending;
                  return (
                    <tr key={item.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="cm-td">
                        <p className="cm-client-name">{item.debtorName}</p>
                        {item.debtorPhone && <p className="cm-client-type">{item.debtorPhone}</p>}
                      </td>
                      <td className="cm-td">{item.clientName ? <span className="dm-client-link">{item.clientName}</span> : <span className="dm-muted">—</span>}</td>
                      {!isAgent && <td className="cm-td">{item.agentName ? <span className="dm-agent-cell"><span className="dm-agent-dot" />{item.agentName}</span> : <span className="dm-muted">—</span>}</td>}
                      <td className="cm-td cm-td-num cm-money">
                        {formatMoney(item.promisedAmount, item.currencySymbol || currencySymbol)}
                      </td>
                      <td className="cm-td cm-td-date">{formatDate(item.promiseDate)}</td>
                      <td className="cm-td cm-td-date">
                        <ReminderCell date={item.reminderDate} status={item.status} />
                      </td>
                      <td className="cm-td">
                        <ChannelBadge channel={item.channel} />
                      </td>
                      <td className="cm-td">
                        <div className={`ptp-status-wrap ptp-status-wrap--${item.status}`}>
                          <span className={meta.cls}>{meta.label}</span>
                          <select
                            className="ptp-status-select"
                            value={item.status}
                            disabled={updatingId === item.id}
                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                            aria-label="Change PTP status"
                          >
                            {Object.entries(STATUS_META).map(([v, m]) => (
                              <option key={v} value={v}>{m.label}</option>
                            ))}
                          </select>
                          {updatingId === item.id && <Loader2 className="ptp-status-spinner" />}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 && (
          <div className="cm-pagination">
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} arrangement{total === 1 ? '' : 's'}
            </p>
            <div className="cm-pagination-controls">
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="First page">
                <ChevronFirst className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} aria-label="Next page">
                <ChevronRight className="icon-sm" />
              </button>
              <button type="button" className="cm-pagination-btn" onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages} aria-label="Last page">
                <ChevronLast className="icon-sm" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PtpPage;
