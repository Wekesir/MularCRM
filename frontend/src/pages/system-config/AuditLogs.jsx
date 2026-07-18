import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Printer, Search, X } from 'lucide-react';
import LazyDataTable from '../../components/LazyDataTable';
import LoadingButton from '../../components/LoadingButton';
import { fetchAuditRecords } from '../../api/audit';
import { useSystemConfig } from '../../context/SystemConfigContext';

const TABS = [
  { key: 'logins', label: 'Login Sessions', singular: 'login record' },
  { key: 'emails', label: 'Email Logs', singular: 'email record' },
  { key: 'sms', label: 'SMS Logs', singular: 'SMS record' },
  { key: 'activities', label: 'Activity Logs', singular: 'activity record' },
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
  const ok = value === 'success' || value === 'sent';
  const cls = ok ? 'audit-badge audit-badge-success' : 'audit-badge audit-badge-danger';
  return `<span class="${cls}">${escapeHtml(status || 'unknown')}</span>`;
}


const COLUMN_DEFS = {
  logins: [
    {
      data: 'email',
      title: 'User / Email',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        const name = row.userName ? `<span class="audit-strong">${escapeHtml(row.userName)}</span>` : '';
        const email = `<span class="audit-muted">${escapeHtml(data || '—')}</span>`;
        return `<div class="audit-stack">${name}${email}</div>`;
      },
    },
    { data: 'status', title: 'Status', render: (data) => statusBadge(data) },
    {
      data: 'ipAddress',
      title: 'IP Address',
      render: (data) => escapeHtml(data || '—'),
    },
    {
      data: 'browser',
      title: 'Device',
      orderable: false,
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        const browser = [row.browser, row.browserVersion].filter(Boolean).join(' ');
        const os = [row.os, row.deviceType].filter(Boolean).join(' · ');
        return `<div class="audit-stack"><span>${escapeHtml(browser || '—')}</span><span class="audit-muted">${escapeHtml(os || '')}</span></div>`;
      },
    },
    { data: 'loginAt', title: 'Login At', render: (data) => formatDateTime(data) },
    {
      data: 'logoutAt',
      title: 'Logout At',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        if (row.active) return '<span class="audit-badge audit-badge-active">Active</span>';
        return formatDateTime(data);
      },
    },
  ],
  emails: [
    {
      data: 'recipient',
      title: 'Recipient',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        const name = row.userName ? `<span class="audit-muted">${escapeHtml(row.userName)}</span>` : '';
        return `<div class="audit-stack"><span class="audit-strong">${escapeHtml(data || '—')}</span>${name}</div>`;
      },
    },
    { data: 'subject', title: 'Subject', render: (data) => escapeHtml(data || '—') },
    {
      data: 'category',
      title: 'Category',
      render: (data) => `<span class="audit-chip">${escapeHtml(data || 'general')}</span>`,
    },
    { data: 'provider', title: 'Provider', render: (data) => escapeHtml(data || '—') },
    { data: 'status', title: 'Status', render: (data) => statusBadge(data) },
    { data: 'createdAt', title: 'Sent At', render: (data) => formatDateTime(data) },
  ],
  sms: [
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
    { data: 'createdAt', title: 'Sent At', render: (data) => formatDateTime(data) },
  ],
  activities: [
    {
      data: 'userName',
      title: 'Actor',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        if (!data && !row.userId) return '<span class="audit-muted">System</span>';
        return `<span class="audit-strong">${escapeHtml(data || 'Unknown user')}</span>`;
      },
    },
    {
      data: 'title',
      title: 'Action',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        const chip = row.actionType
          ? `<span class="audit-chip">${escapeHtml(row.actionType)}</span>`
          : '';
        return `<div class="audit-stack"><span class="audit-strong">${escapeHtml(data || '—')}</span>${chip}</div>`;
      },
    },
    {
      data: 'subject',
      title: 'Subject',
      render: (data) => {
        if (!data) return '<span class="audit-muted">—</span>';
        const text = String(data);
        const trimmed = text.length > 60 ? `${text.slice(0, 60)}…` : text;
        return `<span class="audit-message" title="${escapeHtml(text)}">${escapeHtml(trimmed)}</span>`;
      },
    },
    {
      data: 'entityType',
      title: 'Entity',
      render: (data, type, row) => {
        if (type !== 'display') return data || '';
        if (!data) return '<span class="audit-muted">—</span>';
        return `<span class="audit-chip">${escapeHtml(data)}</span>`;
      },
    },
    { data: 'createdAt', title: 'When', render: (data) => formatDateTime(data) },
  ],
};

const PRINT_COLUMNS = {
  logins: [
    { label: 'User', value: (r) => r.userName || '' },
    { label: 'Email', value: (r) => r.email || '' },
    { label: 'Status', value: (r) => r.status || '' },
    { label: 'IP', value: (r) => r.ipAddress || '' },
    { label: 'Browser', value: (r) => [r.browser, r.browserVersion].filter(Boolean).join(' ') },
    { label: 'OS', value: (r) => r.os || '' },
    { label: 'Login At', value: (r) => (r.loginAt ? new Date(r.loginAt).toLocaleString() : '') },
    { label: 'Logout At', value: (r) => (r.logoutAt ? new Date(r.logoutAt).toLocaleString() : r.active ? 'Active' : '') },
  ],
  emails: [
    { label: 'Recipient', value: (r) => r.recipient || '' },
    { label: 'Subject', value: (r) => r.subject || '' },
    { label: 'Category', value: (r) => r.category || '' },
    { label: 'Provider', value: (r) => r.provider || '' },
    { label: 'Status', value: (r) => r.status || '' },
    { label: 'Sent At', value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '') },
  ],
  sms: [
    { label: 'Recipient', value: (r) => r.recipient || '' },
    { label: 'Message', value: (r) => r.message || '' },
    { label: 'Category', value: (r) => r.category || '' },
    { label: 'Status', value: (r) => r.status || '' },
    { label: 'Segments', value: (r) => String(r.segments ?? 0) },
    { label: 'Sent At', value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '') },
  ],
  activities: [
    { label: 'Actor', value: (r) => r.userName || 'System' },
    { label: 'Action', value: (r) => r.title || '' },
    { label: 'Action Type', value: (r) => r.actionType || '' },
    { label: 'Subject', value: (r) => r.subject || '' },
    { label: 'Entity', value: (r) => r.entityType || '' },
    { label: 'Entity ID', value: (r) => r.entityId || '' },
    { label: 'When', value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '') },
  ],
};

