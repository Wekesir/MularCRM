import { useEffect, useState } from 'react';
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
} from 'lucide-react';
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
  const { currencySymbol } = useSystemConfig();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!debtor) { setData(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    fetchDebtorHistory(debtor.id)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debtor]);

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
                  {history.map((evt) => (
                    <li key={evt.id} className="dh-timeline-item">
                      <span className="dh-timeline-dot" aria-hidden="true" />
                      <div className="dh-timeline-content">
                        <p className="dh-timeline-title">{evt.title}</p>
                        <p className="dh-timeline-meta">
                          <Clock size={10} className="dh-timeline-meta-icon" />
                          {formatDate(evt.createdAt)}
                          {evt.userName ? ` · ${evt.userName}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
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
