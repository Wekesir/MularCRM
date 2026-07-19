import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { fetchContactStatuses } from '../../api/contactStatuses';
import { fetchDebtorBuckets, fetchDebtorFiles } from '../../api/debtors';
import { fetchCallCenters } from '../../api/callCenters';
import {
  ALL_ADVANCED_KEYS,
  getAdvancedFields,
  showAgentFor,
  showClientFor,
  showDateRangeFor,
} from './reportFilterConfig';

const DATE_SHORTCUTS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
];

const DISPUTE_CODES = ['NIP', 'WN', 'N-C', 'NCP', 'DISPUTE'];
const PTP_STATUSES = ['pending', 'kept', 'broken', 'cancelled'];
const CHANNELS = ['call', 'sms', 'email', 'whatsapp', 'other'];
const CALL_DIRECTIONS = ['inbound', 'outbound'];
const SMS_STATUSES = ['sent', 'failed'];
const PAYMENT_STATUSES = [
  { value: 'collection', label: 'Collections only' },
  { value: 'reversal', label: 'Reversals only' },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function getRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { dateFrom: isoDate(from), dateTo: isoDate(to) };
}

function emptyAdvanced() {
  const o = {};
  for (const key of ALL_ADVANCED_KEYS) o[key] = '';
  return o;
}

export function defaultReportFilters(slug) {
  const showDateRange = showDateRangeFor(slug);
  const base = {
    clientId: '',
    agentId: '',
    search: '',
    ...emptyAdvanced(),
  };
  if (showDateRange) Object.assign(base, getRange(29));
  return base;
}

export function countActiveReportFilters(filters, slug, { isAgent = false } = {}) {
  const showDateRange = showDateRangeFor(slug);
  const advancedFields = getAdvancedFields(slug, { isAgent });
  const showClient = showClientFor(slug, { isAgent });
  const showAgent = showAgentFor(slug, { isAgent });
  let n = 0;
  if (showDateRange) {
    const def = getRange(29);
    if (filters.dateFrom && filters.dateFrom !== def.dateFrom) n++;
    if (filters.dateTo && filters.dateTo !== def.dateTo) n++;
  }
  if (showClient && filters.clientId) n++;
  if (showAgent && filters.agentId) n++;
  if (filters.search) n++;
  for (const key of advancedFields) {
    if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') n++;
  }
  return n;
}

function hasAny(fields, keys) {
  return keys.some((k) => fields.includes(k));
}

