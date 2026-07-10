import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Braces,
  CalendarClock,
  CheckCircle2,
  Clock,
  CloudDownload,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { fetchClients } from '../../api/clients';
import { fetchDebtCategories } from '../../api/debtCategories';
import { fetchDebtTypes } from '../../api/debtTypes';
import { fetchCurrencies } from '../../api/currencies';
import {
  fetchLivePaymentsStatus,
  pullLivePayments,
  testLivePaymentsConnection,
} from '../../api/livePayments';
import { useSystemConfig } from '../../context/SystemConfigContext';

const FREQUENCY_OPTIONS = [
  {
    value: 'every_1_min',
    label: '1 min',
    hint: 'Near real-time',
    scheduleLabel: 'Every 1 minute',
    icon: Zap,
  },
  {
    value: 'every_5_min',
    label: '5 min',
    hint: 'Every 5 minutes',
    scheduleLabel: 'Every 5 minutes',
    icon: Timer,
  },
  {
    value: 'every_15_min',
    label: '15 min',
    hint: 'Every 15 minutes',
    scheduleLabel: 'Every 15 minutes',
    icon: Timer,
  },
  {
    value: 'every_30_min',
    label: '30 min',
    hint: 'Every 30 minutes',
    scheduleLabel: 'Every 30 minutes',
    icon: Clock,
  },
  {
    value: 'hourly',
    label: 'Hourly',
    hint: 'Top of each hour',
    scheduleLabel: 'Hourly',
    icon: Clock,
  },
  {
    value: 'daily',
    label: 'Daily',
    hint: 'Once at 06:00',
    scheduleLabel: 'Daily at 06:00',
    icon: CalendarClock,
  },
];

const FREQUENCY_LABELS = Object.fromEntries(
  FREQUENCY_OPTIONS.map((o) => [o.value, o.scheduleLabel])
);

const EMPTY_CLIENT = {
  clientId: '',
  enabled: true,
  endpointUrl: '',
  apiKey: '',
  apiKeySet: false,
  authHeader: 'Authorization',
  debtCategoryId: '',
  debtTypeId: '',
  currencyId: '',
  timeoutMs: 30000,
};

const EMPTY_LIVE = {
  enabled: false,
  frequency: 'daily',
  clients: [],
};

/** Same snake_case keys as the debtor CSV template. */
const ALL_JSON_FIELDS = [
  { key: 'full_name', required: true, example: 'Jane Mwangi' },
  { key: 'phone_number', required: true, example: '254710595755' },
  { key: 'amount', required: true, example: '150000' },
  { key: 'principal_amount', required: false, example: '140000' },
  { key: 'account_number', required: false, example: 'ACC-001' },
  { key: 'email', required: false, example: 'kenwekesir@gmail.com' },
  { key: 'id_number', required: true, example: '30123456' },
  { key: 'loan_id', required: true, example: 'LN-2025-0001' },
  { key: 'waived_amount', required: false, example: '0' },
  { key: 'dpd_level', required: true, example: '45' },
  { key: 'contract_number', required: false, example: 'CT-100' },
  { key: 'amount_repaid', required: true, example: '45000' },
  { key: 'secondary_phone_number', required: false, example: '254722111222' },
  { key: 'installment_amount', required: false, example: '15000' },
  { key: 'arrears', required: true, example: '105000' },
  { key: 'penalty', required: false, example: '500' },
  { key: 'loan_taken_date', required: true, example: '2025-01-15' },
  { key: 'loan_due_date', required: false, example: '2025-07-15' },
  { key: 'last_paid_amount', required: false, example: '5000' },
  { key: 'last_paid_date', required: false, example: '2026-06-01' },
  { key: 'loan_counter', required: false, example: '2' },
  { key: 'physical_address', required: true, example: '12 MG Rd, Nairobi' },
  { key: 'employer_and_address', required: false, example: 'Acme Ltd, Westlands' },
  { key: 'next_of_kin_full_name', required: true, example: 'Brian Mwangi' },
  { key: 'next_of_kin_relationship', required: false, example: 'Spouse' },
  { key: 'next_of_kin_phone_number', required: true, example: '254733222333' },
  { key: 'next_of_kin_email', required: false, example: 'brian@example.com' },
  { key: 'guarantor_full_name', required: true, example: 'Peter Otieno' },
  { key: 'guarantor_phones', required: true, example: '254711444555' },
  { key: 'guarantor_email', required: false, example: 'peter@example.com' },
  { key: 'guarantor_address', required: false, example: 'Kisumu' },
];

