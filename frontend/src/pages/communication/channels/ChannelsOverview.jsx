import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Mail, MessageSquare, Phone, Smartphone, CheckCircle2, ArrowUpRight } from 'lucide-react';
import SectionHeader from '../../../components/SectionHeader';
import StatCard from '../../../components/StatCard';
import { fetchEmailLogsStats } from '../../../api/emailLogs';
import { fetchSmsLogsStats } from '../../../api/sms';

const STATIC_CHANNEL_CARDS = [
  {
    icon: Phone,
    name: 'Voice / GOIP',
    description: 'Outbound collection calls placed through GOIP lines.',
    status: 'Connected',
    metric: '166K calls · 30 days',
  },
  {
    icon: Smartphone,
    name: 'WhatsApp',
    description: 'WhatsApp Business API for reminders and debtor chats.',
    status: 'Not configured',
    metric: 'Awaiting setup',
  },
];

function ChannelsOverview() {
  const [emailStats, setEmailStats] = useState(null);
  const [smsStats, setSmsStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [emails, sms] = await Promise.all([fetchEmailLogsStats(), fetchSmsLogsStats()]);
        if (cancelled) return;
        setEmailStats(emails);
        setSmsStats(sms);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.response?.data?.message || 'Failed to load communication stats');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailsSent = emailStats?.sentThisMonth ?? 0;
  const smsSent = smsStats?.sentThisMonth ?? 0;

  const channelCards = useMemo(
    () => [
      {
        icon: Mail,
        name: 'Email',
        description: 'Transactional and statement emails sent through your SMTP relay.',
        status: 'Connected',
        metric: loading ? 'Loading…' : `${emailsSent.toLocaleString()} sent · this month`,
      },
      {
        icon: MessageSquare,
        name: 'SMS',
        description: 'Bulk and OTP SMS via Africa\u2019s Talking / Twilio gateways.',
        status: 'Connected',
        metric: loading ? 'Loading…' : `${smsSent.toLocaleString()} sent · this month`,
      },
      ...STATIC_CHANNEL_CARDS,
    ],
    [emailsSent, smsSent, loading]
  );

  return (
    <div className="cc-overview">
      <section className="cc-stat-grid">
        <StatCard
          icon={Mail}
          numericValue={emailsSent}
          label="Emails Sent"
          meta="This month"
          accent="#06b6d4"
          variant="compact"
          className={loading ? 'cc-stat-loading' : ''}
        />
        <StatCard
          icon={MessageSquare}
          numericValue={smsSent}
          label="SMS Sent"
          meta="This month"
          accent="#10b981"
          variant="compact"
          className={loading ? 'cc-stat-loading' : ''}
        />
        <StatCard
          icon={Phone}
          numericValue={166351}
          label="Calls Placed"
          meta="Last 30 days"
          accent="#8b5cf6"
          variant="compact"
        />
        <StatCard
          icon={CheckCircle2}
          numericValue={3}
          label="Active Channels"
          meta="1 awaiting setup"
          accent="theme"
          variant="compact"
        />
      </section>

      <div className="cc-card">
        <SectionHeader
          icon={MessageSquare}
          title="Configured Channels"
          count={channelCards.length}
        />
        <div className="cc-channel-grid">
          {channelCards.map((channel) => {
            const Icon = channel.icon;
            const isConnected = channel.status === 'Connected';
            return (
              <article className="cc-channel-card" key={channel.name}>
                <div className="cc-channel-card-head">
                  <span className="cc-channel-icon" aria-hidden="true">
                    <Icon className="cc-channel-icon-svg" />
                  </span>
                  <div className="cc-channel-head-text">
                    <h3 className="cc-channel-name">{channel.name}</h3>
                    <span
                      className={isConnected ? 'cc-status cc-status-on' : 'cc-status cc-status-off'}
                    >
                      {channel.status}
                    </span>
                  </div>
                </div>
                <p className="cc-channel-desc">{channel.description}</p>
                <div className="cc-channel-foot">
                  <span className="cc-channel-metric">{channel.metric}</span>
                  <a className="cc-channel-link" href="/communication/communication-channels/settings">
                    Manage <ArrowUpRight className="cc-channel-link-icon" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ChannelsOverview;
