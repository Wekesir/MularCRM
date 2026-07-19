import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarClock,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  ClipboardList,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  PhoneOff,
  RefreshCw,
  SlidersHorizontal,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import PortfolioSendModal from '../../components/PortfolioSendModal';
import PortfolioResponseModal from '../../components/PortfolioResponseModal';
import PortfolioCaseWorkspace from '../../components/PortfolioCaseWorkspace';
import RestructureLoanModal from '../../components/RestructureLoanModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import {
  fetchAgentPortfolio,
  fetchAgentPortfolioTotals,
  fetchAgentPortfolioBuckets,
  fetchAgentPortfolioClients,
  sendPortfolioSms,
  sendPortfolioEmail,
  logPortfolioResponse,
} from '../../api/agentPortfolio';
import { createLoanRestructure } from '../../api/loanRestructures';
import { fetchContactStatuses } from '../../api/contactStatuses';

const PAGE_SIZE = 25;

const QUICK_TABS = [
  { key: 'all', label: 'All', filters: {} },
  { key: 'not_contacted', label: 'Not Contacted', filters: { contacted: '0' } },
  { key: 'contacted', label: 'Contacted', filters: { contacted: '1' } },
  { key: 'reminders', label: 'Reminders Due', filters: { reminderDue: 'due' } },
];

const EMPTY_FILTERS = {
  clientId: '',
  bucket: '',
  channel: '',
  contactStatusId: '',
  contacted: '',
  ptp: '',
  reminderDue: '',
  overdueDaysMin: '',
  overdueDaysMax: '',
  balanceMin: '',
  balanceMax: '',
  nextActionFrom: '',
  nextActionTo: '',
  lastContactedFrom: '',
  lastContactedTo: '',
};

const FALLBACK_BUCKETS = ['Current', '1-30', '31-60', '61-90', '91-180', '180+'];

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

function isDateDue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
}

function overdueBadgeClass(days) {
  if (days > 90) return 'dm-overdue-badge dm-overdue-badge--danger';
  if (days > 60) return 'dm-overdue-badge dm-overdue-badge--warn';
  if (days > 30) return 'dm-overdue-badge dm-overdue-badge--caution';
  return 'dm-overdue-badge';
}

function bucketClass(bucket) {
  const b = String(bucket || '').toLowerCase();
  if (b.includes('90') || b.includes('120') || b.includes('180') || b.includes('365')) return 'dm-bucket dm-bucket--danger';
  if (b.includes('60')) return 'dm-bucket dm-bucket--warn';
  if (b.includes('30')) return 'dm-bucket dm-bucket--caution';
  return 'dm-bucket dm-bucket--ok';
}

function ChannelChips({ item }) {
  if (!item.isContacted) {
    return (
      <span className="mp-contact-badge mp-contact-badge--none">
        <PhoneOff className="icon-sm" />
        <span>Not contacted</span>
      </span>
    );
  }
  return (
    <div className="mp-channel-chips">
      {item.hasCall && (
        <span className="mp-chip mp-chip--call" title="Called">
          <Phone className="icon-sm" />
          <span>Call</span>
        </span>
      )}
      {item.hasSms && (
        <span className="mp-chip mp-chip--sms" title="SMS">
          <MessageSquare className="icon-sm" />
          <span>SMS</span>
        </span>
      )}
      {item.hasEmail && (
        <span className="mp-chip mp-chip--email" title="Email">
          <Mail className="icon-sm" />
          <span>Email</span>
        </span>
      )}
      {!item.hasCall && !item.hasSms && !item.hasEmail && (
        <span className="mp-contact-badge mp-contact-badge--touched">Contacted</span>
      )}
    </div>
  );
}

