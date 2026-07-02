import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Send, Wallet, Search, X } from 'lucide-react';
import LazyDataTable from '../../components/LazyDataTable';
import StatCard from '../../components/StatCard';
import { fetchSmsLogsStats } from '../../api/sms';
import { fetchSmsBalance } from '../../api/systemConfig';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'general', label: 'General' },
  { value: 'otp', label: 'OTP' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'test', label: 'Test' },
  { value: 'client_onboarding', label: 'Client Onboarding' },
];

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value) {
  if (!value) return '<span class="audit-muted">—</span>';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return escapeHtml(
    d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function statusBadge(status) {
  const value = String(status || '').toLowerCase();
  const ok = value === 'sent';
  const cls = ok ? 'audit-badge audit-badge-success' : 'audit-badge audit-badge-danger';
  return `<span class="${cls}">${escapeHtml(status || 'unknown')}</span>`;
}

const COLUMNS = [
  {
    data: 'recipient',
    title: 'Recipient',
    render: (data, type, row) => {
      if (type !== 'display') return data || '';
      const name = row.userName ? `<span class="audit-muted">${escapeHtml(row.userName)}</span>` : '';
      return `<div class="audit-stack"><span class="audit-strong">${escapeHtml(data || '—')}</span>${name}</div>`;
    },
  },
  {
    data: 'message',
    title: 'Message',
    orderable: false,
    render: (data) => {
      if (!data) return '<span class="audit-muted">—</span>';
      const text = String(data);
      const trimmed = text.length > 70 ? `${text.slice(0, 70)}…` : text;
      return `<span class="audit-message" title="${escapeHtml(text)}">${escapeHtml(trimmed)}</span>`;
    },
  },
  {
    data: 'category',
    title: 'Category',
    render: (data) => `<span class="audit-chip">${escapeHtml(data || 'general')}</span>`,
  },
  { data: 'status', title: 'Status', render: (data) => statusBadge(data) },
  { data: 'segments', title: 'Segments', render: (data) => escapeHtml(data ?? 0) },
  { data: 'senderId', title: 'Sender ID', render: (data) => escapeHtml(data || '—') },
  { data: 'createdAt', title: 'Sent At', render: (data) => formatDateTime(data) },
];

function buildAppliedParams({ search, status, category, dateFrom, dateTo }) {
  const params = {};
  if (search.trim()) params['search[value]'] = search.trim();
  if (status) params.status = status;
  if (category) params.category = category;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  return params;
}

function BulkSmsPage() {
  const [stats, setStats] = useState(null);
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState(null);
  const [draft, setDraft] = useState({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsData, balanceData] = await Promise.allSettled([
          fetchSmsLogsStats(),
          fetchSmsBalance(),
        ]);

        if (cancelled) return;

        if (statsData.status === 'fulfilled') setStats(statsData.value);
        else toast.error(statsData.reason?.response?.data?.message || 'Failed to load SMS stats');

        if (balanceData.status === 'fulfilled') {
          setBalance(balanceData.value);
          setBalanceError(null);
        } else {
          setBalance(null);
          setBalanceError(balanceData.reason?.response?.data?.message || 'Balance unavailable');
        }
      } catch (error) {
        if (!cancelled) toast.error('Failed to load SMS overview');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const appliedParams = useMemo(() => buildAppliedParams(applied), [applied]);
  const hasActiveFilters = Boolean(
    applied.search || applied.status || applied.category || applied.dateFrom || applied.dateTo
  );

  const applyFilters = (event) => {
    event?.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      toast.error('"From" date cannot be after "To" date');
      return;
    }
    setApplied({ ...draft });
    setRefreshKey((k) => k + 1);
  };

  const clearFilters = () => {
    setDraft({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
    setApplied({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
    setRefreshKey((k) => k + 1);
  };

  const sentThisMonth = stats?.sentThisMonth ?? 0;
  const balanceValue = balance?.balance;
  const hasBalance = balanceValue !== null && balanceValue !== undefined && balanceValue !== '';

  return (
    <div className="bulk-sms-page">
      <section className="stat-grid-compact bulk-sms-stat-grid">
        <StatCard
          icon={Send}
          numericValue={sentThisMonth}
          decimals={0}
          label="SMS Sent"
          meta="This month"
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={Wallet}
          value={hasBalance ? undefined : '—'}
          numericValue={hasBalance ? Number(balanceValue) : null}
          decimals={Number.isFinite(Number(balanceValue)) && String(balanceValue).includes('.') ? 2 : 0}
          label="SMS Balance"
          meta={balanceError || 'SMS credits available'}
          accent="#f59e0b"
          variant="compact"
        />
      </section>

      <form className="audit-filter-bar" onSubmit={applyFilters}>
        <div className="audit-filter-field audit-filter-search">
          <Search className="audit-filter-icon" aria-hidden="true" />
          <input
            type="search"
            value={draft.search}
            onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            placeholder="Search by recipient, message, or sender ID…"
            aria-label="Search SMS logs"
          />
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-sms-status">
            Status
          </label>
          <select
            id="bulk-sms-status"
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-sms-category">
            Category
          </label>
          <select
            id="bulk-sms-category"
            value={draft.category}
            onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-sms-date-from">
            From
          </label>
          <input
            id="bulk-sms-date-from"
            type="date"
            value={draft.dateFrom}
            max={draft.dateTo || undefined}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-sms-date-to">
            To
          </label>
          <input
            id="bulk-sms-date-to"
            type="date"
            value={draft.dateTo}
            min={draft.dateFrom || undefined}
            onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
          />
        </div>

        <div className="audit-filter-actions">
          <button type="submit" className="btn-primary btn-sm">
            Apply
          </button>
          {hasActiveFilters && (
            <button type="button" className="btn-secondary btn-sm" onClick={clearFilters}>
              <X className="icon-sm" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </form>

      {hasActiveFilters && (
        <div className="audit-filter-summary">
          <span>
            Showing filtered results
            {applied.search ? ` · "${applied.search}"` : ''}
            {applied.status ? ` · ${applied.status}` : ''}
            {applied.category ? ` · ${applied.category}` : ''}
            {applied.dateFrom ? ` · from ${applied.dateFrom}` : ''}
            {applied.dateTo ? ` · to ${applied.dateTo}` : ''}
          </span>
        </div>
      )}

      <div className="bulk-log-table">
        <LazyDataTable
          ajaxPath="/api/sms-logs"
          columns={COLUMNS}
          refreshKey={refreshKey}
          extraParams={appliedParams}
          order={[[7, 'desc']]}
          dom="lrtip"
        />
      </div>
    </div>
  );
}

export default BulkSmsPage;
