import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Mail,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { fetchSmsBalance, sendTestSms } from '../../api/systemConfig';
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

function CommunicationIntegration() {
  const { config, loadConfig, updateConfig } = useSystemConfig();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState('');
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState(null);
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState(DEFAULT_TEST_MESSAGE);
  const [testingSms, setTestingSms] = useState(false);

  useEffect(() => {
    loadConfig()
      .then(setForm)
      .catch(() => toast.error('Failed to load configuration'));
  }, [loadConfig]);

  const smsProvider = form.sms?.provider || '';
  const isCelcom = smsProvider === CELCOM_AFRICA_SMS.PROVIDER_ID;
  const hasSavedCredentials =
    isCelcom && Boolean(form.sms?.partnerId) && Boolean(form.sms?.apiKeySet);

  const loadBalance = useCallback(async (silent = false) => {
    if (!isCelcom) {
      setBalance(null);
      setBalanceError('');
      return;
    }

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

  useEffect(() => {
    loadBalance(true);
  }, [loadBalance]);

  useEffect(() => {
    if (!isCelcom || !hasSavedCredentials) return undefined;

    const timer = window.setInterval(() => loadBalance(true), BALANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hasSavedCredentials, isCelcom, loadBalance]);

  const updateField = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const handleEmailProviderChange = (provider) => {
    setForm((prev) => {
      const email = { ...prev.email, provider };

      // Pre-fill Hostinger's standard outgoing settings the first time it's selected.
      if (provider === 'hostinger') {
        email.smtpHost = prev.email?.smtpHost || HOSTINGER_DEFAULTS.smtpHost;
        email.smtpPort = prev.email?.smtpPort || HOSTINGER_DEFAULTS.smtpPort;
        if (prev.email?.secure === undefined || prev.email?.secure === null) {
          email.secure = HOSTINGER_DEFAULTS.secure;
        }
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
        apiUrl:
          provider === CELCOM_AFRICA_SMS.PROVIDER_ID
            ? prev.sms?.apiUrl || CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS
            : prev.sms?.apiUrl || '',
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateConfig({
        email: form.email,
        sms: form.sms,
      });
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
    if (!testMobile.trim()) {
      toast.error('Enter a mobile number for the test SMS');
      return;
    }

    setTestingSms(true);
    try {
      const result = await sendTestSms({
        mobile: testMobile.trim(),
        message: testMessage.trim() || undefined,
      });
      toast.success(result.message || 'Test SMS sent');
      await loadBalance(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send test SMS');
    } finally {
      setTestingSms(false);
    }
  };

  const emailProvider = form.email?.provider || 'resend';
  const emailProviderLabel = EMAIL_PROVIDER_LABELS[emailProvider] || 'Resend';
  const isSmtpLike = emailProvider === 'smtp' || emailProvider === 'hostinger';
  const isHostinger = emailProvider === 'hostinger';
  const smsProviderLabel =
    SMS_PROVIDER_OPTIONS.find((option) => option.value === smsProvider)?.label || 'Not configured';

  const formatBalance = (value) => {
    if (value === null || value === undefined) return '—';
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return String(value);
  };

  return (
    <div className="config-panel communication-panel">
      <div className="communication-sections">
        <section className="communication-section communication-section--email" aria-labelledby="comm-email-title">
          <header className="communication-section-header">
            <div className="communication-section-icon communication-section-icon--email" aria-hidden="true">
              <Mail />
            </div>
            <div className="communication-section-heading">
              <div className="communication-section-title-row">
                <h3 id="comm-email-title">Email</h3>
                <span className="communication-section-badge communication-section-badge--email">
                  {emailProviderLabel}
                </span>
              </div>
              <p className="communication-section-desc">
                Used for login OTP codes, password reset links, and system notifications.
              </p>
            </div>
          </header>

          <div className="communication-section-body config-form communication-form-grid communication-form-grid--email">
            <label>
              Email Provider
              <select
                value={emailProvider}
                onChange={(e) => handleEmailProviderChange(e.target.value)}
              >
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
                  placeholder={
                    form.email?.resendApiKeySet ? 'Leave blank to keep current' : 're_...'
                  }
                />
              </label>
            )}

            {isSmtpLike && (
              <div className="communication-field-group communication-field-group--grid communication-field-span-2">
                {isHostinger && (
                  <p className="config-hint communication-field-span-2">
                    Using Hostinger&apos;s outgoing mail server. Enter the email account&apos;s full
                    address and password below — you can switch accounts anytime by changing these
                    credentials.
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
                    placeholder={
                      form.email?.smtpPasswordSet ? 'Leave blank to keep current' : 'Enter password'
                    }
                    autoComplete="off"
                  />
                </label>
                <label className="checkbox-label communication-field-span-2">
                  <input
                    type="checkbox"
                    checked={form.email?.secure || false}
                    onChange={(e) => updateField('email', 'secure', e.target.checked)}
                  />
                  Use secure connection (TLS/SSL)
                  {isHostinger && ' — recommended for port 465'}
                </label>
              </div>
            )}
          </div>
        </section>

        <section className="communication-section communication-section--sms" aria-labelledby="comm-sms-title">
          <header className="communication-section-header">
            <div className="communication-section-icon communication-section-icon--sms" aria-hidden="true">
              <Smartphone />
            </div>
            <div className="communication-section-heading">
              <div className="communication-section-title-row">
                <h3 id="comm-sms-title">SMS</h3>
                <span
                  className={`communication-section-badge communication-section-badge--sms${
                    isCelcom ? '' : ' communication-section-badge--muted'
                  }`}
                >
                  {smsProviderLabel}
                </span>
              </div>
              <p className="communication-section-desc">
                Optional backup channel for login OTP when a user has a mobile number on file.
              </p>
            </div>
          </header>

          <div className="communication-section-body config-form">
            <label>
              SMS Provider
              <select
                value={smsProvider}
                onChange={(e) => handleSmsProviderChange(e.target.value)}
              >
                {SMS_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {!isCelcom && (
              <p className="communication-empty-state">
                Select Celcom Africa to configure SMS credentials, check balance, and send test
                messages.
              </p>
            )}

            {isCelcom && (
              <div className="communication-sms-layout">
                <div className="communication-sms-main config-form">
                  <p className="config-hint communication-sms-hint">
                    Retrieve credentials from your Celcom dashboard via{' '}
                    <strong>GET API KEY &amp; PARTNER ID</strong>.{' '}
                    <a
                      href={CELCOM_AFRICA_SMS.DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="communication-inline-link"
                    >
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
                        placeholder={
                          form.sms?.apiKeySet ? 'Leave blank to keep current' : 'Your Celcom API key'
                        }
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
                      <li>
                        <span>Send SMS</span>
                        <code>{CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS}</code>
                      </li>
                      <li>
                        <span>Delivery reports</span>
                        <code>{CELCOM_AFRICA_SMS.ENDPOINTS.GET_DLR}</code>
                      </li>
                      <li>
                        <span>Account balance</span>
                        <code>{CELCOM_AFRICA_SMS.ENDPOINTS.GET_BALANCE}</code>
                      </li>
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
                        <RefreshCw
                          className={`sms-balance-refresh-icon${balanceLoading ? ' sms-balance-refresh-icon-spin' : ''}`}
                          aria-hidden="true"
                        />
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
                        {' · '}
                        auto-refreshes every minute
                      </p>
                    )}
                  </div>

                  <div className="sms-test-panel">
                    <h4 className="sms-test-title">
                      <MessageSquare className="sms-test-title-icon" aria-hidden="true" />
                      Send test SMS
                    </h4>
                    <p className="config-hint">
                      Save your SMS settings first, then send a test message to verify delivery.
                    </p>
                    <label>
                      Test mobile number
                      <input
                        type="tel"
                        value={testMobile}
                        onChange={(e) => setTestMobile(e.target.value)}
                        placeholder="254710595755"
                      />
                    </label>
                    <label>
                      Test message
                      <textarea
                        rows={3}
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        placeholder={DEFAULT_TEST_MESSAGE}
                      />
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
        </section>
      </div>

      <div className="communication-footer">
        <p className="communication-footer-note">
          Changes apply to all users after saving. Email is required for login; SMS is optional.
        </p>
        <LoadingButton
          className="btn-primary"
          onClick={handleSave}
          loading={saving}
          loadingText="Saving..."
        >
          Save Changes
        </LoadingButton>
      </div>
    </div>
  );
}

export default CommunicationIntegration;