function MyPortfolioPage() {
  const { setActions } = usePageActions();
  const { currencySymbol } = useSystemConfig();

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0, outstanding: 0, contacted: 0, notContacted: 0, remindersDue: 0, ptpCount: 0,
  });

  const [search, setSearch] = useState('');
  const [quickTab, setQuickTab] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [clients, setClients] = useState([]);
  const [contactStatuses, setContactStatuses] = useState([]);
  const [buckets, setBuckets] = useState(FALLBACK_BUCKETS);

  const [sendModal, setSendModal] = useState({ open: false, mode: 'sms', debtor: null });
  const [responseModal, setResponseModal] = useState({ open: false, debtor: null, defaultChannel: 'call' });
  const [restructureModal, setRestructureModal] = useState({ open: false, debtor: null });
  const [workspaceDebtor, setWorkspaceDebtor] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '' && v != null).length,
    [appliedFilters]
  );

  const queryFilters = useMemo(() => {
    const tab = QUICK_TABS.find((t) => t.key === quickTab) || QUICK_TABS[0];
    return { ...appliedFilters, ...tab.filters, search: search.trim() || undefined };
  }, [appliedFilters, quickTab, search]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, totals] = await Promise.all([
        fetchAgentPortfolio({ page, pageSize: PAGE_SIZE, ...queryFilters }),
        fetchAgentPortfolioTotals(queryFilters),
      ]);
      setItems(list.items || []);
      setTotal(list.total || 0);
      setStats({
        total: totals.total || 0,
        outstanding: totals.outstanding || 0,
        contacted: totals.contacted || 0,
        notContacted: totals.notContacted || 0,
        remindersDue: totals.remindersDue || 0,
        ptpCount: totals.ptpCount || 0,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load portfolio');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, queryFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAgentPortfolioClients().catch(() => []),
      fetchContactStatuses(),
      fetchAgentPortfolioBuckets().catch(() => []),
    ])
      .then(([clientRows, statusRows, bucketRows]) => {
        if (cancelled) return;
        setClients(Array.isArray(clientRows) ? clientRows : []);
        setContactStatuses(Array.isArray(statusRows) ? statusRows : []);
        const fromApi = Array.isArray(bucketRows) ? bucketRows.filter(Boolean) : [];
        setBuckets(fromApi.length ? fromApi : FALLBACK_BUCKETS);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={loadData}>
          <RefreshCw className={`icon-sm${isLoading ? ' animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          className={`rpt-filter-trigger-btn${activeFilterCount > 0 ? ' af-toggle--has' : ''}`}
          onClick={() => {
            setFilters(appliedFilters);
            setFiltersOpen(true);
          }}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="icon-sm" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rpt-filter-trigger-badge">{activeFilterCount}</span>
          )}
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, loadData, isLoading, activeFilterCount, appliedFilters]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const setFilterField = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    // Modal filters take precedence over quick-tab presets.
    setQuickTab('all');
    setPage(1);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setQuickTab('all');
    setPage(1);
    setFiltersOpen(false);
  };

  const handleSend = async (payload) => {
    if (!sendModal.debtor) return;
    setIsSaving(true);
    try {
      if (sendModal.mode === 'sms') {
        await sendPortfolioSms(sendModal.debtor.id, payload);
        toast.success('SMS sent successfully');
      } else {
        await sendPortfolioEmail(sendModal.debtor.id, payload);
        toast.success('Email sent successfully');
      }
      setSendModal({ open: false, mode: 'sms', debtor: null });
      loadData();
      if (workspaceDebtor?.id === sendModal.debtor.id) {
        setWorkspaceDebtor({ ...workspaceDebtor });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogResponse = async (payload) => {
    if (!responseModal.debtor) return;
    setIsSaving(true);
    try {
      const result = await logPortfolioResponse(responseModal.debtor.id, payload);
      toast.success(result.ptp ? 'PTP recorded — reminder saved' : 'Response logged');
      setResponseModal({ open: false, debtor: null, defaultChannel: 'call' });
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to log response');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestructure = async (payload) => {
    if (!restructureModal.debtor) return;
    setIsSaving(true);
    try {
      await createLoanRestructure(payload);
      toast.success('Repayment plan submitted for supervisor approval');
      setRestructureModal({ open: false, debtor: null });
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to submit restructure');
    } finally {
      setIsSaving(false);
    }
  };

  const openWorkspace = (item) => setWorkspaceDebtor(item);

  const COLS = 7;

  return (
    <div className="space-y-6 min-h-[50vh]">
      <section className="cm-stat-grid">
        <StatCard
          icon={UsersRound}
          numericValue={stats.total}
          label="Assigned cases"
          meta="Active portfolio"
          accent="var(--theme-color)"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          numericValue={stats.outstanding}
          label={`Outstanding (${currencySymbol})`}
          meta="Portfolio balance"
          accent="#f59e0b"
          variant="compact"
        />
        <StatCard
          icon={PhoneOff}
          numericValue={stats.notContacted}
          label="Not contacted"
          meta={`${stats.contacted} already contacted`}
          accent="#64748b"
          variant="compact"
        />
        <StatCard
          icon={CalendarClock}
          numericValue={stats.remindersDue}
          label="Reminders due"
          meta={`${stats.ptpCount} with PTP status`}
          accent="#ef4444"
          variant="compact"
        />
      </section>

      {/* Quick tabs */}
      <div className="config-tabs">
        {QUICK_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={quickTab === tab.key ? 'config-tab config-tab-active' : 'config-tab'}
            onClick={() => { setQuickTab(tab.key); setPage(1); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="cm-table-card">
        <SectionHeader
          icon={Briefcase}
          title="Cases"
          count={total}
        />

        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Briefcase className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search name, phone, account number…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Debtor</th>
                <th className="cm-th">Contact</th>
                <th className="cm-th cm-th-num cm-th-money">
                  Outstanding<br /><span className="cm-th-currency">({currencySymbol})</span>
                </th>
                <th className="cm-th">DPD / Bucket</th>
                <th className="cm-th">Channels</th>
                <th className="cm-th">Next Action</th>
                <th className="cm-th cm-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={COLS + 1}>
                    <div className="cm-empty-state">
                      <Loader2 className="cm-empty-icon spin" aria-hidden="true" />
                      <p className="cm-empty-title">Loading your portfolio…</p>
                      <p className="cm-empty-desc">Fetching assigned cases from the system.</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={COLS + 1}>
                    <div className="cm-empty-state">
                      <Briefcase className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">No cases in this view</p>
                      <p className="cm-empty-desc">
                        {activeFilterCount > 0 || search
                          ? 'Try clearing filters or switching tabs.'
                          : 'Cases assigned to you will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`cm-table-row mp-row-clickable${!item.isContacted ? ' mp-row--untouched' : ''}`}
                    onClick={() => openWorkspace(item)}
                  >
                    <td className="cm-td cm-td-index">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>

                    {/* Debtor */}
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="dm-debtor-avatar" aria-hidden="true">
                          <UsersRound className="cm-client-avatar-icon" />
                        </span>
                        <div>
                          <p className="cm-client-name">{item.name}</p>
                          <p className="cm-client-type">
                            {item.clientName || '—'}
                            {item.accountNumber ? ` · ${item.accountNumber}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="cm-td">
                      {item.phone ? (
                        <span className="dm-phone-cell">
                          <Phone className="dm-phone-icon" />{item.phone}
                        </span>
                      ) : <span className="dm-muted">—</span>}
                      {item.email && (
                        <p className="cm-client-type">{item.email}</p>
                      )}
                    </td>

                    {/* Outstanding */}
                    <td className="cm-td cm-td-num cm-money">
                      {formatMoney(item.outstandingBalance, item.currencySymbol || currencySymbol)}
                    </td>

                    {/* DPD / Bucket */}
                    <td className="cm-td">
                      <div className="mp-dpd-cell">
                        {item.overdueDays > 0
                          ? <span className={overdueBadgeClass(item.overdueDays)}>{item.overdueDays}d</span>
                          : <span className="dm-muted">—</span>}
                        {item.bucket && (
                          <span className={bucketClass(item.bucket)}>{item.bucket}</span>
                        )}
                      </div>
                    </td>

                    {/* Channels */}
                    <td className="cm-td">
                      <ChannelChips item={item} />
                    </td>

                    {/* Next action */}
                    <td className="cm-td cm-td-date">
                      {item.nextActionDate ? (
                        <span className={isDateDue(item.nextActionDate) ? 'mp-date-due' : ''}>
                          {formatDate(item.nextActionDate)}
                        </span>
                      ) : <span className="dm-muted">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="cm-td cm-td-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="mp-actions">
                        <button
                          type="button"
                          className="mp-action-btn"
                          title="Open case — call, SMS, email & activity"
                          aria-label="Open case"
                          onClick={() => openWorkspace(item)}
                        >
                          <Phone className="icon-sm" />
                        </button>
                        <button
                          type="button"
                          className="mp-action-btn mp-action-btn--sms"
                          disabled={!item.phone}
                          title="Send SMS"
                          aria-label="Send SMS"
                          onClick={() => setSendModal({ open: true, mode: 'sms', debtor: item })}
                        >
                          <MessageSquare className="icon-sm" />
                        </button>
                        <button
                          type="button"
                          className="mp-action-btn mp-action-btn--email"
                          disabled={!item.email}
                          title="Send email"
                          aria-label="Send email"
                          onClick={() => setSendModal({ open: true, mode: 'email', debtor: item })}
                        >
                          <Mail className="icon-sm" />
                        </button>
                        <button
                          type="button"
                          className="mp-action-btn mp-action-btn--log"
                          title="Log response"
                          aria-label="Log response"
                          onClick={() => setResponseModal({ open: true, debtor: item, defaultChannel: item.lastContactChannel || 'call' })}
                        >
                          <ClipboardList className="icon-sm" />
                        </button>
                        <button
                          type="button"
                          className="mp-action-btn mp-action-btn--restructure"
                          title="Restructure loan"
                          aria-label="Restructure loan"
                          onClick={() => setRestructureModal({ open: true, debtor: item })}
                        >
                          <CalendarRange className="icon-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 && (
          <div className="cm-pagination">
            <p className="cm-pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {total} case{total === 1 ? '' : 's'}
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

      <PortfolioCaseWorkspace
        open={Boolean(workspaceDebtor)}
        debtor={workspaceDebtor}
        onClose={() => setWorkspaceDebtor(null)}
        onSendSms={(d) => setSendModal({ open: true, mode: 'sms', debtor: d })}
        onSendEmail={(d) => setSendModal({ open: true, mode: 'email', debtor: d })}
        onLogResponse={(d, channel) =>
          setResponseModal({ open: true, debtor: d, defaultChannel: channel || 'call' })
        }
        onRestructure={(d) => setRestructureModal({ open: true, debtor: d })}
      />

      <PortfolioSendModal
        open={sendModal.open}
        mode={sendModal.mode}
        debtor={sendModal.debtor}
        isSaving={isSaving}
        onClose={() => setSendModal({ open: false, mode: 'sms', debtor: null })}
        onSend={handleSend}
      />

      <PortfolioResponseModal
        open={responseModal.open}
        debtor={responseModal.debtor}
        defaultChannel={responseModal.defaultChannel}
        contactStatuses={contactStatuses.filter((s) => s.isActive !== false)}
        isSaving={isSaving}
        onClose={() => setResponseModal({ open: false, debtor: null, defaultChannel: 'call' })}
        onSave={handleLogResponse}
      />

      <RestructureLoanModal
        open={restructureModal.open}
        debtor={restructureModal.debtor}
        isSaving={isSaving}
        onClose={() => setRestructureModal({ open: false, debtor: null })}
        onSave={handleRestructure}
      />

      {filtersOpen && (
        <div
          className="modal-backdrop modal-backdrop-static"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <div
            className="modal-panel rpt-filter-modal rpt-filter-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Portfolio filters"
          >
            <div className="rpt-filter-modal-header">
              <div className="rpt-filter-modal-title-wrap">
                <span className="rpt-filter-modal-icon" aria-hidden="true">
                  <SlidersHorizontal className="icon-sm" />
                </span>
                <h2 className="rpt-filter-modal-title">Filters</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X className="icon-sm" />
              </button>
            </div>

            <div className="rpt-filter-modal-body">
              <form
                className="rpt-filters rpt-filters--modal"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyFilters();
                }}
              >
                <div className="af-grid">
                  <div className="af-field">
                    <span className="af-label">Client</span>
                    <select
                      className="af-select"
                      value={filters.clientId}
                      onChange={(e) => setFilterField('clientId', e.target.value)}
                    >
                      <option value="">All clients</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">Bucket</span>
                    <select
                      className="af-select"
                      value={filters.bucket}
                      onChange={(e) => setFilterField('bucket', e.target.value)}
                    >
                      <option value="">All buckets</option>
                      {buckets.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">Contact status</span>
                    <select
                      className="af-select"
                      value={filters.contactStatusId}
                      onChange={(e) => setFilterField('contactStatusId', e.target.value)}
                    >
                      <option value="">Any status</option>
                      {contactStatuses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">Contacted</span>
                    <select
                      className="af-select"
                      value={filters.contacted}
                      onChange={(e) => setFilterField('contacted', e.target.value)}
                    >
                      <option value="">Any</option>
                      <option value="1">Contacted</option>
                      <option value="0">Not contacted</option>
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">Channel used</span>
                    <select
                      className="af-select"
                      value={filters.channel}
                      onChange={(e) => setFilterField('channel', e.target.value)}
                    >
                      <option value="">Any channel</option>
                      <option value="call">Call</option>
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">PTP</span>
                    <select
                      className="af-select"
                      value={filters.ptp}
                      onChange={(e) => setFilterField('ptp', e.target.value)}
                    >
                      <option value="">Any</option>
                      <option value="1">Has PTP</option>
                      <option value="0">No PTP</option>
                    </select>
                  </div>

                  <div className="af-field">
                    <span className="af-label">Reminders</span>
                    <select
                      className="af-select"
                      value={filters.reminderDue}
                      onChange={(e) => setFilterField('reminderDue', e.target.value)}
                    >
                      <option value="">Any</option>
                      <option value="due">Due (today or overdue)</option>
                      <option value="today">Due today</option>
                      <option value="overdue">Overdue</option>
                      <option value="upcoming">Upcoming</option>
                    </select>
                  </div>

                  <div className="af-field af-field-range">
                    <span className="af-label">DPD range</span>
                    <div className="af-range">
                      <input
                        type="number"
                        className="af-input"
                        min="0"
                        placeholder="Min"
                        value={filters.overdueDaysMin}
                        onChange={(e) => setFilterField('overdueDaysMin', e.target.value)}
                      />
                      <span className="af-range-sep">→</span>
                      <input
                        type="number"
                        className="af-input"
                        min="0"
                        placeholder="Max"
                        value={filters.overdueDaysMax}
                        onChange={(e) => setFilterField('overdueDaysMax', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-field af-field-range">
                    <span className="af-label">Outstanding balance</span>
                    <div className="af-range">
                      <input
                        type="number"
                        className="af-input"
                        min="0"
                        placeholder="Min"
                        value={filters.balanceMin}
                        onChange={(e) => setFilterField('balanceMin', e.target.value)}
                      />
                      <span className="af-range-sep">→</span>
                      <input
                        type="number"
                        className="af-input"
                        min="0"
                        placeholder="Max"
                        value={filters.balanceMax}
                        onChange={(e) => setFilterField('balanceMax', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-field af-field-range">
                    <span className="af-label">Next action date</span>
                    <div className="af-range">
                      <input
                        type="date"
                        className="af-input"
                        value={filters.nextActionFrom}
                        onChange={(e) => setFilterField('nextActionFrom', e.target.value)}
                      />
                      <span className="af-range-sep">→</span>
                      <input
                        type="date"
                        className="af-input"
                        value={filters.nextActionTo}
                        onChange={(e) => setFilterField('nextActionTo', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-field af-field-range">
                    <span className="af-label">Last contacted</span>
                    <div className="af-range">
                      <input
                        type="date"
                        className="af-input"
                        value={filters.lastContactedFrom}
                        onChange={(e) => setFilterField('lastContactedFrom', e.target.value)}
                      />
                      <span className="af-range-sep">→</span>
                      <input
                        type="date"
                        className="af-input"
                        value={filters.lastContactedTo}
                        onChange={(e) => setFilterField('lastContactedTo', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="rpt-filter-modal-actions">
                  <button type="button" className="rpt-reset-btn" onClick={clearFilters}>
                    <X className="icon-sm" />
                    Reset
                  </button>
                  <button type="submit" className="btn-primary btn-sm">
                    Apply filters
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPortfolioPage;