const REQUIRED_JSON_FIELDS = ALL_JSON_FIELDS.filter((f) => f.required);
const OPTIONAL_JSON_FIELDS = ALL_JSON_FIELDS.filter((f) => !f.required);

const EXPECTED_JSON_SAMPLE = `{
  "date": "2026-07-10",
  "debtors": [
    {
${ALL_JSON_FIELDS.map(
  (f) =>
    `      "${f.key}": "${f.example}"${f.required ? '  // compulsory' : '  // optional'}`
).join(',\n')}
    }
  ]
}`;

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ClientAvatar({ name }) {
  const letter = (name || '?')[0].toUpperCase();
  return <span className="lp-client-avatar">{letter}</span>;
}

function Integrations() {
  const { loadConfig, updateConfig } = useSystemConfig();
  const [form, setForm] = useState(EMPTY_LIVE);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [pullDate, setPullDate] = useState(todayLocal());
  const [pullClientId, setPullClientId] = useState('');

  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [debtTypes, setDebtTypes] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  const refreshStatus = useCallback(async (silent = false) => {
    if (!silent) setStatusLoading(true);
    try {
      const data = await fetchLivePaymentsStatus();
      setStatus(data);
    } catch (error) {
      if (!silent) {
        toast.error(error.response?.data?.message || 'Failed to load live payments status');
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig()
      .then((config) => {
        const live = config.integrations?.livePayments || {};
        setForm({
          ...EMPTY_LIVE,
          ...live,
          frequency: FREQUENCY_LABELS[live.frequency] ? live.frequency : 'daily',
          clients: Array.isArray(live.clients)
            ? live.clients.map((c) => ({
                ...EMPTY_CLIENT,
                ...c,
                clientId: c.clientId != null ? String(c.clientId) : '',
                debtCategoryId: c.debtCategoryId != null ? String(c.debtCategoryId) : '',
                debtTypeId: c.debtTypeId != null ? String(c.debtTypeId) : '',
                currencyId: c.currencyId != null ? String(c.currencyId) : '',
                apiKey: '',
              }))
            : [],
        });
      })
      .catch(() => toast.error('Failed to load configuration'));

    Promise.all([
      fetchClients().catch(() => []),
      fetchDebtCategories().catch(() => []),
      fetchDebtTypes().catch(() => []),
      fetchCurrencies().catch(() => []),
    ]).then(([c, cats, types, curs]) => {
      setClients(Array.isArray(c) ? c : c?.clients || []);
      setCategories(Array.isArray(cats) ? cats : []);
      setDebtTypes(Array.isArray(types) ? types : []);
      setCurrencies(Array.isArray(curs) ? curs : []);
    });

    refreshStatus();
  }, [loadConfig, refreshStatus]);

  const updateClientEntry = (index, patch) => {
    setForm((prev) => {
      const list = [...prev.clients];
      list[index] = { ...list[index], ...patch };
      return { ...prev, clients: list };
    });
  };

  const addClient = () => {
    setForm((prev) => ({
      ...prev,
      clients: [...prev.clients, { ...EMPTY_CLIENT }],
    }));
  };

  const removeClient = (index) => {
    setForm((prev) => ({
      ...prev,
      clients: prev.clients.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        integrations: {
          livePayments: {
            enabled: Boolean(form.enabled),
            frequency: form.frequency || 'daily',
            clients: form.clients.map((c) => ({
              clientId: c.clientId ? Number(c.clientId) : null,
              enabled: Boolean(c.enabled),
              endpointUrl: c.endpointUrl?.trim() || '',
              apiKey: c.apiKey || '',
              authHeader: c.authHeader?.trim() || 'Authorization',
              debtCategoryId: c.debtCategoryId ? Number(c.debtCategoryId) : null,
              debtTypeId: c.debtTypeId ? Number(c.debtTypeId) : null,
              currencyId: c.currencyId ? Number(c.currencyId) : null,
              timeoutMs: Number(c.timeoutMs) || 30000,
            })),
          },
        },
      };
      const saved = await updateConfig(payload);
      const live = saved.integrations?.livePayments || {};
      setForm({
        ...EMPTY_LIVE,
        ...live,
        frequency: FREQUENCY_LABELS[live.frequency] ? live.frequency : 'daily',
        clients: Array.isArray(live.clients)
          ? live.clients.map((c) => ({
              ...EMPTY_CLIENT,
              ...c,
              clientId: c.clientId != null ? String(c.clientId) : '',
              debtCategoryId: c.debtCategoryId != null ? String(c.debtCategoryId) : '',
              debtTypeId: c.debtTypeId != null ? String(c.debtTypeId) : '',
              currencyId: c.currencyId != null ? String(c.currencyId) : '',
              apiKey: '',
            }))
          : [],
      });
      toast.success('Live payments settings saved');
      await refreshStatus(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      const result = await pullLivePayments({
        clientId: pullClientId || null,
        date: pullDate || null,
      });
      toast.success(result.message || 'Pull completed');
      await refreshStatus(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Pull failed');
      await refreshStatus(true);
    } finally {
      setPulling(false);
    }
  };

  const handleTest = async (index) => {
    const entry = form.clients[index];
    if (!entry?.endpointUrl && !entry?.clientId) {
      toast.error('Set an endpoint URL (and save) before testing');
      return;
    }
    setTestingId(index);
    try {
      const result = await testLivePaymentsConnection({
        clientId: entry.clientId ? Number(entry.clientId) : null,
        endpointUrl: entry.endpointUrl || undefined,
        apiKey: entry.apiKey || undefined,
        authHeader: entry.authHeader || 'Authorization',
        timeoutMs: entry.timeoutMs,
      });
      toast.success(result.message || 'Connection OK');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const lastRun = status?.lastRun;
  const cron = status?.cron;

  function StatusBadge() {
    if (lastRun?.running)
      return (
        <span className="bk-badge bk-badge--running">
          <Loader2 className="icon-sm bk-spin" aria-hidden="true" />
          Running
        </span>
      );
    if (lastRun?.ok === true)
      return (
        <span className="bk-badge bk-badge--success">
          <CheckCircle2 className="icon-sm" aria-hidden="true" />
          Success
        </span>
      );
    if (lastRun?.ok === false)
      return (
        <span className="bk-badge bk-badge--failed">
          <AlertCircle className="icon-sm" aria-hidden="true" />
          Failed
        </span>
      );
    return <span className="bk-badge bk-badge--idle">No pulls yet</span>;
  }

  return (
    <div className="space-y-6 min-h-[50vh]">
      {/* ── Status card ─────────────────────────────────── */}
      <div className="bk-status-card">
        <div className="bk-status-card-body">
          <div className="bk-status-card-top">
            <div className="bk-status-card-left">
              <span className="bk-status-card-icon">
                <CloudDownload className="icon-md" aria-hidden="true" />
              </span>
              <div>
                <div className="bk-status-card-title-row">
                  <p className="bk-status-card-title">Live Payments API</p>
                  <StatusBadge />
                </div>
                <p className="bk-status-card-desc">
                  {statusLoading
                    ? 'Loading…'
                    : lastRun?.message || 'Poll lender APIs instead of daily CSV uploads'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-icon-outline"
              aria-label="Refresh status"
              onClick={() => refreshStatus()}
              disabled={statusLoading}
            >
              <RefreshCw
                className={`icon-sm${statusLoading ? ' bk-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Stat tiles */}
          <div className="bk-stat-tiles">
            <div className="bk-stat-tile">
              <span className="bk-stat-tile-icon">
                <Clock className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value">{formatWhen(lastRun?.startedAt)}</p>
                <p className="bk-stat-tile-label">Started</p>
              </div>
            </div>
            <div className="bk-stat-tile">
              <span className="bk-stat-tile-icon">
                <CheckCircle2 className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value">{formatWhen(lastRun?.finishedAt)}</p>
                <p className="bk-stat-tile-label">Finished</p>
              </div>
            </div>
            <div className="bk-stat-tile">
              <span className="bk-stat-tile-icon">
                <CalendarClock className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value">
                  {cron?.scheduled
                    ? `${FREQUENCY_LABELS[cron.frequency] || cron.label || cron.frequency} · ${cron.timezone}`
                    : 'Not scheduled'}
                </p>
                <p className="bk-stat-tile-label">Schedule</p>
              </div>
            </div>
            <div className="bk-stat-tile">
              <span className="bk-stat-tile-icon">
                <Zap className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value">{lastRun?.triggeredBy || '—'}</p>
                <p className="bk-stat-tile-label">Triggered by</p>
              </div>
            </div>
          </div>

          {/* Manual pull row */}
          <div className="lp-pull-row">
            <label className="bk-field lp-pull-date">
              <span className="bk-field-label">Pull date</span>
              <input
                type="date"
                value={pullDate}
                onChange={(e) => setPullDate(e.target.value)}
              />
            </label>
            <label className="bk-field lp-pull-client">
              <span className="bk-field-label">Client (optional)</span>
              <select value={pullClientId} onChange={(e) => setPullClientId(e.target.value)}>
                <option value="">All enabled clients</option>
                {form.clients
                  .filter((c) => c.clientId)
                  .map((c) => {
                    const name =
                      clients.find((x) => String(x.id) === String(c.clientId))?.name ||
                      `Client #${c.clientId}`;
                    return (
                      <option key={c.clientId} value={c.clientId}>
                        {name}
                      </option>
                    );
                  })}
              </select>
            </label>
            <LoadingButton
              type="button"
              className="btn-primary btn-sm lp-pull-btn"
              loading={pulling}
              loadingText="Pulling…"
              onClick={handlePull}
            >
              <CloudDownload className="icon-sm" aria-hidden="true" />
              Pull now
            </LoadingButton>
          </div>
        </div>
      </div>

      {/* ── Settings form ───────────────────────────────── */}
      <form className="config-form" onSubmit={handleSave}>
        {/* Schedule section */}
        <div className="config-form-section">
          <h3 className="config-form-section-title">
            <CalendarClock className="icon-sm" aria-hidden="true" />
            Schedule
          </h3>

          <div className="bk-enable-row">
            <div className="bk-enable-row-text">
              <p className="bk-enable-row-label">Enable automatic pulls</p>
              <p className="bk-enable-row-hint">
                When enabled, the backend POSTs{' '}
                <code>{'{ "date": "YYYY-MM-DD" }'}</code> to each enabled client endpoint on the
                schedule below ({cron?.timezone || 'Africa/Nairobi'}). Shorter intervals let agents
                see new payments sooner — closer to real-time.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(form.enabled)}
              className={`bk-toggle${form.enabled ? ' bk-toggle--on' : ''}`}
              onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
            >
              <span className="bk-toggle-thumb" />
              <span className="sr-only">
                {form.enabled ? 'Disable' : 'Enable'} automatic pulls
              </span>
            </button>
          </div>

          <div className="lp-freq-block">
            <p className="bk-freq-label">Poll frequency</p>
            <div className="lp-freq-grid">
              {FREQUENCY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = form.frequency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`bk-freq-card${selected ? ' bk-freq-card--selected' : ''}`}
                    onClick={() => setForm((prev) => ({ ...prev, frequency: opt.value }))}
                  >
                    {selected && (
                      <span className="bk-freq-card-check" aria-hidden="true">
                        <CheckCircle2 className="icon-sm" />
                      </span>
                    )}
                    <span className="bk-freq-card-icon">
                      <Icon className="icon-sm" aria-hidden="true" />
                    </span>
                    <span className="bk-freq-card-label">{opt.label}</span>
                    <span className="bk-freq-card-hint">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Per-client endpoints */}
        <div className="config-form-section">
          <div className="bk-section-hd">
            <h3 className="config-form-section-title">
              <Link2 className="icon-sm" aria-hidden="true" />
              Per-client endpoints
            </h3>
            <button type="button" className="btn-primary btn-sm" onClick={addClient}>
              <Plus className="icon-sm" aria-hidden="true" />
              Add client
            </button>
          </div>

          {/* How-to steps */}
          <div className="bk-setup-steps">
            <div className="bk-setup-step">
              <span className="bk-setup-num">1</span>
              <span>
                Expose a <strong>POST</strong> endpoint that accepts{' '}
                <code>{'{ "date": "YYYY-MM-DD" }'}</code> and returns debtors using the{' '}
                <strong>same 31 CSV column names</strong>{' '}
                (e.g. <code>full_name</code>, <code>loan_id</code>, <code>amount_repaid</code>).
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">2</span>
              <span>
                OMNICRM creates <strong>one case file (CFID) per client per calendar day</strong>.
                Later pulls the same day append to that CFID. New loans join that file; existing
                loans update in place and keep their original CFID.
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">3</span>
              <span>
                Set debt category, type, and currency below — they apply to every row pulled from
                that client&apos;s API (same as the CSV bulk-upload form).
              </span>
            </div>
            <div className="lp-security-note">
              <Shield className="icon-sm" aria-hidden="true" />
              <span>
                API keys are stored encrypted in system config and never returned to the browser
                after save.
              </span>
            </div>
          </div>

          {/* Expected JSON structure */}
          <div className="lp-json-note">
            <div className="lp-json-note-header">
              <Braces className="icon-sm" aria-hidden="true" />
              <div>
                <p className="lp-json-note-title">Expected JSON response</p>
                <p className="lp-json-note-desc">
                  Request body: <code>{'{ "date": "YYYY-MM-DD" }'}</code>. Response may be a bare
                  array, or an object with <code>debtors</code>, <code>data</code>, or{' '}
                  <code>rows</code>. Keys match the CSV template (snake_case or camelCase).
                </p>
              </div>
            </div>

            <div className="lp-field-groups">
              <div className="lp-field-group">
                <p className="lp-field-group-label">
                  <span className="lp-field-badge lp-field-badge--required">Compulsory</span>
                  <span className="lp-field-group-count">
                    {REQUIRED_JSON_FIELDS.length} required — row is rejected if any are missing
                  </span>
                </p>
                <div className="lp-field-chips">
                  {REQUIRED_JSON_FIELDS.map((f) => (
                    <code key={f.key} className="lp-field-chip lp-field-chip--required">
                      {f.key}
                    </code>
                  ))}
                </div>
              </div>
              <div className="lp-field-group">
                <p className="lp-field-group-label">
                  <span className="lp-field-badge lp-field-badge--optional">Optional</span>
                  <span className="lp-field-group-count">
                    {OPTIONAL_JSON_FIELDS.length} optional — omit or leave blank if not available
                  </span>
                </p>
                <div className="lp-field-chips">
                  {OPTIONAL_JSON_FIELDS.map((f) => (
                    <code key={f.key} className="lp-field-chip lp-field-chip--optional">
                      {f.key}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            <pre className="lp-json-pre" tabIndex={0}>
              <code>{EXPECTED_JSON_SAMPLE}</code>
            </pre>
            <p className="lp-json-legend">
              Comments in the sample (<code>// compulsory</code> / <code>// optional</code>) are
              for documentation only — do not include them in the real API response.
            </p>
          </div>

          {/* Empty state */}
          {form.clients.length === 0 ? (
            <div className="empty-state-card" style={{ marginTop: '1rem' }}>
              <div className="empty-state-icon">
                <CloudDownload className="empty-state-icon-svg" />
              </div>
              <h2 className="empty-state-title">No client endpoints yet</h2>
              <p className="empty-state-description">
                Add a client to start polling live payments instead of uploading a CSV daily.
              </p>
              <button type="button" className="btn-primary btn-sm" onClick={addClient}>
                <Plus className="icon-sm" aria-hidden="true" />
                Add client
              </button>
            </div>
          ) : (
            <div className="lp-client-list">
              {form.clients.map((entry, index) => {
                const clientName =
                  clients.find((x) => String(x.id) === String(entry.clientId))?.name || null;
                return (
                  <div
                    key={index}
                    className={`lp-client-card${entry.enabled ? '' : ' lp-client-card--disabled'}`}
                  >
                    {/* Card header */}
                    <div className="lp-client-card-header">
                      <div className="lp-client-card-header-left">
                        {clientName ? (
                          <ClientAvatar name={clientName} />
                        ) : (
                          <span className="lp-client-avatar lp-client-avatar--empty">?</span>
                        )}
                        <div>
                          <p className="lp-client-card-name">
                            {clientName || (
                              <span className="lp-client-card-name--empty">No client selected</span>
                            )}
                          </p>
                          <p className="lp-client-card-meta">
                            {entry.endpointUrl
                              ? entry.endpointUrl.replace(/^https?:\/\//, '')
                              : 'No endpoint set'}
                          </p>
                        </div>
                      </div>
                      <div className="lp-client-card-header-right">
                        <button
                          type="button"
                          className="btn-primary btn-sm lp-test-btn"
                          disabled={testingId === index}
                          onClick={() => handleTest(index)}
                        >
                          <RefreshCw
                            className={`icon-sm${testingId === index ? ' bk-spin' : ''}`}
                            aria-hidden="true"
                          />
                          Test
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(entry.enabled)}
                          className={`bk-toggle${entry.enabled ? ' bk-toggle--on' : ''}`}
                          onClick={() => updateClientEntry(index, { enabled: !entry.enabled })}
                        >
                          <span className="bk-toggle-thumb" />
                          <span className="sr-only">
                            {entry.enabled ? 'Disable' : 'Enable'} this client
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon-outline"
                          aria-label="Remove client"
                          onClick={() => removeClient(index)}
                        >
                          <Trash2 className="icon-sm" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="lp-client-fields">
                      {/* Row 1: client select + endpoint URL */}
                      <div className="lp-fields-row">
                        <label className="bk-field">
                          <span className="bk-field-label">Client</span>
                          <select
                            value={entry.clientId}
                            onChange={(e) =>
                              updateClientEntry(index, { clientId: e.target.value })
                            }
                          >
                            <option value="">Select client…</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="bk-field lp-field-wide">
                          <span className="bk-field-label">
                            <Link2 className="icon-sm" aria-hidden="true" />
                            Endpoint URL
                          </span>
                          <input
                            type="url"
                            value={entry.endpointUrl}
                            onChange={(e) =>
                              updateClientEntry(index, { endpointUrl: e.target.value })
                            }
                            placeholder="https://lender.example.com/api/debtors"
                            autoComplete="off"
                          />
                        </label>
                      </div>

                      {/* Row 2: API key + auth header */}
                      <div className="lp-fields-row">
                        <label className="bk-field">
                          <span className="bk-field-label">
                            <KeyRound className="icon-sm" aria-hidden="true" />
                            API key
                          </span>
                          <input
                            type="password"
                            value={entry.apiKey}
                            onChange={(e) =>
                              updateClientEntry(index, { apiKey: e.target.value })
                            }
                            placeholder={
                              entry.apiKeySet
                                ? 'Leave blank to keep the current key'
                                : 'Bearer token / API key'
                            }
                            autoComplete="off"
                          />
                          {entry.apiKeySet ? (
                            <span className="bk-key-set-badge">
                              <CheckCircle2 className="icon-sm" aria-hidden="true" />
                              Key saved
                            </span>
                          ) : null}
                        </label>
                        <label className="bk-field">
                          <span className="bk-field-label">Auth header</span>
                          <input
                            type="text"
                            value={entry.authHeader}
                            onChange={(e) =>
                              updateClientEntry(index, { authHeader: e.target.value })
                            }
                            placeholder="Authorization"
                            autoComplete="off"
                          />
                        </label>
                      </div>

                      {/* Row 3: category / type / currency */}
                      <div className="lp-classifier-grid">
                        <label className="bk-field">
                          <span className="bk-field-label">Debt category</span>
                          <select
                            value={entry.debtCategoryId}
                            onChange={(e) =>
                              updateClientEntry(index, { debtCategoryId: e.target.value })
                            }
                          >
                            <option value="">Select…</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="bk-field">
                          <span className="bk-field-label">Debt type</span>
                          <select
                            value={entry.debtTypeId}
                            onChange={(e) =>
                              updateClientEntry(index, { debtTypeId: e.target.value })
                            }
                          >
                            <option value="">Select…</option>
                            {debtTypes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="bk-field">
                          <span className="bk-field-label">Currency</span>
                          <select
                            value={entry.currencyId}
                            onChange={(e) =>
                              updateClientEntry(index, { currencyId: e.target.value })
                            }
                          >
                            <option value="">Select…</option>
                            {currencies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code || c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="config-form-actions">
          <LoadingButton
            type="submit"
            className="btn-primary btn-sm"
            loading={saving}
            loadingText="Saving…"
          >
            Save integration settings
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

export default Integrations;
