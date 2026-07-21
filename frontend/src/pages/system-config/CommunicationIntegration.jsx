import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  ExternalLink,
  Mail,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Shield,
  Smartphone,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { fetchSmsBalance, sendTestSms, sendTestVoiceCall } from '../../api/systemConfig';
import { fetchEmailTemplates, fetchSmsTemplates } from '../../api/templates';
import {
  CELCOM_AFRICA_SMS,
  SMS_PROVIDER_OPTIONS,
} from '../../config/celcomAfricaSms';
import { useSystemConfig } from '../../context/SystemConfigContext';

const BALANCE_REFRESH_MS = 60_000;
const DEFAULT_TEST_MESSAGE = 'This is a test SMS from OMNICRM. Your SMS integration is working.';

const HOSTINGER_DEFAULTS = {
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
  secure: true,
};

const EMAIL_PROVIDER_LABELS = {
  resend: 'Resend',
  smtp: 'Custom SMTP',
  hostinger: 'Hostinger Mail',
};

const TABS = [
  { id: 'security', label: 'Login Security', Icon: Shield, color: '#7c3aed', colorMuted: 'color-mix(in srgb, #7c3aed 12%, transparent)', borderColor: 'color-mix(in srgb, #7c3aed 30%, transparent)' },
  { id: 'email', label: 'Email', Icon: Mail, color: '#2563eb', colorMuted: 'color-mix(in srgb, #2563eb 12%, transparent)', borderColor: 'color-mix(in srgb, #2563eb 30%, transparent)' },
  { id: 'sms', label: 'SMS', Icon: Smartphone, color: '#059669', colorMuted: 'color-mix(in srgb, #059669 12%, transparent)', borderColor: 'color-mix(in srgb, #059669 30%, transparent)' },
  { id: 'voice', label: 'Voice', Icon: PhoneCall, color: '#ea580c', colorMuted: 'color-mix(in srgb, #ea580c 12%, transparent)', borderColor: 'color-mix(in srgb, #ea580c 30%, transparent)' },
  { id: 'notifications', label: 'Notifications', Icon: Bell, color: '#db2777', colorMuted: 'color-mix(in srgb, #db2777 12%, transparent)', borderColor: 'color-mix(in srgb, #db2777 30%, transparent)' },
];

