import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Mail, Percent, Search, X } from 'lucide-react';
import LazyDataTable from '../../components/LazyDataTable';
import StatCard from '../../components/StatCard';
import { fetchEmailLogsStats } from '../../api/emailLogs';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'general', label: 'General' },
  { value: 'otp', label: 'OTP' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'welcome', label: 'Welcome' },
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
    data: 'subject',
    title: 'Subject',
    orderable: false,
    render: (data) => {
      if (!data) return '<span class="audit-muted">—</span>';
      const text = String(data);
      const trimmed = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      return `<span class="audit-message" title="${escapeHtml(text)}">${escapeHtml(trimmed)}</span>`;
    },
  },
  {
    data: 'category',
    title: 'Category',
    render: (data) => `<span class="audit-chip">${escapeHtml(data || 'general')}</span>`,
  },
  { data: 'provider', title: 'Provider', render: (data) => escapeHtml(data || '—') },
  { data: 'status', title: 'Status', render: (data) => statusBadge(data) },
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

function BulkEmailsPage() {
  const [stats, setStats] = useState(null);
  const [draft, setDraft] = useState({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState({ search: '', status: '', category: '', dateFrom: '', dateTo: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchEmailLogsStats();
        if (cancelled) return;
        setStats(data);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || 'Failed to load email stats');
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

  const sentThisMonth = stats?.sentThisMonth ?? 0;
  const totalThisMonth = stats?.totalThisMonth ?? 0;
  const deliveryRate = totalThisMonth > 0 ? (sentThisMonth / totalThisMonth) * 100 : null;

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

  return (
    <div className="bulk-sms-page">
      <section className="stat-grid-compact bulk-sms-stat-grid">
        <StatCard
          icon={Mail}
          numericValue={sentThisMonth}
          decimals={0}
          label="Emails Sent"
          meta="This month"
          accent="#10b981"
          variant="compact"
        />
        <StatCard
          icon={Percent}
          value={deliveryRate === null ? '—' : undefined}
          numericValue={deliveryRate}
          decimals={1}
          suffix="%"
          label="Delivery Rate"
          meta="This month"
          accent="#06b6d4"
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
            placeholder="Search by recipient, subject, or sender…"
            aria-label="Search email logs"
          />
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-email-status">
            Status
          </label>
          <select
            id="bulk-email-status"
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
          <label className="audit-filter-label" htmlFor="bulk-email-category">
            Category
          </label>
          <select
            id="bulk-email-category"
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
          <label className="audit-filter-label" htmlFor="bulk-email-date-from">
            From
          </label>
          <input
            id="bulk-email-date-from"
            type="date"
            value={draft.dateFrom}
            max={draft.dateTo || undefined}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="bulk-email-date-to">
            To
          </label>
          <input
            id="bulk-email-date-to"
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
          ajaxPath="/api/email-logs"
          columns={COLUMNS}
          refreshKey={refreshKey}
          extraParams={appliedParams}
          order={[[6, 'desc']]}
          dom="lrtip"
        />
      </div>
    </div>
  );
}

export default BulkEmailsPage;