function ReportFilters({
  filters,
  onChange,
  onApply,
  clients = [],
  agents = [],
  slug = 'debtor-summary',
  showCallCenter = false,
  isAgent = false,
  busy = false,
  modal = false,
}) {
  const showDateRange = showDateRangeFor(slug);
  const showClient = showClientFor(slug, { isAgent });
  const showAgent = showAgentFor(slug, { isAgent });
  const advancedFields = useMemo(
    () => getAdvancedFields(slug, { isAgent }),
    [slug, isAgent]
  );
  const fieldSet = useMemo(() => new Set(advancedFields), [advancedFields]);
  const has = (key) => fieldSet.has(key);

  const [contactStatuses, setContactStatuses] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [files, setFiles] = useState([]);
  const [callCenters, setCallCenters] = useState([]);

  const needsStatuses = has('contactStatusId');
  const needsBuckets = has('bucket');
  const needsFiles = has('fileId');
  const needsCenters = showCallCenter && has('callCenterId');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      needsStatuses ? fetchContactStatuses().catch(() => []) : Promise.resolve([]),
      needsBuckets ? fetchDebtorBuckets().catch(() => []) : Promise.resolve([]),
      needsFiles ? fetchDebtorFiles().catch(() => []) : Promise.resolve([]),
      needsCenters ? fetchCallCenters({ includeInactive: false }).catch(() => []) : Promise.resolve([]),
    ]).then(([statuses, bucketList, fileList, centers]) => {
      if (cancelled) return;
      setContactStatuses(Array.isArray(statuses) ? statuses : statuses?.items || []);
      setBuckets(Array.isArray(bucketList) ? bucketList : []);
      setFiles(Array.isArray(fileList) ? fileList : fileList?.items || []);
      setCallCenters(Array.isArray(centers) ? centers : centers?.items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [needsStatuses, needsBuckets, needsFiles, needsCenters]);

  const set = (key, value) => onChange({ ...filters, [key]: value });

  const applyShortcut = (days) => {
    const range = getRange(days);
    const next = { ...filters, ...range };
    onChange(next);
    if (modal) onApply?.(next);
  };

  const reset = () => {
    const next = defaultReportFilters(slug);
    onChange(next);
    if (modal) onApply?.(next);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply?.();
  };

  const amountLabel =
    slug === 'goip-calls-report'
      ? 'Duration (sec)'
      : slug === 'promise-to-pay'
        ? 'Promised amount'
        : 'Amount';

  return (
    <form className="rpt-filter-form" onSubmit={handleSubmit}>
      {showDateRange && (
        <div className="rpt-filter-section">
          <p className="rpt-filter-section-label">Date range</p>
          <div className="rpt-date-shortcuts" role="group" aria-label="Quick date ranges">
            {DATE_SHORTCUTS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="rpt-shortcut-btn"
                onClick={() => applyShortcut(s.days)}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="rpt-filter-row">
            <label className="rpt-field rpt-field--half">
              <span className="rpt-field-label">From</span>
              <input
                type="date"
                className="rpt-input"
                value={filters.dateFrom || ''}
                onChange={(e) => set('dateFrom', e.target.value)}
              />
            </label>
            <label className="rpt-field rpt-field--half">
              <span className="rpt-field-label">To</span>
              <input
                type="date"
                className="rpt-input"
                value={filters.dateTo || ''}
                onChange={(e) => set('dateTo', e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {needsCenters && (
        <div className="rpt-filter-section">
          <label className="rpt-field">
            <span className="rpt-field-label">Call center</span>
            <select
              className="rpt-input"
              value={filters.callCenterId || ''}
              onChange={(e) => set('callCenterId', e.target.value)}
            >
              <option value="">All call centers</option>
              {callCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {showClient && (
        <div className="rpt-filter-section">
          <label className="rpt-field">
            <span className="rpt-field-label">Client</span>
            <select
              className="rpt-input"
              value={filters.clientId || ''}
              onChange={(e) => set('clientId', e.target.value)}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {showAgent && (
        <div className="rpt-filter-section">
          <label className="rpt-field">
            <span className="rpt-field-label">Agent</span>
            <select
              className="rpt-input"
              value={filters.agentId || ''}
              onChange={(e) => set('agentId', e.target.value)}
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="rpt-filter-section">
        <label className="rpt-field">
          <span className="rpt-field-label">Search</span>
          <span className="rpt-search-wrap">
            <Search className="rpt-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="rpt-input rpt-input--search"
              placeholder="Search records…"
              value={filters.search || ''}
              onChange={(e) => set('search', e.target.value)}
            />
          </span>
        </label>
      </div>

      {advancedFields.length > 0 && (
        <>
          <p className="rpt-filter-section-label">Advanced</p>

          {has('detail') && (
            <div className="rpt-filter-section">
              <label className="rpt-field">
                <span className="rpt-field-label">Report view</span>
                <select
                  className="rpt-input"
                  value={filters.detail || ''}
                  onChange={(e) => set('detail', e.target.value)}
                >
                  <option value="">Aging by bucket (summary)</option>
                  <option value="debtors">Debtor detail</option>
                </select>
              </label>
            </div>
          )}

          {has('fileId') && (
            <div className="rpt-filter-section">
              <label className="rpt-field">
                <span className="rpt-field-label">Batch file</span>
                <select
                  className="rpt-input"
                  value={filters.fileId || ''}
                  onChange={(e) => set('fileId', e.target.value)}
                >
                  <option value="">All files</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      #{f.id}{f.fileName ? ` — ${f.fileName}` : ''}
                      {f.importedCount != null ? ` (${f.importedCount})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {hasAny(advancedFields, ['bucket', 'contactStatusId']) && (
            <div className="rpt-filter-row">
              {has('bucket') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Bucket</span>
                  <select
                    className="rpt-input"
                    value={filters.bucket || ''}
                    onChange={(e) => set('bucket', e.target.value)}
                  >
                    <option value="">All buckets</option>
                    {buckets.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('contactStatusId') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Contact status</span>
                  <select
                    className="rpt-input"
                    value={filters.contactStatusId || ''}
                    onChange={(e) => set('contactStatusId', e.target.value)}
                  >
                    <option value="">Any status</option>
                    {contactStatuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {has('disputeCode') && (
            <div className="rpt-filter-section">
              <label className="rpt-field">
                <span className="rpt-field-label">Dispute code</span>
                <select
                  className="rpt-input"
                  value={filters.disputeCode || ''}
                  onChange={(e) => set('disputeCode', e.target.value)}
                >
                  <option value="">All dispute types</option>
                  {DISPUTE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {hasAny(advancedFields, ['assignmentStatus', 'caseClosed']) && (
            <div className="rpt-filter-row">
              {has('assignmentStatus') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Assignment</span>
                  <select
                    className="rpt-input"
                    value={filters.assignmentStatus || ''}
                    onChange={(e) => set('assignmentStatus', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                </label>
              )}
              {has('caseClosed') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Case status</span>
                  <select
                    className="rpt-input"
                    value={filters.caseClosed || ''}
                    onChange={(e) => set('caseClosed', e.target.value)}
                  >
                    <option value="">Open only</option>
                    <option value="1">Closed only</option>
                    <option value="any">Open + closed</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {hasAny(advancedFields, ['ptp', 'discounted', 'hasNotes', 'remindersDue', 'hasRecording']) && (
            <div className="rpt-filter-row">
              {has('ptp') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">PTP</span>
                  <select
                    className="rpt-input"
                    value={filters.ptp || ''}
                    onChange={(e) => set('ptp', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="1">Has PTP</option>
                    <option value="0">No PTP</option>
                  </select>
                </label>
              )}
              {has('discounted') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Discounted</span>
                  <select
                    className="rpt-input"
                    value={filters.discounted || ''}
                    onChange={(e) => set('discounted', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="1">Waived only</option>
                  </select>
                </label>
              )}
              {has('hasNotes') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Notes</span>
                  <select
                    className="rpt-input"
                    value={filters.hasNotes || ''}
                    onChange={(e) => set('hasNotes', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="1">With notes only</option>
                  </select>
                </label>
              )}
              {has('remindersDue') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Reminders</span>
                  <select
                    className="rpt-input"
                    value={filters.remindersDue || ''}
                    onChange={(e) => set('remindersDue', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="1">Due today or overdue</option>
                  </select>
                </label>
              )}
              {has('hasRecording') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Recording</span>
                  <select
                    className="rpt-input"
                    value={filters.hasRecording || ''}
                    onChange={(e) => set('hasRecording', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="1">Has recording</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {hasAny(advancedFields, ['status', 'channel', 'direction', 'confirmed', 'source', 'category', 'provider']) && (
            <div className="rpt-filter-row">
              {has('status') && slug === 'promise-to-pay' && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">PTP status</span>
                  <select
                    className="rpt-input"
                    value={filters.status || ''}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    <option value="">Any status</option>
                    {PTP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('status') && slug === 'payment-performance' && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Payment type</span>
                  <select
                    className="rpt-input"
                    value={filters.status || ''}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    <option value="">All</option>
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('status') && slug === 'sms-report' && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">SMS status</span>
                  <select
                    className="rpt-input"
                    value={filters.status || ''}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    <option value="">Any</option>
                    {SMS_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('status') && slug === 'goip-calls-report' && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Call status</span>
                  <input
                    type="text"
                    className="rpt-input"
                    placeholder="e.g. completed"
                    value={filters.status || ''}
                    onChange={(e) => set('status', e.target.value)}
                  />
                </label>
              )}
              {has('channel') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Channel</span>
                  <select
                    className="rpt-input"
                    value={filters.channel || ''}
                    onChange={(e) => set('channel', e.target.value)}
                  >
                    <option value="">Any channel</option>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('direction') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Direction</span>
                  <select
                    className="rpt-input"
                    value={filters.direction || ''}
                    onChange={(e) => set('direction', e.target.value)}
                  >
                    <option value="">Any</option>
                    {CALL_DIRECTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {has('confirmed') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Confirmed</span>
                  <select
                    className="rpt-input"
                    value={filters.confirmed || ''}
                    onChange={(e) => set('confirmed', e.target.value)}
                  >
                    <option value="">Confirmed only</option>
                    <option value="0">Unconfirmed only</option>
                    <option value="any">All</option>
                  </select>
                </label>
              )}
              {has('source') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Source / channel</span>
                  <input
                    type="text"
                    className="rpt-input"
                    placeholder="e.g. M-Pesa"
                    value={filters.source || ''}
                    onChange={(e) => set('source', e.target.value)}
                  />
                </label>
              )}
              {has('category') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Category</span>
                  <input
                    type="text"
                    className="rpt-input"
                    placeholder="e.g. reminder"
                    value={filters.category || ''}
                    onChange={(e) => set('category', e.target.value)}
                  />
                </label>
              )}
              {has('provider') && (
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">Provider</span>
                  <input
                    type="text"
                    className="rpt-input"
                    placeholder="Provider id"
                    value={filters.provider || ''}
                    onChange={(e) => set('provider', e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          {hasAny(advancedFields, ['dpdMin', 'dpdMax']) && (
            <div className="rpt-filter-row">
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">DPD min</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.dpdMin || ''}
                  onChange={(e) => set('dpdMin', e.target.value)}
                />
              </label>
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">DPD max</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.dpdMax || ''}
                  onChange={(e) => set('dpdMax', e.target.value)}
                />
              </label>
            </div>
          )}

          {hasAny(advancedFields, ['balanceMin', 'balanceMax']) && (
            <div className="rpt-filter-row">
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">Balance min</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.balanceMin || ''}
                  onChange={(e) => set('balanceMin', e.target.value)}
                />
              </label>
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">Balance max</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.balanceMax || ''}
                  onChange={(e) => set('balanceMax', e.target.value)}
                />
              </label>
            </div>
          )}

          {hasAny(advancedFields, ['amountMin', 'amountMax']) && (
            <div className="rpt-filter-row">
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">{amountLabel} min</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.amountMin || ''}
                  onChange={(e) => set('amountMin', e.target.value)}
                />
              </label>
              <label className="rpt-field rpt-field--half">
                <span className="rpt-field-label">{amountLabel} max</span>
                <input
                  type="number"
                  min="0"
                  className="rpt-input"
                  value={filters.amountMax || ''}
                  onChange={(e) => set('amountMax', e.target.value)}
                />
              </label>
            </div>
          )}

          {hasAny(advancedFields, ['lastContactedFrom', 'lastContactedTo']) && (
            <div className="rpt-filter-section">
              <p className="rpt-filter-section-label">Last contacted</p>
              <div className="rpt-filter-row">
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">From</span>
                  <input
                    type="date"
                    className="rpt-input"
                    value={filters.lastContactedFrom || ''}
                    onChange={(e) => set('lastContactedFrom', e.target.value)}
                  />
                </label>
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">To</span>
                  <input
                    type="date"
                    className="rpt-input"
                    value={filters.lastContactedTo || ''}
                    onChange={(e) => set('lastContactedTo', e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {hasAny(advancedFields, ['nextActionFrom', 'nextActionTo']) && (
            <div className="rpt-filter-section">
              <p className="rpt-filter-section-label">Next action</p>
              <div className="rpt-filter-row">
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">From</span>
                  <input
                    type="date"
                    className="rpt-input"
                    value={filters.nextActionFrom || ''}
                    onChange={(e) => set('nextActionFrom', e.target.value)}
                  />
                </label>
                <label className="rpt-field rpt-field--half">
                  <span className="rpt-field-label">To</span>
                  <input
                    type="date"
                    className="rpt-input"
                    value={filters.nextActionTo || ''}
                    onChange={(e) => set('nextActionTo', e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
        </>
      )}

      <div className="rpt-filter-modal-actions">
        <button type="button" className="rpt-reset-btn" onClick={reset} disabled={busy}>
          <X className="icon-sm" />
          Reset
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>
          Apply filters
        </button>
      </div>
    </form>
  );
}

export default ReportFilters;
