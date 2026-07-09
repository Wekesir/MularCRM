import { useEffect } from 'react';
import {
  X,
  Building2,
  Phone,
  Mail,
  Briefcase,
  CircleDot,
} from 'lucide-react';

const TYPE_LABEL_MAP = {
  bank: 'Bank',
  microfinance: 'Microfinance Institution (MFI)',
  sacco: 'SACCO',
  nbfc: 'Non-Bank Financial Institution (NBFI)',
  digital_lender: 'Digital / Online Lender',
  telco_credit: 'Telco / Mobile Credit Provider',
  asset_finance: 'Asset Finance Company',
  hire_purchase: 'Retail / Hire Purchase',
  cooperative: 'Cooperative Society',
  credit_union: 'Credit Union',
  other: 'Other',
};

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="ccm-row">
      <span className="ccm-row-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="ccm-row-body">
        <p className="ccm-row-label">{label}</p>
        <p className="ccm-row-value">{value || '—'}</p>
      </div>
    </div>
  );
}

function ClientContactModal({ client, onClose }) {
  const open = Boolean(client);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!client) return null;

  const statusLabel = client.status === 'active' ? 'Active' : 'Inactive';

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation" onClick={onClose}>
      <div
        className="modal-panel ccm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-contact-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Building2 className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="client-contact-title" className="cf-title">
                Contact Information
              </h2>
              <p className="cf-subtitle">{client.name}</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="ccm-body">
          <div className="ccm-identity">
            <span className="cm-client-avatar ccm-identity-avatar" aria-hidden="true">
              <Building2 className="cm-client-avatar-icon" />
            </span>
            <div className="ccm-identity-text">
              <p className="ccm-identity-name">{client.name}</p>
              <span
                className={
                  client.status === 'active'
                    ? 'cm-badge cm-badge-active'
                    : 'cm-badge cm-badge-inactive'
                }
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="ccm-grid">
            <InfoRow
              icon={Building2}
              label="Client Name"
              value={client.name}
            />
            <InfoRow
              icon={Briefcase}
              label="Business Type"
              value={TYPE_LABEL_MAP[client.businessType] ?? client.businessType}
            />
            <InfoRow icon={Phone} label="Phone Number" value={client.phone} />
            <InfoRow icon={Mail} label="Email Address" value={client.email} />
            <InfoRow
              icon={CircleDot}
              label="Status"
              value={statusLabel}
            />
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClientContactModal;
