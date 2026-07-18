import { useCallback, useEffect, useState } from 'react';
import {
  X,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Users,
  UserCog,
  Wallet,
  CalendarDays,
  Clock,
  History,
  AlertCircle,
  Hash,
  Layers,
  Tags,
  Coins,
  Link2,
  FileText,
  TrendingUp,
  DollarSign,
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  MailCheck,
  MessageSquareText,
  PhoneCall,
  UserMinus,
  UserPlus,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { fetchDebtorHistory } from '../api/debtors';
import { useSystemConfig } from '../context/SystemConfigContext';

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  return `${symbol} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function eventVisual(actionType) {
  const type = String(actionType || '').toLowerCase();
  if (type === 'debtor.created') {
    return { label: 'Imported', tone: 'import', icon: ClipboardCheck };
  }
  if (type === 'contact.sms') {
    return { label: 'SMS', tone: 'contact', icon: MessageSquareText };
  }
  if (type === 'contact.email') {
    return { label: 'Email', tone: 'contact', icon: MailCheck };
  }
  if (type === 'contact.call') {
    return { label: 'Call', tone: 'contact', icon: PhoneCall };
  }
  if (type === 'contact.response') {
    return { label: 'Response', tone: 'contact', icon: MessageSquareText };
  }
  if (type === 'contact.ptp' || type === 'ptp.updated') {
    return { label: 'PTP', tone: 'ptp', icon: CheckCircle2 };
  }
  if (type === 'debtor.assigned') {
    return { label: 'Assigned', tone: 'assignment', icon: UserPlus };
  }
  if (type === 'debtor.unassigned') {
    return { label: 'Unassigned', tone: 'assignment', icon: UserMinus };
  }
  if (type === 'debtor.reassigned') {
    return { label: 'Reassigned', tone: 'assignment', icon: ArrowLeftRight };
  }
  if (type === 'payment.detected') {
    return { label: 'Payment', tone: 'payment', icon: Wallet };
  }
  if (type === 'debtor.updated') {
    return { label: 'Updated', tone: 'update', icon: Pencil };
  }
  if (type === 'debtor.soft_deleted') {
    return { label: 'Removed', tone: 'removed', icon: Trash2 };
  }
  if (type === 'debtor.case_closed') {
    return { label: 'Closed', tone: 'case', icon: AlertCircle };
  }
  if (type === 'debtor.case_reopened') {
    return { label: 'Reopened', tone: 'case', icon: AlertCircle };
  }
  return { label: 'Activity', tone: 'default', icon: Activity };
}

function buildEventDetails(evt, currencySymbol) {
  const metadata = evt.metadata || {};
  const details = [];

  if (metadata.channel) details.push(`Channel: ${metadata.channel.toUpperCase()}`);
  if (metadata.agentName && metadata.previousAgentName) {
    details.push(`Agent: ${metadata.previousAgentName} -> ${metadata.agentName}`);
  } else if (metadata.agentName) {
    details.push(`Agent: ${metadata.agentName}`);
  } else if (metadata.previousAgentName) {
    details.push(`Previous Agent: ${metadata.previousAgentName}`);
  }

  if (metadata.contactStatusName) details.push(`Status: ${metadata.contactStatusName}`);
  if (metadata.nextActionDate) details.push(`Next Action: ${formatShortDate(metadata.nextActionDate)}`);
  if (metadata.promiseDate) details.push(`Promise Date: ${formatShortDate(metadata.promiseDate)}`);
  if (metadata.reminderDate) details.push(`Reminder: ${formatShortDate(metadata.reminderDate)}`);
  if (Array.isArray(metadata.changedFields) && metadata.changedFields.length > 0) {
    details.push(`Changed: ${metadata.changedFields.join(', ')}`);
  }
  if (metadata.source === 'backfill') details.push('Source: Opening balance');
  else if (metadata.source === 'upload_delta') details.push('Source: Payment upload');
  else if (metadata.source === 'upload_reversal') details.push('Source: Payment reversal');
  else if (metadata.source === 'file_delete') details.push('Source: Batch file deleted');
  else if (metadata.source === 'import') details.push('Source: Import / re-upload');

  const amountValue = evt.amount ?? metadata.promisedAmount ?? null;
  if (amountValue !== null && amountValue !== undefined && Number(amountValue)) {
    details.push(`Amount: ${formatMoney(amountValue, currencySymbol)}`);
  }
  if (metadata.notes) details.push(`Notes: ${metadata.notes}`);

  return details;
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="dh-info-row">
      <span className="dh-info-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <div className="dh-info-body">
        <p className="dh-info-label">{label}</p>
        <p className="dh-info-value">{value || '—'}</p>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="dh-section-title">
      <span className="dh-section-title-icon" aria-hidden="true">
        <Icon size={13} />
      </span>
      <span>{children}</span>
    </div>
  );
}

function DebtorHistoryModal({ debtor, onClose }) {
  const open = Boolean(debtor);
  const debtorId = debtor?.id ?? null;
  const { currencySymbol } = useSystemConfig();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!debtorId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchDebtorHistory(debtorId);
      setData(res);
    } catch (err) {
      setData(null);
      if (!silent) {
        toast.error(err.response?.data?.message || 'Failed to load activity timeline');
      }
    } finally {
      setLoading(false);
    }
  }, [debtorId]);

  useEffect(() => {
    if (!debtorId) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetchDebtorHistory(debtorId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          toast.error(err.response?.data?.message || 'Failed to load activity timeline');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debtorId]);

  if (!debtor) return null;

  const d = data?.debtor || debtor;
  const history = data?.history || [];
  const progressPct = d.loanAmount > 0
    ? Math.min(100, Math.round((d.totalPaid / d.loanAmount) * 100))
    : 0;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation" onClick={onClose}>
      <div
        className="modal-panel dh-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debtor-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent strip */}
        <div className="cf-accent-strip" aria-hidden="true" />

        {/* ── Shared header ── */}
        <div className="cf-header dh-modal-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon dh-header-icon" aria-hidden="true">
              <User className="cf-header-icon-svg" />
            </div>
            <div className="dh-header-text">
              <h2 id="debtor-history-title" className="cf-title">{debtor.name}</h2>
              <div className="dh-header-badges">
                <code className="dm-cfid-badge dm-cfid-badge--sm">{debtor.cfid}</code>
                {debtor.loanId && debtor.loanId !== debtor.cfid && (
                  <span className="dh-badge-pill">
                    <Hash size={10} />
                    {debtor.loanId}
                  </span>
                )}
                {debtor.clientName && (
                  <span className="dh-badge-pill dh-badge-pill--client">
                    <Building2 size={10} />
                    {debtor.clientName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="modal-close-icon" />
          </button>
        </div>

        {/* ── Horizontal two-pane body ── */}
        <div className="dh-layout">

          {/* ── LEFT — profile & loan details ── */}
          <div className="dh-left">

            {/* Batch context */}
            {(d.fileName || d.fileId) && (
              <div className="dh-batch-strip">
                <FileText size={13} className="dh-batch-icon" aria-hidden="true" />
                <span className="dh-batch-label">Batch</span>
                <code className="dh-batch-id">#{d.fileId}</code>
                {d.fileName && <span className="dh-batch-name">{d.fileName}</span>}
              </div>
            )}

            {/* Financial summary cards */}
            <div className="dh-fin-cards">
              <div className="dh-fin-card dh-fin-card--neutral">
                <span className="dh-fin-card-icon dh-fin-card-icon--blue" aria-hidden="true">
                  <DollarSign size={15} />
                </span>
                <div className="dh-fin-card-body">
                  <p className="dh-fin-card-label">Loan Amount</p>
                  <p className="dh-fin-card-value">{formatMoney(d.loanAmount, currencySymbol)}</p>
                </div>
              </div>
              <div className="dh-fin-card dh-fin-card--positive">
                <span className="dh-fin-card-icon dh-fin-card-icon--green" aria-hidden="true">
                  <TrendingUp size={15} />
                </span>
                <div className="dh-fin-card-body">
                  <p className="dh-fin-card-label">Collected</p>
                  <p className="dh-fin-card-value dh-fin-card-value--green">{formatMoney(d.totalPaid, currencySymbol)}</p>
                </div>
              </div>
              <div className="dh-fin-card dh-fin-card--warn">
                <span className="dh-fin-card-icon dh-fin-card-icon--amber" aria-hidden="true">
                  <AlertCircle size={15} />
                </span>
                <div className="dh-fin-card-body">
                  <p className="dh-fin-card-label">Outstanding</p>
                  <p className="dh-fin-card-value dh-fin-card-value--amber">{formatMoney(d.outstandingBalance, currencySymbol)}</p>
                </div>
              </div>
            </div>

            {/* Repayment progress */}
            <div className="dh-progress-wrap">
              <div className="dh-progress-meta">
                <span className="dh-progress-label">Repayment progress</span>
                <span className="dh-progress-pct">{progressPct}%</span>
              </div>
              <div className="dh-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`dh-progress-bar${progressPct >= 100 ? ' dh-progress-bar--complete' : ''}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* ── Identity & Contact ── */}
            <SectionTitle icon={User}>Identity &amp; Contact</SectionTitle>
            <div className="dh-info-grid">
              <InfoRow icon={Hash} label="Loan ID" value={d.loanId} />
              <InfoRow icon={Hash} label="ID Number" value={d.idNumber} />
              <InfoRow icon={Hash} label="Account Number" value={d.accountNumber} />
              <InfoRow icon={Hash} label="Contract Number" value={d.contractNumber} />
              <InfoRow icon={Phone} label="Phone" value={d.phone} />
              <InfoRow icon={Phone} label="Secondary Phone" value={d.secondaryPhoneNumber} />
              <InfoRow icon={Mail} label="Email" value={d.email} />
              <InfoRow icon={MapPin} label="Physical Address" value={d.physicalAddress} />
              <InfoRow icon={Briefcase} label="Employer &amp; Address" value={d.employerAndAddress} />
            </div>

            {/* ── Loan Details ── */}
            <SectionTitle icon={Wallet}>Loan Details</SectionTitle>
            <div className="dh-info-grid">
              <InfoRow icon={Coins} label="Currency" value={d.currencyCode ? `${d.currencyCode} (${d.currencySymbol})` : null} />
              <InfoRow icon={Layers} label="Debt Category" value={d.debtCategoryName} />
              <InfoRow icon={Tags} label="Debt Type" value={d.debtTypeName} />
              <InfoRow icon={Building2} label="Client" value={d.clientName} />
              <InfoRow icon={Wallet} label="Principal" value={d.principalAmount != null ? formatMoney(d.principalAmount, currencySymbol) : null} />
              <InfoRow icon={Wallet} label="Installment" value={d.installmentAmount != null ? formatMoney(d.installmentAmount, currencySymbol) : null} />
              <InfoRow icon={Wallet} label="Waived" value={d.waivedAmount != null ? formatMoney(d.waivedAmount, currencySymbol) : null} />
              <InfoRow icon={Wallet} label="Penalty" value={d.penalty != null ? formatMoney(d.penalty, currencySymbol) : null} />
              <InfoRow icon={Wallet} label="Last Paid Amount" value={d.lastPaidAmount != null ? formatMoney(d.lastPaidAmount, currencySymbol) : null} />
              <InfoRow icon={Hash} label="Overdue Days" value={d.overdueDays ? `${d.overdueDays} days` : 'None'} />
              <InfoRow icon={CalendarDays} label="Loan Taken" value={formatShortDate(d.borrowDate)} />
              <InfoRow icon={CalendarDays} label="Loan Due" value={formatShortDate(d.loanDueDate)} />
              <InfoRow icon={CalendarDays} label="Last Paid Date" value={formatShortDate(d.lastPaidDate)} />
              <InfoRow icon={Hash} label="Loan Counter" value={d.loanCounter != null ? d.loanCounter : null} />
              <InfoRow icon={UserCog} label="Assigned Agent" value={d.assignedAgent} />
            </div>

            {/* ── Next of Kin ── */}
            <SectionTitle icon={Users}>Next of Kin</SectionTitle>
            <div className="dh-info-grid">
              <InfoRow icon={User} label="Full Name" value={d.nextOfKinFullName} />
              <InfoRow icon={Link2} label="Relationship" value={d.nextOfKinRelationship} />
              <InfoRow icon={Phone} label="Phone" value={d.nextOfKinPhoneNumber} />
              <InfoRow icon={Mail} label="Email" value={d.nextOfKinEmail} />
            </div>

            {/* ── Guarantor ── */}
            <SectionTitle icon={UserCog}>Guarantor</SectionTitle>
            <div className="dh-info-grid dh-info-grid--last">
              <InfoRow icon={User} label="Full Name" value={d.guarantorFullName} />
              <InfoRow icon={Phone} label="Phones" value={d.guarantorPhones} />
              <InfoRow icon={Mail} label="Email" value={d.guarantorEmail} />
              <InfoRow icon={MapPin} label="Address" value={d.guarantorAddress} />
            </div>
          </div>

          {/* ── RIGHT — platform activity timeline ── */}
          <div className="dh-right">
            <div className="dh-right-header">
              <span className="dh-right-header-icon" aria-hidden="true">
                <Activity size={14} />
              </span>
              <span className="dh-right-header-title">Platform Activity</span>
              <span className="dh-right-header-count">{loading ? '…' : history.length}</span>
              <button
                type="button"
                className="btn-icon-outline dh-refresh-btn"
                onClick={() => loadHistory({ silent: false })}
                disabled={loading}
                aria-label="Refresh activity"
                title="Refresh activity"
              >
                <RefreshCw size={14} className={loading ? 'spin' : undefined} />
              </button>
            </div>

            <div className="dh-right-body">
              {loading ? (
                <div className="dh-history-empty">
                  <span className="inline-spinner" aria-hidden="true" />
                  <p className="dh-history-empty-title">Loading activity…</p>
                </div>
              ) : history.length === 0 ? (
                <div className="dh-history-empty">
                  <History className="dh-history-empty-icon" />
                  <p className="dh-history-empty-title">No activity yet</p>
                  <p className="dh-history-empty-desc">
                    Payments, contact attempts, and status changes will appear here once recorded.
                  </p>
                </div>
              ) : (
                <ul className="dh-timeline">
                  {history.map((evt) => {
                    const visual = eventVisual(evt.actionType);
                    const EventIcon = visual.icon;
                    const details = buildEventDetails(evt, currencySymbol);
                    return (
                    <li key={evt.id} className="dh-timeline-item">
                      <span className="dh-timeline-dot" aria-hidden="true" />
                      <div className="dh-timeline-content">
                        <div className="dh-timeline-head">
                          <span className={`dh-event-chip dh-event-chip--${visual.tone}`}>
                            <EventIcon size={11} />
                            {visual.label}
                          </span>
                          {evt.actionType ? (
                            <span className="dh-event-code">{evt.actionType}</span>
                          ) : null}
                        </div>
                        <p className="dh-timeline-title">{evt.title || 'Activity'}</p>
                        {evt.subject && evt.subject !== debtor.name ? (
                          <p className="dh-timeline-subject">{evt.subject}</p>
                        ) : null}
                        <p className="dh-timeline-meta">
                          <Clock size={10} className="dh-timeline-meta-icon" />
                          {formatDate(evt.createdAt)}
                          {evt.userName ? ` · ${evt.userName}` : ''}
                        </p>
                        {details.length > 0 ? (
                          <div className="dh-timeline-details">
                            {details.map((detail, idx) => (
                              <p key={`${evt.id}-d-${idx}`} className="dh-timeline-detail">
                                {detail}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DebtorHistoryModal;