function CommunicationIntegration() {
  const { config, loadConfig, updateConfig } = useSystemConfig();
  const [form, setForm] = useState(config);
  const [activeTab, setActiveTab] = useState('security');
  const [saving, setSaving] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState('');
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState(null);
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState(DEFAULT_TEST_MESSAGE);
  const [testingSms, setTestingSms] = useState(false);
  const [testVoiceTo, setTestVoiceTo] = useState('');
  const [testVoiceFrom, setTestVoiceFrom] = useState('');
  const [testingVoice, setTestingVoice] = useState(false);
  const [voiceTestHint, setVoiceTestHint] = useState('');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [smsTemplates, setSmsTemplates] = useState([]);

  useEffect(() => {
    loadConfig()
      .then(setForm)
      .catch(() => toast.error('Failed to load configuration'));
  }, [loadConfig]);

  useEffect(() => {
    Promise.all([
      fetchEmailTemplates({ systemOnly: true }).catch(() => []),
      fetchSmsTemplates({ systemOnly: true }).catch(() => []),
    ])
      .then(([emailList, smsList]) => {
        setEmailTemplates(emailList);
        setSmsTemplates(smsList);
      })
      .catch(() => {});
  }, []);

  const emailProvider = form.email?.provider || 'resend';
  const emailProviderLabel = EMAIL_PROVIDER_LABELS[emailProvider] || 'Resend';
  const isSmtpLike = emailProvider === 'smtp' || emailProvider === 'hostinger';
  const isHostinger = emailProvider === 'hostinger';

  const smsProvider = form.sms?.provider || '';
  const isCelcom = smsProvider === CELCOM_AFRICA_SMS.PROVIDER_ID;
  const hasSavedCredentials =
    isCelcom && Boolean(form.sms?.partnerId) && Boolean(form.sms?.apiKeySet);
  const smsProviderLabel =
    SMS_PROVIDER_OPTIONS.find((o) => o.value === smsProvider)?.label || 'Not configured';

  const activeDialer = form.voice?.activeProvider || '';
  const activeDialerLabel =
    activeDialer === 'yeastar'
      ? 'Yeastar'
      : activeDialer === 'africastalking'
        ? "Africa's Talking"
        : 'None selected';

  // ── Warning indicators ──────────────────────────────────────────────────────
  const emailNeedsAction =
    !form.email?.fromAddress ||
    (emailProvider === 'resend' && !form.email?.resendApiKey && !form.email?.resendApiKeySet) ||
    (isSmtpLike && (!form.email?.smtpHost || !form.email?.smtpUser));

  const smsNeedsAction = !isCelcom || !form.sms?.partnerId || !form.sms?.apiKeySet;

  const voiceNeedsAction = !activeDialer;

  function tabNeedsAction(id) {
    if (id === 'email') return emailNeedsAction;
    if (id === 'sms') return smsNeedsAction;
    if (id === 'voice') return voiceNeedsAction;
    return false;
  }

  // ── Balance ─────────────────────────────────────────────────────────────────
  const loadBalance = useCallback(async (silent = false) => {
    if (!isCelcom) { setBalance(null); setBalanceError(''); return; }
    if (!hasSavedCredentials) {
      setBalance(null);
      setBalanceError('Save Partner ID and API key to load balance.');
      return;
    }
    setBalanceLoading(true);
    if (!silent) setBalanceError('');
    try {
      const result = await fetchSmsBalance();
      setBalance(result.balance);
      setBalanceError('');
      setBalanceUpdatedAt(new Date());
    } catch (error) {
      setBalance(null);
      setBalanceError(error.response?.data?.message || 'Could not load SMS balance');
    } finally {
      setBalanceLoading(false);
    }
  }, [hasSavedCredentials, isCelcom]);

  useEffect(() => { loadBalance(true); }, [loadBalance]);

  useEffect(() => {
    if (!isCelcom || !hasSavedCredentials) return undefined;
    const timer = window.setInterval(() => loadBalance(true), BALANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hasSavedCredentials, isCelcom, loadBalance]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const updateField = (section, field, value) =>
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const updateYeastarField = (field, value) =>
    setForm((prev) => ({
      ...prev,
      voice: { ...prev.voice, yeastar: { ...(prev.voice?.yeastar || {}), [field]: value } },
    }));

  const generateIntegrationApiKey = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    updateYeastarField('integrationApiKey', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
    toast.info('New integration API key generated — save settings to apply it');
  };

  const downloadYeastarTemplate = async () => {
    try {
      const { default: api } = await import('../../api/client');
      const response = await api.get('/api/integrations/yeastar/crm-template.xml', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yeastar-omnicrm-crm-template.xml';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to download CRM template');
    }
  };

  const handleEmailProviderChange = (provider) => {
    setForm((prev) => {
      const email = { ...prev.email, provider };
      if (provider === 'hostinger') {
        email.smtpHost = prev.email?.smtpHost || HOSTINGER_DEFAULTS.smtpHost;
        email.smtpPort = prev.email?.smtpPort || HOSTINGER_DEFAULTS.smtpPort;
        if (prev.email?.secure === undefined || prev.email?.secure === null) email.secure = HOSTINGER_DEFAULTS.secure;
      }
      return { ...prev, email };
    });
  };

  const handleSmsProviderChange = (provider) => {
    setForm((prev) => ({
      ...prev,
      sms: {
        ...CELCOM_AFRICA_SMS.DEFAULT_SMS_CONFIG,
        ...prev.sms,
        provider,
        apiUrl: provider === CELCOM_AFRICA_SMS.PROVIDER_ID
          ? prev.sms?.apiUrl || CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS
          : prev.sms?.apiUrl || '',
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateConfig({ email: form.email, sms: form.sms, voice: form.voice, auth: form.auth, notifications: form.notifications });
      setForm(saved);
      toast.success('Communication settings saved');
      await loadBalance(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testMobile.trim()) { toast.error('Enter a mobile number for the test SMS'); return; }
    setTestingSms(true);
    try {
      const result = await sendTestSms({ mobile: testMobile.trim(), message: testMessage.trim() || undefined });
      toast.success(result.message || 'Test SMS sent');
      await loadBalance(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send test SMS');
    } finally {
      setTestingSms(false);
    }
  };

  const handleSendTestVoice = async () => {
    if (!activeDialer) { toast.error('Select an active dialer and save before testing'); return; }
    if (!testVoiceTo.trim()) { toast.error('Enter a destination phone number for the test call'); return; }
    setTestingVoice(true);
    setVoiceTestHint('');
    try {
      const payload = { provider: activeDialer, to: testVoiceTo.trim() };
      if (activeDialer === 'yeastar' && testVoiceFrom.trim()) payload.callerExtension = testVoiceFrom.trim();
      if (activeDialer === 'africastalking' && testVoiceFrom.trim()) payload.agentPhone = testVoiceFrom.trim();
      const result = await sendTestVoiceCall(payload);
      setVoiceTestHint(result.next || 'Test call started — answer your phone to verify.');
      toast.success(`Test call started via ${result.dialerLabel || activeDialerLabel}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to place test call');
    } finally {
      setTestingVoice(false);
    }
  };

  const formatBalance = (value) => {
    if (value === null || value === undefined) return '—';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
  };

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="comm-tabs-root">
      {/* ── Tab bar ── */}
      <nav className="comm-tab-bar" role="tablist" aria-label="Communication configuration">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const warn = tabNeedsAction(tab.id);
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`comm-panel-${tab.id}`}
              type="button"
              className={`comm-tab${isActive ? ' comm-tab--active' : ''}${warn ? ' comm-tab--warn' : ''}`}
              style={isActive ? { '--tab-color': tab.color, '--tab-color-muted': tab.colorMuted, '--tab-border': tab.borderColor } : {}}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="comm-tab-icon-wrap" style={isActive ? { background: tab.colorMuted, color: tab.color, borderColor: tab.borderColor } : {}}>
                <tab.Icon className="comm-tab-icon" aria-hidden="true" />
              </span>
              <span className="comm-tab-label">{tab.label}</span>
              {warn && (
                <span className="comm-tab-warn-dot" aria-label="Needs configuration">!</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Tab panels ── */}
      <div className="comm-tab-content">
        {/* Security */}
        {activeTab === 'security' && (
          <div id="comm-panel-security" role="tabpanel" className="comm-panel">
            <div className="comm-panel-header" style={{ '--panel-color': '#7c3aed', '--panel-color-muted': 'color-mix(in srgb, #7c3aed 10%, var(--bg-surface))' }}>
              <div className="comm-panel-icon" style={{ background: 'color-mix(in srgb, #7c3aed 14%, transparent)', color: '#7c3aed', borderColor: 'color-mix(in srgb, #7c3aed 28%, transparent)' }}>
                <Shield className="comm-panel-icon-svg" aria-hidden="true" />
              </div>
              <div className="comm-panel-header-text">
                <div className="comm-panel-title-row">
                  <h3 className="comm-panel-title">Login Security</h3>
                  <span className="comm-panel-badge" style={{ background: 'color-mix(in srgb, #7c3aed 12%, transparent)', color: '#7c3aed', borderColor: 'color-mix(in srgb, #7c3aed 28%, transparent)' }}>
                    {form.auth?.otpOnLogin === false ? 'Password only' : 'OTP enabled'}
                  </span>
                </div>
                <p className="comm-panel-desc">
                  Require a one-time code after password sign-in. Disable to let users sign in with email and password only.
                </p>
              </div>
            </div>
            <div className="comm-panel-body config-form">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.auth?.otpOnLogin !== false}
                  onChange={(e) => updateField('auth', 'otpOnLogin', e.target.checked)}
                />
                Enable OTP on login
              </label>
              {form.auth?.otpOnLogin === false && (
                <p className="config-hint">
                  With OTP disabled, users are signed in immediately after entering valid email and
                  password credentials. Email delivery remains required for password resets.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Email */}
        {activeTab === 'email' && (
          <div id="comm-panel-email" role="tabpanel" className="comm-panel">
            <div className="comm-panel-header" style={{ '--panel-color': '#2563eb', '--panel-color-muted': 'color-mix(in srgb, #2563eb 10%, var(--bg-surface))' }}>
              <div className="comm-panel-icon" style={{ background: 'color-mix(in srgb, #2563eb 14%, transparent)', color: '#2563eb', borderColor: 'color-mix(in srgb, #2563eb 28%, transparent)' }}>
                <Mail className="comm-panel-icon-svg" aria-hidden="true" />
              </div>
              <div className="comm-panel-header-text">
                <div className="comm-panel-title-row">
                  <h3 className="comm-panel-title">Email Configuration</h3>
                  {emailNeedsAction ? (
                    <span className="comm-panel-badge comm-panel-badge--warn">Action needed</span>
                  ) : (
                    <span className="comm-panel-badge" style={{ background: 'color-mix(in srgb, #2563eb 12%, transparent)', color: '#2563eb', borderColor: 'color-mix(in srgb, #2563eb 28%, transparent)' }}>
                      {emailProviderLabel}
                    </span>
                  )}
                </div>
                <p className="comm-panel-desc">
                  Used for login OTP codes, password reset links, and system notifications.
                </p>
              </div>
            </div>

            <div className="comm-panel-body config-form">
              <div className="communication-form-grid--email">
                <label>
                  Email Provider
                  <select value={emailProvider} onChange={(e) => handleEmailProviderChange(e.target.value)}>
                    <option value="resend">Resend (default)</option>
                    <option value="hostinger">Hostinger Mail</option>
                    <option value="smtp">Custom SMTP</option>
                  </select>
                </label>
                <label>
                  From Address
                  <input
                    type="email"
                    value={form.email?.fromAddress || ''}
                    onChange={(e) => updateField('email', 'fromAddress', e.target.value)}
                    placeholder="noreply@yourdomain.com"
                  />
                </label>

                {emailProvider === 'resend' && (
                  <label className="communication-field-span-2">
                    Resend API Key
                    <input
                      type="password"
                      value={form.email?.resendApiKey || ''}
                      onChange={(e) => updateField('email', 'resendApiKey', e.target.value)}
                      placeholder={form.email?.resendApiKeySet ? 'Leave blank to keep current' : 're_...'}
                    />
                  </label>
                )}

                {isSmtpLike && (
                  <div className="communication-field-group communication-field-group--grid communication-field-span-2">
                    {isHostinger && (
                      <p className="config-hint communication-field-span-2">
                        Using Hostinger&apos;s outgoing mail server. Enter the email account&apos;s full
                        address and password below.
                      </p>
                    )}
                    <label>
                      {isHostinger ? 'Mail Host' : 'SMTP Host'}
                      <input
                        type="text"
                        value={form.email?.smtpHost || ''}
                        onChange={(e) => updateField('email', 'smtpHost', e.target.value)}
                        placeholder={isHostinger ? HOSTINGER_DEFAULTS.smtpHost : 'smtp.example.com'}
                      />
                    </label>
                    <label>
                      Port
                      <input
                        type="number"
                        value={form.email?.smtpPort || (isHostinger ? HOSTINGER_DEFAULTS.smtpPort : 587)}
                        onChange={(e) => updateField('email', 'smtpPort', Number(e.target.value))}
                        placeholder={isHostinger ? String(HOSTINGER_DEFAULTS.smtpPort) : '587'}
                      />
                    </label>
                    <label>
                      {isHostinger ? 'Email Account (username)' : 'SMTP Username'}
                      <input
                        type="text"
                        value={form.email?.smtpUser || ''}
                        onChange={(e) => updateField('email', 'smtpUser', e.target.value)}
                        placeholder={isHostinger ? 'you@yourdomain.com' : ''}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      {isHostinger ? 'Account Password' : 'SMTP Password'}
                      <input
                        type="password"
                        value={form.email?.smtpPassword || ''}
                        onChange={(e) => updateField('email', 'smtpPassword', e.target.value)}
                        placeholder={form.email?.smtpPasswordSet ? 'Leave blank to keep current' : 'Enter password'}
                        autoComplete="off"
                      />
                    </label>
                    <label className="checkbox-label communication-field-span-2">
                      <input
                        type="checkbox"
                        checked={form.email?.secure || false}
                        onChange={(e) => updateField('email', 'secure', e.target.checked)}
                      />
                      Use secure connection (TLS/SSL){isHostinger && ' — recommended for port 465'}
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SMS */}
        {activeTab === 'sms' && (
          <div id="comm-panel-sms" role="tabpanel" className="comm-panel">
            <div className="comm-panel-header" style={{ '--panel-color': '#059669', '--panel-color-muted': 'color-mix(in srgb, #059669 10%, var(--bg-surface))' }}>
              <div className="comm-panel-icon" style={{ background: 'color-mix(in srgb, #059669 14%, transparent)', color: '#059669', borderColor: 'color-mix(in srgb, #059669 28%, transparent)' }}>
                <Smartphone className="comm-panel-icon-svg" aria-hidden="true" />
              </div>
              <div className="comm-panel-header-text">
                <div className="comm-panel-title-row">
                  <h3 className="comm-panel-title">SMS Configuration</h3>
                  {smsNeedsAction ? (
                    <span className="comm-panel-badge comm-panel-badge--warn">Not configured</span>
                  ) : (
                    <span className="comm-panel-badge" style={{ background: 'color-mix(in srgb, #059669 12%, transparent)', color: '#059669', borderColor: 'color-mix(in srgb, #059669 28%, transparent)' }}>
                      {smsProviderLabel}
                    </span>
                  )}
                </div>
                <p className="comm-panel-desc">
                  Optional backup channel for login OTP when a user has a mobile number on file.
                </p>
              </div>
            </div>

            <div className="comm-panel-body config-form">
              <label>
                SMS Provider
                <select value={smsProvider} onChange={(e) => handleSmsProviderChange(e.target.value)}>
                  {SMS_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {!isCelcom && (
                <p className="communication-empty-state">
                  Select Celcom Africa to configure SMS credentials, check balance, and send test messages.
                </p>
              )}

              {isCelcom && (
                <div className="communication-sms-layout">
                  <div className="communication-sms-main config-form">
                    <p className="config-hint communication-sms-hint">
                      Retrieve credentials from your Celcom dashboard via{' '}
                      <strong>GET API KEY &amp; PARTNER ID</strong>.{' '}
                      <a href={CELCOM_AFRICA_SMS.DOCS_URL} target="_blank" rel="noopener noreferrer" className="communication-inline-link">
                        API documentation
                        <ExternalLink className="config-docs-link-icon" aria-hidden="true" />
                      </a>
                    </p>

                    <div className="communication-field-group communication-field-group--grid">
                      <label>
                        Partner ID
                        <input
                          type="text"
                          value={form.sms?.partnerId || ''}
                          onChange={(e) => updateField('sms', 'partnerId', e.target.value)}
                          placeholder="Your Celcom partner ID"
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        API Key
                        <input
                          type="password"
                          value={form.sms?.apiKey || ''}
                          onChange={(e) => updateField('sms', 'apiKey', e.target.value)}
                          placeholder={form.sms?.apiKeySet ? 'Leave blank to keep current' : 'Your Celcom API key'}
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Sender ID / Shortcode
                        <input
                          type="text"
                          value={form.sms?.senderId || ''}
                          onChange={(e) => updateField('sms', 'senderId', e.target.value)}
                          placeholder="INFOTEXT"
                          maxLength={11}
                        />
                      </label>
                      <label>
                        Message encoding (pass_type)
                        <select
                          value={form.sms?.passType || CELCOM_AFRICA_SMS.DEFAULT_PASS_TYPE}
                          onChange={(e) => updateField('sms', 'passType', e.target.value)}
                        >
                          <option value={CELCOM_AFRICA_SMS.PASS_TYPES.PLAIN}>plain — standard text</option>
                          <option value={CELCOM_AFRICA_SMS.PASS_TYPES.BM5}>bm5 — base64 encoded</option>
                        </select>
                      </label>
                      <label className="communication-field-span-2">
                        Send SMS API URL
                        <input
                          type="url"
                          value={form.sms?.apiUrl || CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS}
                          onChange={(e) => updateField('sms', 'apiUrl', e.target.value)}
                          placeholder={CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS}
                        />
                      </label>
                    </div>

                    <details className="config-advanced">
                      <summary>Reference endpoints (read-only)</summary>
                      <ul className="config-endpoint-list">
                        <li><span>Send SMS</span><code>{CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS}</code></li>
                        <li><span>Delivery reports</span><code>{CELCOM_AFRICA_SMS.ENDPOINTS.GET_DLR}</code></li>
                        <li><span>Account balance</span><code>{CELCOM_AFRICA_SMS.ENDPOINTS.GET_BALANCE}</code></li>
                      </ul>
                    </details>
                  </div>

                  <aside className="communication-sms-aside">
                    <div className="sms-balance-card">
                      <div className="sms-balance-header">
                        <span className="sms-balance-title">
                          <Wallet className="sms-balance-title-icon" aria-hidden="true" />
                          SMS account balance
                        </span>
                        <button
                          type="button"
                          className="sms-balance-refresh"
                          onClick={() => loadBalance()}
                          disabled={balanceLoading || !hasSavedCredentials}
                          aria-label="Refresh SMS balance"
                        >
                          <RefreshCw className={`sms-balance-refresh-icon${balanceLoading ? ' sms-balance-refresh-icon-spin' : ''}`} aria-hidden="true" />
                          Refresh
                        </button>
                      </div>
                      <p className={`sms-balance-value${balanceError ? ' sms-balance-value-muted' : ''}`}>
                        {balanceLoading && !balance && !balanceError
                          ? 'Loading balance…'
                          : balanceError || `${formatBalance(balance)} credits`}
                      </p>
                      {balanceUpdatedAt && !balanceError && (
                        <p className="sms-balance-meta">
                          Last updated {balanceUpdatedAt.toLocaleTimeString()}
                          {' · '}auto-refreshes every minute
                        </p>
                      )}
                    </div>

                    <div className="sms-test-panel">
                      <div className="sms-test-header">
                        <MessageSquare className="sms-test-title-icon" aria-hidden="true" />
                        <div>
                          <h4 className="sms-test-title">Send test SMS</h4>
                          <p className="config-hint" style={{ margin: '0.2rem 0 0' }}>
                            Save your SMS settings first, then verify delivery.
                          </p>
                        </div>
                      </div>
                      <label>
                        Test mobile number
                        <input type="tel" value={testMobile} onChange={(e) => setTestMobile(e.target.value)} placeholder="254710595755" />
                      </label>
                      <label>
                        Test message
                        <textarea rows={3} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder={DEFAULT_TEST_MESSAGE} />
                      </label>
                      <LoadingButton
                        type="button"
                        className="btn-secondary sms-test-button"
                        onClick={handleSendTestSms}
                        loading={testingSms}
                        loadingText="Sending..."
                        disabled={!hasSavedCredentials || saving}
                      >
                        Send test SMS
                      </LoadingButton>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Voice */}
        {activeTab === 'voice' && (
          <div id="comm-panel-voice" role="tabpanel" className="comm-panel">
            <div className="comm-panel-header" style={{ '--panel-color': '#ea580c', '--panel-color-muted': 'color-mix(in srgb, #ea580c 10%, var(--bg-surface))' }}>
              <div className="comm-panel-icon" style={{ background: 'color-mix(in srgb, #ea580c 14%, transparent)', color: '#ea580c', borderColor: 'color-mix(in srgb, #ea580c 28%, transparent)' }}>
                <PhoneCall className="comm-panel-icon-svg" aria-hidden="true" />
              </div>
              <div className="comm-panel-header-text">
                <div className="comm-panel-title-row">
                  <h3 className="comm-panel-title">Voice Configuration</h3>
                  {voiceNeedsAction ? (
                    <span className="comm-panel-badge comm-panel-badge--warn">No dialer selected</span>
                  ) : (
                    <span className="comm-panel-badge" style={{ background: 'color-mix(in srgb, #ea580c 12%, transparent)', color: '#ea580c', borderColor: 'color-mix(in srgb, #ea580c 28%, transparent)' }}>
                      Active: {activeDialerLabel}
                    </span>
                  )}
                </div>
                <p className="comm-panel-desc">
                  One dialer for the whole system — outbound and inbound for every call center use the same active
                  provider. Save, then place a test call to confirm it works. No automatic failover.
                </p>
              </div>
            </div>

            <div className="comm-panel-body config-form">
              {/* Active dialer selector */}
              <div className="comm-dialer-selector">
                <p className="comm-dialer-selector-label">Active dialer (all call centers)</p>
                <div className="comm-dialer-options">
                  {[
                    { value: '', label: 'None', sub: 'Agents cannot place calls' },
                    { value: 'yeastar', label: 'Yeastar P-Series', sub: 'PBX extension-based dialing' },
                    { value: 'africastalking', label: "Africa's Talking", sub: 'SIM bridge — inbound & outbound' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`comm-dialer-option${activeDialer === opt.value ? ' comm-dialer-option--active' : ''}`}
                      style={activeDialer === opt.value && opt.value ? { '--opt-color': '#ea580c', '--opt-muted': 'color-mix(in srgb, #ea580c 10%, var(--bg-surface))' } : {}}
                      onClick={() => { updateField('voice', 'activeProvider', opt.value); setVoiceTestHint(''); }}
                    >
                      <span className="comm-dialer-option-label">{opt.label}</span>
                      <span className="comm-dialer-option-sub">{opt.sub}</span>
                      {activeDialer === opt.value && (
                        <span className="comm-dialer-option-check" aria-hidden="true">✓</span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="config-hint" style={{ margin: '0.5rem 0 0' }}>
                  Applies to every call center for outbound portfolio calls and inbound CRM handling.
                  After switching, save settings and run a test call below.
                </p>
              </div>

              {/* Test call panel */}
              {activeDialer ? (
                <aside className="sms-test-panel" aria-label="Test voice call">
                  <div className="sms-test-header">
                    <PhoneCall className="sms-test-title-icon" aria-hidden="true" />
                    <div>
                      <h4 className="sms-test-title">Verify {activeDialerLabel}</h4>
                      <p className="config-hint" style={{ margin: '0.2rem 0 0' }}>
                        Place a test call after switching dialers so a broken provider is not left active for agents.
                      </p>
                    </div>
                  </div>
                  <div className="communication-field-group communication-field-group--grid">
                    <label>
                      {activeDialer === 'yeastar' ? 'Your Yeastar extension' : 'Agent phone (rings first)'}
                      <input
                        type="text"
                        value={testVoiceFrom}
                        onChange={(e) => setTestVoiceFrom(e.target.value)}
                        placeholder={activeDialer === 'yeastar' ? 'e.g. 1001' : '254710595755'}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Destination number
                      <input
                        type="text"
                        value={testVoiceTo}
                        onChange={(e) => setTestVoiceTo(e.target.value)}
                        placeholder="254710595755"
                        autoComplete="off"
                      />
                    </label>
                    <div className="communication-field-span-2" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <LoadingButton
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={handleSendTestVoice}
                        loading={testingVoice}
                        loadingText="Calling..."
                        disabled={saving || !testVoiceTo.trim()}
                      >
                        Place test call
                      </LoadingButton>
                      <span className="config-hint" style={{ margin: 0 }}>Save credentials &amp; active dialer first.</span>
                    </div>
                    {voiceTestHint && (
                      <p className="config-hint communication-field-span-2" role="status" style={{ margin: 0 }}>
                        {voiceTestHint}
                      </p>
                    )}
                  </div>
                </aside>
              ) : null}

              {/* Shared settings */}
              <div className="comm-voice-subsection">
                <h4 className="comm-voice-sub-title">General</h4>
                <div className="communication-field-group communication-field-group--grid">
                  <label className="communication-field-span-2">
                    App base URL (call popup)
                    <input
                      type="url"
                      value={form.voice?.appBaseUrl || ''}
                      onChange={(e) => updateField('voice', 'appBaseUrl', e.target.value)}
                      placeholder="https://app.example.com"
                      autoComplete="off"
                    />
                  </label>
                  <label className="checkbox-label communication-field-span-2">
                    <input
                      type="checkbox"
                      checked={form.voice?.recordCalls !== false}
                      onChange={(e) => updateField('voice', 'recordCalls', e.target.checked)}
                    />
                    Record calls when supported (Africa&apos;s Talking)
                  </label>
                </div>
              </div>

              {/* Yeastar credentials */}
              <div className="comm-voice-subsection">
                <h4 className="comm-voice-sub-title">Yeastar Open API credentials</h4>
                <p className="config-hint" style={{ margin: '0 0 0.75rem' }}>
                  Client ID / Secret from PBX → Integrations → API. Assign each agent a Yeastar extension under Users.
                </p>
                <div className="communication-field-group communication-field-group--grid">
                  <label>
                    PBX base URL
                    <input type="url" value={form.voice?.yeastar?.baseUrl || ''} onChange={(e) => updateYeastarField('baseUrl', e.target.value)} placeholder="https://xxx.yeastarcloud.com" autoComplete="off" />
                  </label>
                  <label>
                    API path
                    <input type="text" value={form.voice?.yeastar?.apiPath || 'openapi/v1.0'} onChange={(e) => updateYeastarField('apiPath', e.target.value)} placeholder="openapi/v1.0" autoComplete="off" />
                  </label>
                  <label>
                    Client ID
                    <input type="text" value={form.voice?.yeastar?.clientId || ''} onChange={(e) => updateYeastarField('clientId', e.target.value)} placeholder="OpenAPI Client ID" autoComplete="off" />
                  </label>
                  <label>
                    Client Secret
                    <input
                      type="password"
                      value={form.voice?.yeastar?.clientSecret || ''}
                      onChange={(e) => updateYeastarField('clientSecret', e.target.value)}
                      placeholder={form.voice?.yeastar?.clientSecretSet ? 'Leave blank to keep current' : 'OpenAPI Client Secret'}
                      autoComplete="off"
                    />
                  </label>
                  <label className="communication-field-span-2">
                    Integration API key (PBX → OMNICRM)
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="password"
                        style={{ flex: 1 }}
                        value={form.voice?.yeastar?.integrationApiKey || ''}
                        onChange={(e) => updateYeastarField('integrationApiKey', e.target.value)}
                        placeholder={form.voice?.yeastar?.integrationApiKeySet ? 'Leave blank to keep current' : 'Bearer token for Custom CRM APIs'}
                        autoComplete="off"
                      />
                      <button type="button" className="btn-icon-outline" onClick={generateIntegrationApiKey}>Generate</button>
                    </div>
                  </label>
                  <div className="communication-field-span-2" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-primary btn-sm" onClick={downloadYeastarTemplate}>
                      <ExternalLink className="icon-sm" />
                      Download Yeastar CRM template
                    </button>
                    <p className="config-hint" style={{ margin: 0, flex: '1 1 16rem' }}>
                      Import the XML under PBX → Integrations → CRM → Custom. Use the integration API key as Bearer auth.
                      Endpoints: <code>/api/integrations/yeastar/contacts/search</code>, <code>/calls/journal</code>, <code>/users</code>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Africa's Talking credentials */}
              <div className="comm-voice-subsection">
                <h4 className="comm-voice-sub-title">Africa&apos;s Talking credentials</h4>
                <p className="config-hint" style={{ margin: '0 0 0.75rem' }}>
                  Outbound + inbound SIM bridge when this is the active system dialer. Agents register SIMs under Profile → SIM Cards.
                </p>
                <div className="communication-field-group communication-field-group--grid">
                  <label>
                    Username
                    <input type="text" value={form.voice?.username || ''} onChange={(e) => updateField('voice', 'username', e.target.value)} placeholder="sandbox or app username" autoComplete="off" />
                  </label>
                  <label>
                    API Key
                    <input
                      type="password"
                      value={form.voice?.apiKey || ''}
                      onChange={(e) => updateField('voice', 'apiKey', e.target.value)}
                      placeholder={form.voice?.apiKeySet ? 'Leave blank to keep current' : "Africa's Talking API key"}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Voice number (callFrom)
                    <input type="text" value={form.voice?.voiceNumber || ''} onChange={(e) => updateField('voice', 'voiceNumber', e.target.value)} placeholder="2547XXXXXXXX" autoComplete="off" />
                  </label>
                  <label>
                    Callback base URL (API host)
                    <input type="url" value={form.voice?.callbackBaseUrl || ''} onChange={(e) => updateField('voice', 'callbackBaseUrl', e.target.value)} placeholder="https://your-api.example.com" autoComplete="off" />
                  </label>
                  <p className="config-hint communication-field-span-2">
                    AT callbacks:{' '}
                    <code>{(form.voice?.callbackBaseUrl || 'https://your-api.example.com').replace(/\/$/, '')}/api/webhooks/africastalking/voice</code>{' '}
                    and <code>/voice/events</code>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div id="comm-panel-notifications" role="tabpanel" className="comm-panel">
            <div className="comm-panel-header" style={{ '--panel-color': '#db2777', '--panel-color-muted': 'color-mix(in srgb, #db2777 10%, var(--bg-surface))' }}>
              <div className="comm-panel-icon" style={{ background: 'color-mix(in srgb, #db2777 14%, transparent)', color: '#db2777', borderColor: 'color-mix(in srgb, #db2777 28%, transparent)' }}>
                <Bell className="comm-panel-icon-svg" aria-hidden="true" />
              </div>
              <div className="comm-panel-header-text">
                <div className="comm-panel-title-row">
                  <h3 className="comm-panel-title">Notification Templates</h3>
                  <span className="comm-panel-badge" style={{ background: 'color-mix(in srgb, #db2777 12%, transparent)', color: '#db2777', borderColor: 'color-mix(in srgb, #db2777 28%, transparent)' }}>
                    System events
                  </span>
                </div>
                <p className="comm-panel-desc">
                  Choose templates for system-wide events. Leave as &ldquo;Built-in default&rdquo; to use the hardcoded message.
                  Edit templates under Communication → Channels → Email / SMS Templates.
                </p>
              </div>
            </div>

            <div className="comm-panel-body config-form">
              {/* Account deleted */}
              <div className="comm-notif-group">
                <div className="comm-notif-group-header">
                  <UserX className="comm-notif-group-icon" aria-hidden="true" />
                  <div>
                    <p className="comm-notif-group-title">Account Deleted</p>
                    <p className="comm-notif-group-desc">
                      Sent when a user account is removed from the system.
                    </p>
                  </div>
                </div>
                <div className="communication-field-group communication-field-group--grid">
                  <label>
                    Email template
                    <select
                      value={form.notifications?.accountDeletedEmailTemplateId || ''}
                      onChange={(e) => updateField('notifications', 'accountDeletedEmailTemplateId', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Built-in default</option>
                      {emailTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                    </select>
                  </label>
                  <label>
                    SMS template
                    <select
                      value={form.notifications?.accountDeletedSmsTemplateId || ''}
                      onChange={(e) => updateField('notifications', 'accountDeletedSmsTemplateId', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Built-in default</option>
                      {smsTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                    </select>
                  </label>
                </div>
                <p className="config-hint">
                  Variables: <code>{'{{first_name}}'}</code>, <code>{'{{name}}'}</code>,{' '}
                  <code>{'{{business_name}}'}</code>, <code>{'{{email}}'}</code>.
                </p>
              </div>

              {/* Case assignment */}
              <div className="comm-notif-group">
                <div className="comm-notif-group-header">
                  <UserCheck className="comm-notif-group-icon" aria-hidden="true" />
                  <div>
                    <p className="comm-notif-group-title">Case Assignment</p>
                    <p className="comm-notif-group-desc">
                      Sent to an agent when case files are assigned, reallocated, or unallocated.
                    </p>
                  </div>
                </div>
                <div className="communication-field-group communication-field-group--grid">
                  <label>
                    Email template
                    <select
                      value={form.notifications?.caseAssignmentEmailTemplateId || ''}
                      onChange={(e) => updateField('notifications', 'caseAssignmentEmailTemplateId', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Built-in default</option>
                      {emailTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                    </select>
                  </label>
                  <label>
                    SMS template
                    <select
                      value={form.notifications?.caseAssignmentSmsTemplateId || ''}
                      onChange={(e) => updateField('notifications', 'caseAssignmentSmsTemplateId', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Built-in default</option>
                      {smsTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                    </select>
                  </label>
                </div>
                <p className="config-hint">
                  Variables: <code>{'{{first_name}}'}</code>, <code>{'{{agent_name}}'}</code>,{' '}
                  <code>{'{{business_name}}'}</code>, <code>{'{{case_file_name}}'}</code>,{' '}
                  <code>{'{{case_count}}'}</code>, <code>{'{{performer_name}}'}</code>,{' '}
                  <code>{'{{action_label}}'}</code>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky save footer ── */}
      <div className="comm-save-bar">
        <p className="comm-save-bar-note">
          Changes apply to all users and call centers immediately after saving.
        </p>
        <LoadingButton className="btn-primary" onClick={handleSave} loading={saving} loadingText="Saving...">
          Save Changes
        </LoadingButton>
      </div>
    </div>
  );
}

export default CommunicationIntegration;