const SEARCH_PLACEHOLDER = {
  logins: 'Search by email, name, IP, or browser…',
  emails: 'Search by recipient email, subject, or sender…',
  sms: 'Search by recipient, message, or sender ID…',
  activities: 'Search by actor, action, or subject…',
};

function buildAppliedParams({ search, dateFrom, dateTo }) {
  const params = {};
  if (search.trim()) params['search[value]'] = search.trim();
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  return params;
}

function AuditLogs() {
  const { businessName } = useSystemConfig();
  const [activeTab, setActiveTab] = useState('logins');
  const [draft, setDraft] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [printing, setPrinting] = useState(false);

  const tab = TABS.find((t) => t.key === activeTab);
  const columns = useMemo(() => COLUMN_DEFS[activeTab], [activeTab]);
  const appliedParams = useMemo(() => buildAppliedParams(applied), [applied]);
  const hasActiveFilters = Boolean(applied.search || applied.dateFrom || applied.dateTo);

  const switchTab = (key) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setDraft({ search: '', dateFrom: '', dateTo: '' });
    setApplied({ search: '', dateFrom: '', dateTo: '' });
  };

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
    setDraft({ search: '', dateFrom: '', dateTo: '' });
    setApplied({ search: '', dateFrom: '', dateTo: '' });
    setRefreshKey((k) => k + 1);
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await fetchAuditRecords(activeTab, { ...applied, limit: 2000 });
      const rows = result.data || [];
      if (rows.length === 0) {
        toast.info('No records to print for the current filters');
        return;
      }
      printRecords(rows, PRINT_COLUMNS[activeTab], tab.label, businessName, applied);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to prepare print view');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="config-panel audit-panel">
      <div className="config-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={activeTab === t.key ? 'config-tab config-tab-active' : 'config-tab'}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="audit-filter-bar" onSubmit={applyFilters}>
        <div className="audit-filter-field audit-filter-search">
          <Search className="audit-filter-icon" aria-hidden="true" />
          <input
            type="search"
            value={draft.search}
            onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            placeholder={SEARCH_PLACEHOLDER[activeTab]}
            aria-label="Search audit records"
          />
        </div>
        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="audit-date-from">
            From
          </label>
          <input
            id="audit-date-from"
            type="date"
            value={draft.dateFrom}
            max={draft.dateTo || undefined}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>
        <div className="audit-filter-field">
          <label className="audit-filter-label" htmlFor="audit-date-to">
            To
          </label>
          <input
            id="audit-date-to"
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
          <LoadingButton
            className="btn-secondary btn-sm"
            onClick={handlePrint}
            loading={printing}
            loadingText="Preparing…"
          >
            <Printer className="icon-sm" aria-hidden="true" />
            Print
          </LoadingButton>
        </div>
      </form>

      {hasActiveFilters && (
        <div className="audit-filter-summary">
          <span>
            Showing filtered results
            {applied.search ? ` · "${applied.search}"` : ''}
            {applied.dateFrom ? ` · from ${applied.dateFrom}` : ''}
            {applied.dateTo ? ` · to ${applied.dateTo}` : ''}
          </span>
        </div>
      )}

      <LazyDataTable
        ajaxPath={`/api/audit/${activeTab}`}
        columns={columns}
        refreshKey={refreshKey}
        extraParams={appliedParams}
        order={[]}
        dom="lrtip"
      />
    </div>
  );
}

function printRecords(rows, printColumns, title, businessName, filters) {
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) return;

  const headerCells = printColumns.map((c) => `<th>${c.label}</th>`).join('');
  const bodyRows = rows
    .map((row, index) => {
      const cells = printColumns
        .map((c) => `<td>${escapeHtml(c.value(row))}</td>`)
        .join('');
      return `<tr><td>${index + 1}</td>${cells}</tr>`;
    })
    .join('');

  const filterBits = [];
  if (filters.search) filterBits.push(`Search: "${filters.search}"`);
  if (filters.dateFrom) filterBits.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) filterBits.push(`To: ${filters.dateTo}`);
  const filterLine = filterBits.length ? filterBits.join(' · ') : 'No filters applied';

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ${escapeHtml(businessName || 'OMNICRM')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 32px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${escapeHtml(businessName || 'OMNICRM')} — ${escapeHtml(title)}</h1>
  <div class="meta">
    Generated ${escapeHtml(new Date().toLocaleString())} · ${escapeHtml(String(rows.length))} record(s) · ${escapeHtml(filterLine)}
  </div>
  <table>
    <thead><tr><th>#</th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };<\/script>
</body>
</html>`);
  win.document.close();
}

export default AuditLogs;
