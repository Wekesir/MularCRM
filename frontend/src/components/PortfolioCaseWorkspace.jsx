import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarRange,
  ClipboardList,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  PieChart,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  fetchAgentSimCards,
  fetchPortfolioActivity,
  startPortfolioCall,
} from '../api/agentPortfolio';
import { fetchActiveDialer } from '../api/systemConfig';
import { useSystemConfig } from '../context/SystemConfigContext';
import { useAppSelector } from '../store/hooks';

const ACTIVITY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'call', label: 'Calls' },
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Emails' },
];

function formatMoney(value, symbol = '') {
  const n = Number(value) || 0;
  const prefix = symbol ? `${symbol} ` : '';
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const s = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function ActivityIcon({ item }) {
  if (item.channel === 'sms') return <MessageSquare className="icon-sm" />;
  if (item.channel === 'email') return <Mail className="icon-sm" />;
  if (item.direction === 'inbound') return <ArrowDownLeft className="icon-sm" />;
  return <ArrowUpRight className="icon-sm" />;
}

function buildSummary(items) {
  let calls = 0;
  let callsIn = 0;
  let callsOut = 0;
  let sms = 0;
  let emails = 0;
  let talkSeconds = 0;
  let lastAt = null;

  for (const item of items) {
    if (item.channel === 'call') {
      calls += 1;
      if (item.direction === 'inbound') callsIn += 1;
      else callsOut += 1;
      if (Number.isFinite(Number(item.durationSeconds))) {
        talkSeconds += Number(item.durationSeconds);
      }
    } else if (item.channel === 'sms') {
      sms += 1;
    } else if (item.channel === 'email') {
      emails += 1;
    }
    if (item.createdAt && (!lastAt || new Date(item.createdAt) > new Date(lastAt))) {
      lastAt = item.createdAt;
    }
  }

  return {
    total: items.length,
    calls,
    callsIn,
    callsOut,
    sms,
    emails,
    talkSeconds,
    lastAt,
  };
}

function PortfolioCaseWorkspace({
  open,
  debtor,
  onClose,
  onSendSms,
  onSendEmail,
  onLogResponse,
  onRestructure,
}) {
  const { currencySymbol } = useSystemConfig();
  const yeastarExtension = useAppSelector(
    (state) => state.auth.user?.yeastarExtension || null
  );
  const [channelTab, setChannelTab] = useState('all');
  const [allActivity, setAllActivity] = useState([]);
  const [debtorMeta, setDebtorMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sims, setSims] = useState([]);
  const [simCardId, setSimCardId] = useState('');
  const [calling, setCalling] = useState(false);
  const [callHint, setCallHint] = useState('');
  const [activeDialer, setActiveDialer] = useState(null);

  const loadActivity = useCallback(async () => {
    if (!debtor?.id) return;
    setLoading(true);
    try {
      const data = await fetchPortfolioActivity(debtor.id, { channel: 'all', limit: 200 });
      setAllActivity(data.items || []);
      setDebtorMeta(data.debtor || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load activity');
      setAllActivity([]);
    } finally {
      setLoading(false);
    }
  }, [debtor?.id]);

  useEffect(() => {
    if (!open || !debtor?.id) return undefined;
    setChannelTab('all');
    setCallHint('');
    fetchActiveDialer()
      .then(setActiveDialer)
      .catch(() => setActiveDialer(null));
    fetchAgentSimCards()
      .then((rows) => {
        setSims(rows.filter((s) => s.isActive && s.supportsOutbound));
        const def =
          rows.find((s) => s.isDefault && s.isActive && s.supportsOutbound) ||
          rows.find((s) => s.isActive && s.supportsOutbound);
        setSimCardId(def ? String(def.id) : '');
      })
      .catch(() => setSims([]));
    return undefined;
  }, [open, debtor?.id]);

  useEffect(() => {
    if (!open || !debtor?.id) return undefined;
    loadActivity();
  }, [open, debtor?.id, loadActivity]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !calling) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, calling, onClose]);

  const activity = useMemo(() => {
    if (channelTab === 'all') return allActivity;
    return allActivity.filter((item) => item.channel === channelTab);
  }, [allActivity, channelTab]);

  const summary = useMemo(() => buildSummary(allActivity), [allActivity]);

  if (!open || !debtor) return null;

  const meta = debtorMeta || debtor;
  const outboundSims = sims;

  const dialerProvider = activeDialer?.activeProvider || null;
  const dialerLabel = activeDialer?.label || 'None';
  const isYeastarActive = dialerProvider === 'yeastar';
  const isAtActive = dialerProvider === 'africastalking';
  const canCallViaYeastar = isYeastarActive && Boolean(yeastarExtension);
  const canCallViaSim = isAtActive && Boolean(simCardId);
  const canPlaceCall = isYeastarActive ? canCallViaYeastar : isAtActive ? canCallViaSim : false;

  const handleCall = async () => {
    if (!meta.phone) {
      toast.error('Debtor has no phone number');
      return;
    }
    if (!dialerProvider) {
      toast.error('No active dialer is configured. Contact a system administrator.');
      return;
    }
    if (isYeastarActive && !yeastarExtension) {
      toast.error('No Yeastar extension assigned. Ask an admin to set it on your user profile.');
      return;
    }
    if (isAtActive && !canCallViaSim) {
      toast.error('Add an outbound SIM under Profile → SIM Cards before placing calls.');
      return;
    }
    setCalling(true);
    setCallHint('');
    try {
      const payload = isAtActive && simCardId ? { simCardId: Number(simCardId) } : {};
      const result = await startPortfolioCall(debtor.id, payload);
      const via = result.dialerLabel || dialerLabel;
      setCallHint(result.next || 'Answer your phone to connect with the debtor.');
      toast.success(`Call started via ${via}`);
      loadActivity();
      onLogResponse?.(debtor, 'call');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to start call');
    } finally {
      setCalling(false);
    }
  };

  const initial = String(meta?.name || debtor.name || '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="modal-backdrop modal-backdrop-static pcw-backdrop" role="presentation">
      <div
        className="modal-panel modal-fullscreen pcw-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcw-title"
      >
        <header className="pcw-header">
          <div className="pcw-header-left">
            <span className="pcw-avatar" aria-hidden="true">
              {initial}
            </span>
            <div className="pcw-header-text min-w-0">
              <p className="pcw-header-eyebrow">Case workspace</p>
              <h2 id="pcw-title" className="pcw-header-title truncate">
                {meta.name}
              </h2>
              <p className="pcw-header-sub truncate">
                {[meta.clientName, meta.accountNumber].filter(Boolean).join(' · ') || 'Portfolio case'}
              </p>
            </div>
            {meta.contactStatusName && (
              <span className="pcw-status-pill">{meta.contactStatusName}</span>
            )}
          </div>
          <button
            type="button"
            className="pcw-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={calling}
          >
            <X className="icon-sm" />
            <span>Close</span>
          </button>
        </header>

        <div className="pcw-body">
          {/* Column 1 — debtor + actions */}
          <aside className="pcw-sidebar">
            <div className="pcw-col-label">Debtor details</div>
            <div className="pcw-meta-card">
              <div className="pcw-meta-row">
                <p className="pcw-meta-label">Phone</p>
                <p className="pcw-meta-value">{meta.phone || '—'}</p>
              </div>
              <div className="pcw-meta-row">
                <p className="pcw-meta-label">Email</p>
                <p className="pcw-meta-value pcw-meta-value--wrap">{meta.email || '—'}</p>
              </div>
              <div className="pcw-meta-row pcw-meta-row--split">
                <div>
                  <p className="pcw-meta-label">Outstanding</p>
                  <p className="pcw-meta-value pcw-meta-value--money">
                    {formatMoney(meta.outstandingBalance, currencySymbol)}
                  </p>
                </div>
                <div>
                  <p className="pcw-meta-label">DPD</p>
                  <p className="pcw-meta-value">
                    {meta.overdueDays > 0 ? `${meta.overdueDays}d` : '—'}
                    {meta.bucket ? (
                      <span className="pcw-bucket">{meta.bucket}</span>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>

            <div className="pcw-col-label">Reach out</div>
            <div className="pcw-actions-card">
              <div className="pcw-dialer-badge" role="status">
                <Phone className="icon-sm" aria-hidden="true" />
                <div className="pcw-dialer-badge-text">
                  <span className="pcw-dialer-badge-label">Active dialer</span>
                  <strong className="pcw-dialer-badge-value">
                    {activeDialer == null ? 'Loading…' : dialerLabel}
                  </strong>
                </div>
              </div>

              {isAtActive ? (
                <div className="pcw-sim-field">
                  <label className="pcw-sim-label" htmlFor="pcw-sim">
                    Outbound SIM
                  </label>
                  <select
                    id="pcw-sim"
                    className="pcw-select"
                    value={simCardId}
                    onChange={(e) => setSimCardId(e.target.value)}
                    disabled={calling || outboundSims.length === 0}
                  >
                    {outboundSims.length === 0 ? (
                      <option value="">No SIM registered</option>
                    ) : (
                      outboundSims.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} · {s.phoneNumber}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : null}

              {isYeastarActive ? (
                <p className="pcw-call-hint" style={{ marginTop: 0 }}>
                  {yeastarExtension
                    ? `Calling from Yeastar extension ${yeastarExtension}`
                    : 'No Yeastar extension on your profile — ask an admin to assign one.'}
                </p>
              ) : null}

              {!dialerProvider && activeDialer != null ? (
                <p className="pcw-call-hint" style={{ marginTop: 0 }}>
                  No system dialer is active. A system admin must choose one under Communication.
                </p>
              ) : null}

              <div className="pcw-action-grid">
                <button
                  type="button"
                  className="pcw-action-btn pcw-action-btn--primary"
                  onClick={handleCall}
                  disabled={calling || !meta.phone || !canPlaceCall}
                >
                  {calling ? <Loader2 className="icon-sm animate-spin" /> : <Phone className="icon-sm" />}
                  {calling ? 'Calling…' : 'Call'}
                </button>
                <button
                  type="button"
                  className="pcw-action-btn"
                  onClick={() => onSendSms?.(debtor)}
                  disabled={!meta.phone}
                >
                  <MessageSquare className="icon-sm" />
                  SMS
                </button>
                <button
                  type="button"
                  className="pcw-action-btn"
                  onClick={() => onSendEmail?.(debtor)}
                  disabled={!meta.email}
                >
                  <Mail className="icon-sm" />
                  Email
                </button>
                <button
                  type="button"
                  className="pcw-action-btn"
                  onClick={() => onLogResponse?.(debtor, meta.lastContactChannel || 'call')}
                >
                  <ClipboardList className="icon-sm" />
                  Log
                </button>
                <button
                  type="button"
                  className="pcw-action-btn"
                  onClick={() => onRestructure?.(debtor)}
                >
                  <CalendarRange className="icon-sm" />
                  Restructure
                </button>
              </div>
            </div>

            {callHint && (
              <p className="pcw-call-hint" role="status">
                <Phone className="icon-sm" aria-hidden="true" />
                {callHint}
              </p>
            )}
          </aside>

          {/* Column 2 — activity feed */}
          <section className="pcw-activity">
            <div className="pcw-activity-toolbar">
              <div>
                <p className="pcw-col-label pcw-col-label--inline">Communication history</p>
                <p className="pcw-activity-count">
                  {loading ? 'Loading…' : `${activity.length} event${activity.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="pcw-activity-toolbar-right">
                <div className="pcw-seg" role="tablist" aria-label="Filter activity">
                  {ACTIVITY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={channelTab === tab.key}
                      className={channelTab === tab.key ? 'pcw-seg-btn is-active' : 'pcw-seg-btn'}
                      onClick={() => setChannelTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="pcw-icon-btn"
                  aria-label="Refresh activity"
                  onClick={loadActivity}
                  disabled={loading}
                >
                  <RefreshCw className={`icon-sm${loading ? ' animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="pcw-activity-list">
              {loading ? (
                <div className="pcw-activity-empty">
                  <Loader2 className="icon-md animate-spin" />
                  <p>Loading activity…</p>
                </div>
              ) : activity.length === 0 ? (
                <div className="pcw-activity-empty">
                  <div className="pcw-activity-empty-icon" aria-hidden="true">
                    <Phone className="icon-md" />
                  </div>
                  <p className="pcw-empty-title">No activity yet</p>
                  <p className="pcw-empty-desc">
                    Calls, SMS, and emails for this debtor will appear here as you work the case.
                  </p>
                </div>
              ) : (
                <div className="pcw-timeline">
                  {activity.map((item) => (
                    <article
                      key={item.id}
                      className={`pcw-activity-item pcw-activity-item--${item.channel}`}
                    >
                      <span
                        className={`pcw-activity-icon pcw-activity-icon--${item.channel}`}
                        aria-hidden="true"
                      >
                        <ActivityIcon item={item} />
                      </span>
                      <div className="pcw-activity-body">
                        <div className="pcw-activity-top">
                          <span className="pcw-activity-channel">
                            {item.channel === 'call'
                              ? item.direction === 'inbound'
                                ? 'Inbound call'
                                : item.kind === 'call_log'
                                  ? 'Call logged'
                                  : 'Outbound call'
                              : item.channel === 'sms'
                                ? 'SMS'
                                : 'Email'}
                          </span>
                          <time className="pcw-activity-time" dateTime={item.createdAt}>
                            {formatWhen(item.createdAt)}
                          </time>
                        </div>
                        {item.subject && <p className="pcw-activity-subject">{item.subject}</p>}
                        {item.preview && <p className="pcw-activity-preview">{item.preview}</p>}
                        <div className="pcw-activity-meta">
                          {item.status && (
                            <span className="pcw-chip">{item.status}</span>
                          )}
                          {formatDuration(item.durationSeconds) && (
                            <span className="pcw-chip">{formatDuration(item.durationSeconds)}</span>
                          )}
                          {item.recordingUrl && (
                            <a
                              className="pcw-chip pcw-chip--link"
                              href={item.recordingUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Recording
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Column 3 — portfolio activity summary */}
          <aside className="pcw-summary" aria-label="Portfolio activity summary">
            <div className="pcw-summary-header">
              <span className="pcw-summary-header-icon" aria-hidden="true">
                <PieChart className="icon-sm" />
              </span>
              <div>
                <h3 className="pcw-summary-title">Activity summary</h3>
                <p className="pcw-summary-subtitle">Portfolio effort on this debtor</p>
              </div>
            </div>

            <div className="pcw-summary-total">
              <p className="pcw-summary-total-value">{summary.total}</p>
              <p className="pcw-summary-total-label">Total touchpoints</p>
            </div>

            <ul className="pcw-summary-stats">
              <li className="pcw-summary-stat pcw-summary-stat--call">
                <span className="pcw-summary-stat-icon" aria-hidden="true">
                  <Phone className="icon-sm" />
                </span>
                <div className="pcw-summary-stat-text">
                  <span className="pcw-summary-stat-value">{summary.calls}</span>
                  <span className="pcw-summary-stat-label">Calls</span>
                </div>
                <span className="pcw-summary-stat-meta">
                  {summary.callsOut} out · {summary.callsIn} in
                </span>
              </li>
              <li className="pcw-summary-stat pcw-summary-stat--sms">
                <span className="pcw-summary-stat-icon" aria-hidden="true">
                  <MessageSquare className="icon-sm" />
                </span>
                <div className="pcw-summary-stat-text">
                  <span className="pcw-summary-stat-value">{summary.sms}</span>
                  <span className="pcw-summary-stat-label">SMS</span>
                </div>
              </li>
              <li className="pcw-summary-stat pcw-summary-stat--email">
                <span className="pcw-summary-stat-icon" aria-hidden="true">
                  <Mail className="icon-sm" />
                </span>
                <div className="pcw-summary-stat-text">
                  <span className="pcw-summary-stat-value">{summary.emails}</span>
                  <span className="pcw-summary-stat-label">Emails</span>
                </div>
              </li>
            </ul>

            <div className="pcw-summary-extras">
              <div className="pcw-summary-extra">
                <p className="pcw-meta-label">Talk time</p>
                <p className="pcw-meta-value">
                  {formatDuration(summary.talkSeconds) || '0s'}
                </p>
              </div>
              <div className="pcw-summary-extra">
                <p className="pcw-meta-label">Last contact</p>
                <p className="pcw-meta-value">
                  {summary.lastAt ? formatWhen(summary.lastAt) : '—'}
                </p>
              </div>
              <div className="pcw-summary-extra">
                <p className="pcw-meta-label">Next action</p>
                <p className="pcw-meta-value">
                  {meta.nextActionDate
                    ? new Date(meta.nextActionDate).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
              <div className="pcw-summary-extra">
                <p className="pcw-meta-label">Channel mix</p>
                <div className="pcw-summary-bars" aria-hidden="true">
                  {summary.total > 0 ? (
                    <>
                      <span
                        className="pcw-summary-bar pcw-summary-bar--call"
                        style={{ flex: summary.calls || 0.0001 }}
                        title={`Calls ${summary.calls}`}
                      />
                      <span
                        className="pcw-summary-bar pcw-summary-bar--sms"
                        style={{ flex: summary.sms || 0.0001 }}
                        title={`SMS ${summary.sms}`}
                      />
                      <span
                        className="pcw-summary-bar pcw-summary-bar--email"
                        style={{ flex: summary.emails || 0.0001 }}
                        title={`Emails ${summary.emails}`}
                      />
                    </>
                  ) : (
                    <span className="pcw-summary-bar pcw-summary-bar--empty" />
                  )}
                </div>
                <div className="pcw-summary-legend">
                  <span><i className="pcw-dot pcw-dot--call" /> Calls</span>
                  <span><i className="pcw-dot pcw-dot--sms" /> SMS</span>
                  <span><i className="pcw-dot pcw-dot--email" /> Email</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default PortfolioCaseWorkspace;
