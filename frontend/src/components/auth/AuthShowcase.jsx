import {
  BarChart3,
  MessageSquare,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { useSystemConfig } from '../../context/SystemConfigContext';
import TypewriterText from './TypewriterText';

const TYPED_PHRASES = [
  'collect smarter with real-time debtor insights.',
  'recover more through structured follow-up workflows.',
  'report faster with analytics your leadership trusts.',
  'stay compliant with OTP sign-in and role-based access.',
  'engage customers across email, SMS, and case notes.',
  'close cases faster with assignments that never slip.',
  'give every agent the full picture before they reach out.',
];

const FEATURES = [
  {
    icon: Users,
    title: 'Debtor & case hub',
    description: 'Profiles, assignments, and follow-ups in one workspace.',
  },
  {
    icon: BarChart3,
    title: 'Reporting & analytics',
    description: '17+ reports for collections, loans, and performance.',
  },
  {
    icon: MessageSquare,
    title: 'Omnichannel outreach',
    description: 'Email and SMS integrations for debtor communication.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure team access',
    description: 'OTP sign-in, roles, and granular permissions.',
  },
  {
    icon: Workflow,
    title: 'Workflow automation',
    description: 'Escalations, reminders, and compliance guardrails.',
  },
];

function getBusinessInitial(name) {
  const trimmed = (name || '').trim();
  return (trimmed.charAt(0) || 'O').toUpperCase();
}

function AuthShowcase() {
  const { businessName, businessLogo } = useSystemConfig();
  const initial = getBusinessInitial(businessName);

  return (
    <div className="auth-showcase-inner">
      <div className="auth-showcase-glow auth-showcase-glow-a" aria-hidden="true" />
      <div className="auth-showcase-glow auth-showcase-glow-b" aria-hidden="true" />

      <div className="auth-showcase-brand">
        <span className="auth-showcase-mark" aria-hidden="true">
          {businessLogo ? (
            <img src={businessLogo} alt="" className="auth-showcase-logo" />
          ) : (
            <span className="auth-showcase-initial">{initial}</span>
          )}
        </span>
        <div>
          <p className="auth-showcase-eyebrow">{businessName}</p>
          <p className="auth-showcase-sub">Collections CRM platform</p>
        </div>
      </div>

      <h2 className="auth-showcase-headline">
        <span className="auth-showcase-headline-prefix">Built for teams that</span>
        <TypewriterText
          phrases={TYPED_PHRASES}
          className="auth-showcase-typewriter"
          ariaLabel="Platform benefits"
          typingMs={92}
          deletingMs={52}
          pauseMs={4800}
        />
      </h2>

      <p className="auth-showcase-lead">
        OMNICRM brings debtor management, reporting, communications, and access control
        into a single platform — so your collections team can focus on outcomes, not tools.
      </p>

      <ul className="auth-showcase-features">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <li
              key={feature.title}
              className="auth-showcase-feature"
              style={{ '--feature-delay': `${index * 90}ms` }}
            >
              <span className="auth-showcase-feature-icon" aria-hidden="true">
                <Icon className="auth-showcase-feature-icon-svg" />
              </span>
              <span className="auth-showcase-feature-copy">
                <strong>{feature.title}</strong>
                <span>{feature.description}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="auth-showcase-footnote">
        Trusted workflows for loan recovery, customer engagement, and executive reporting.
      </p>
    </div>
  );
}

export default AuthShowcase;
