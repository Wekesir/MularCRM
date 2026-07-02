import { ShieldCheck, FileText, Clock, AlertTriangle } from 'lucide-react';

const items = [
  {
    icon: FileText,
    title: 'Consent Records',
    description: 'Every debtor contact is logged with channel, timestamp and agent for audit trails.',
    status: 'Enabled',
  },
  {
    icon: Clock,
    title: 'Quiet Hours',
    description: 'Outbound calls and SMS are blocked outside 08:00 – 18:00 and on public holidays.',
    status: 'Enabled',
  },
  {
    icon: AlertTriangle,
    title: 'Opt-Out Registry',
    description: 'Debtors who opt out are suppressed across all channels within 15 minutes.',
    status: 'Enabled',
  },
];

function ChannelsCompliance() {
  return (
    <div className="cc-section">
      <div className="cc-section-header">
        <div className="cc-section-header-left">
          <span className="cc-section-icon"><ShieldCheck className="cc-section-icon-svg" /></span>
          <div>
            <h2 className="cc-section-title">Compliance</h2>
            <p className="cc-section-subtitle">Guardrails that keep your outreach within regulatory bounds.</p>
          </div>
        </div>
      </div>

      <div className="cc-compliance-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article className="cc-compliance-card" key={item.title}>
              <div className="cc-compliance-card-head">
                <span className="cc-compliance-icon" aria-hidden="true">
                  <Icon className="cc-compliance-icon-svg" />
                </span>
                <span className="cc-status cc-status-on">{item.status}</span>
              </div>
              <h3 className="cc-compliance-title">{item.title}</h3>
              <p className="cc-compliance-desc">{item.description}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default ChannelsCompliance;
