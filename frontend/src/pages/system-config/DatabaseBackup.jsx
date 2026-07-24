import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  FileText,
  FolderOpen,
  Hourglass,
  KeyRound,
  Link2,
  Link2Off,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Shield,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import {
  clearPendingBackup,
  disconnectBackupGoogle,
  fetchBackupGoogleAuthUrl,
  fetchBackupStatus,
  runBackupNow,
} from '../../api/backup';
import { useSystemConfig } from '../../context/SystemConfigContext';

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily', hint: 'Every day at 02:00', icon: Clock },
  { value: 'weekly', label: 'Weekly', hint: 'Every Sunday at 02:00', icon: Timer },
  { value: 'monthly', label: 'Monthly', hint: '1st of month at 02:00', icon: Database },
];

const EMPTY_BACKUP = {
  enabled: false,
  frequency: 'daily',
  googleDrive: {
    folderId: '',
    serviceAccountEmail: '',
    ownerEmail: '',
    serviceAccountKey: '',
    serviceAccountKeySet: false,
    oauthClientId: '',
    oauthClientSecret: '',
    oauthClientSecretSet: false,
    oauthRefreshTokenSet: false,
    oauthConnectedEmail: '',
  },
};

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

function StatusBadge({ ok, running, awaitingOwnership }) {
  if (running) {
    return (
      <span className="bk-badge bk-badge--running">
        <Loader2 className="icon-sm bk-spin" aria-hidden="true" />
        Running
      </span>
    );
  }
  if (awaitingOwnership) {
    return (
      <span className="bk-badge bk-badge--awaiting">
        <Hourglass className="icon-sm" aria-hidden="true" />
        Awaiting ownership
      </span>
    );
  }
  if (ok === true) {
    return (
      <span className="bk-badge bk-badge--success">
        <CheckCircle2 className="icon-sm" aria-hidden="true" />
        Success
      </span>
    );
  }
  if (ok === false) {
    return (
      <span className="bk-badge bk-badge--failed">
        <AlertCircle className="icon-sm" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return <span className="bk-badge bk-badge--idle">No runs yet</span>;
}

function DatabaseBackup() {
  const { loadConfig, updateConfig } = useSystemConfig();
  const [form, setForm] = useState(EMPTY_BACKUP);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const refreshStatus = useCallback(async (silent = false) => {
    if (!silent) setStatusLoading(true);
    try {
      const data = await fetchBackupStatus();
      setStatus(data);
    } catch (error) {
      if (!silent) {
        toast.error(error.response?.data?.message || 'Failed to load backup status');
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig()
      .then((config) => {
        setForm({
          ...EMPTY_BACKUP,
          ...(config.backup || {}),
          googleDrive: {
            ...EMPTY_BACKUP.googleDrive,
            ...(config.backup?.googleDrive || {}),
          },
        });
      })
      .catch(() => toast.error('Failed to load configuration'));
    refreshStatus();
  }, [loadConfig, refreshStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    if (!google) return;

    if (google === 'connected') {
      toast.success('Google account connected — ownership will auto-accept on backups.');
      refreshStatus(true);
      loadConfig()
        .then((config) => {
          setForm({
            ...EMPTY_BACKUP,
            ...(config.backup || {}),
            googleDrive: {
              ...EMPTY_BACKUP.googleDrive,
              ...(config.backup?.googleDrive || {}),
            },
          });
        })
        .catch(() => {});
    } else if (google === 'error') {
      toast.error(params.get('message') || 'Google connection failed');
    }

    params.delete('google');
    params.delete('message');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [loadConfig, refreshStatus]);

  const updateBackup = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const updateDrive = (patch) =>
    setForm((prev) => ({ ...prev, googleDrive: { ...prev.googleDrive, ...patch } }));

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        backup: {
          enabled: Boolean(form.enabled),
          frequency: form.frequency || 'daily',
          googleDrive: {
            folderId: form.googleDrive.folderId?.trim() || '',
            serviceAccountEmail: form.googleDrive.serviceAccountEmail?.trim() || '',
            ownerEmail: form.googleDrive.ownerEmail?.trim() || '',
            serviceAccountKey: form.googleDrive.serviceAccountKey || '',
            oauthClientId: form.googleDrive.oauthClientId?.trim() || '',
            oauthClientSecret: form.googleDrive.oauthClientSecret || '',
          },
        },
      };
      const saved = await updateConfig(payload);
      setForm({
        ...EMPTY_BACKUP,
        ...(saved.backup || {}),
        googleDrive: {
          ...EMPTY_BACKUP.googleDrive,
          ...(saved.backup?.googleDrive || {}),
          serviceAccountKey: '',
          oauthClientSecret: '',
        },
      });
      toast.success('Backup settings saved');
      await refreshStatus(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save backup settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await runBackupNow();
      if (result.awaitingOwnership) {
        toast.info(result.message || 'Accept ownership in Drive, then complete the upload.');
      } else {
        toast.success(result.message || 'Backup completed');
      }
      await refreshStatus(true);
    } catch (error) {
      const data = error.response?.data;
      if (data?.awaitingOwnership || data?.lastRun?.awaitingOwnership) {
        toast.info(data?.message || 'Accept ownership in Drive, then complete the upload.');
      } else {
        toast.error(data?.message || 'Backup failed');
      }
      await refreshStatus(true);
    } finally {
      setRunning(false);
    }
  };

  const handleDiscardPending = async () => {
    setDiscarding(true);
    try {
      const result = await clearPendingBackup();
      toast.success(result.message || 'Pending backup discarded');
      await refreshStatus(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to discard pending backup');
      await refreshStatus(true);
    } finally {
      setDiscarding(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnecting(true);
    try {
      // Persist OAuth client fields first so the auth-url endpoint can use them.
      await updateConfig({
        backup: {
          googleDrive: {
            folderId: form.googleDrive.folderId?.trim() || '',
            ownerEmail: form.googleDrive.ownerEmail?.trim() || '',
            oauthClientId: form.googleDrive.oauthClientId?.trim() || '',
            oauthClientSecret: form.googleDrive.oauthClientSecret || '',
            serviceAccountEmail: form.googleDrive.serviceAccountEmail?.trim() || '',
            serviceAccountKey: form.googleDrive.serviceAccountKey || '',
          },
        },
      });
      const { url } = await fetchBackupGoogleAuthUrl();
      window.location.href = url;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start Google connection');
      setConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      await disconnectBackupGoogle();
      toast.success('Google account disconnected');
      await refreshStatus(true);
      const config = await loadConfig();
      setForm({
        ...EMPTY_BACKUP,
        ...(config.backup || {}),
        googleDrive: {
          ...EMPTY_BACKUP.googleDrive,
          ...(config.backup?.googleDrive || {}),
          serviceAccountKey: '',
          oauthClientSecret: '',
        },
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to disconnect Google account');
    } finally {
      setDisconnecting(false);
    }
  };

  const lastRun = status?.lastRun;
  const cron = status?.cron;
  const oauth = status?.oauth;
  const awaitingOwnership = Boolean(lastRun?.awaitingOwnership);
  const oauthConnected = Boolean(oauth?.connected || form.googleDrive?.oauthRefreshTokenSet);
  const keyPlaceholder = form.googleDrive?.serviceAccountKeySet
    ? 'Leave blank to keep the current service account key'
    : 'Paste the full Google service account JSON key here…';
  const oauthSecretPlaceholder = form.googleDrive?.oauthClientSecretSet
    ? 'Leave blank to keep the current OAuth client secret'
    : 'OAuth client secret from Google Cloud Console';

  return (
    <div className="space-y-6 min-h-[50vh]">
      <div className="bk-status-card">
        <div className="bk-status-card-body">
          <div className="bk-status-card-top">
            <div className="bk-status-card-left">
              <span className="bk-status-card-icon">
                <Database className="icon-md" aria-hidden="true" />
              </span>
              <div>
                <div className="bk-status-card-title-row">
                  <p className="bk-status-card-title">Last Backup</p>
                  <StatusBadge
                    ok={lastRun?.ok}
                    running={lastRun?.running}
                    awaitingOwnership={awaitingOwnership && !oauthConnected}
                  />
                </div>
                <p className="bk-status-card-desc">
                  {statusLoading ? 'Loading…' : (lastRun?.message || 'No backup has run yet')}
                </p>
                {awaitingOwnership && !oauthConnected && (
                  <p className="bk-status-card-desc" style={{ marginTop: '0.35rem' }}>
                    Connect Google below to auto-accept ownership, or search Drive for{' '}
                    <code>pendingowner:me</code> and accept manually, then complete the upload.
                    Or discard this pending file to start a new backup.
                  </p>
                )}
                {oauthConnected && (
                  <p className="bk-status-card-desc" style={{ marginTop: '0.35rem' }}>
                    Owner connected as{' '}
                    <strong>{oauth?.connectedEmail || form.googleDrive.oauthConnectedEmail}</strong>
                    — ownership auto-accepts for automated backups.
                  </p>
                )}
              </div>
            </div>
            <div className="bk-status-card-actions">
              <button
                type="button"
                className="btn-icon-outline"
                aria-label="Refresh backup status"
                onClick={() => refreshStatus()}
                disabled={statusLoading}
              >
                <RefreshCw
                  className={`icon-sm${statusLoading ? ' bk-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {awaitingOwnership && (
                <LoadingButton
                  type="button"
                  className="btn-danger-sm"
                  loading={discarding}
                  loadingText="Discarding…"
                  onClick={handleDiscardPending}
                >
                  <Trash2 className="icon-sm" aria-hidden="true" />
                  Discard pending
                </LoadingButton>
              )}
              <LoadingButton
                type="button"
                className="btn-primary btn-sm"
                loading={running}
                loadingText={awaitingOwnership && !oauthConnected ? 'Uploading…' : 'Backing up…'}
                onClick={handleRunNow}
              >
                {awaitingOwnership && !oauthConnected ? (
                  <Upload className="icon-sm" aria-hidden="true" />
                ) : (
                  <Play className="icon-sm" aria-hidden="true" />
                )}
                {awaitingOwnership && !oauthConnected ? 'Complete upload' : 'Run now'}
              </LoadingButton>
            </div>
          </div>

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
                <FileText className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value bk-stat-filename">{lastRun?.fileName || '—'}</p>
                <p className="bk-stat-tile-label">File</p>
              </div>
            </div>
            <div className="bk-stat-tile">
              <span className="bk-stat-tile-icon">
                <CalendarClock className="icon-sm" aria-hidden="true" />
              </span>
              <div>
                <p className="bk-stat-tile-value">
                  {cron?.scheduled ? `${cron.frequency} · ${cron.timezone}` : 'Not scheduled'}
                </p>
                <p className="bk-stat-tile-label">Schedule</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form className="config-form" onSubmit={handleSave}>
        <div className="config-form-section">
          <h3 className="config-form-section-title">
            <Clock className="icon-sm" aria-hidden="true" />
            Schedule
          </h3>

          <div className="bk-enable-row">
            <div className="bk-enable-row-text">
              <p className="bk-enable-row-label">Enable automatic backups</p>
              <p className="bk-enable-row-hint">
                Runs a MySQL dump on the selected schedule and uploads to Google Drive. Connect the
                owner Google account once so cron can auto-accept ownership.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(form.enabled)}
              className={`bk-toggle${form.enabled ? ' bk-toggle--on' : ''}`}
              onClick={() => updateBackup({ enabled: !form.enabled })}
            >
              <span className="bk-toggle-thumb" />
              <span className="sr-only">
                {form.enabled ? 'Disable' : 'Enable'} automatic backups
              </span>
            </button>
          </div>

          <div>
            <p className="bk-freq-label">Backup frequency</p>
            <div className="bk-freq-grid">
              {FREQUENCY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = form.frequency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`bk-freq-card${selected ? ' bk-freq-card--selected' : ''}`}
                    onClick={() => updateBackup({ frequency: opt.value })}
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

        <div className="config-form-section">
          <div className="bk-section-hd">
            <h3 className="config-form-section-title">
              <Cloud className="icon-sm" aria-hidden="true" />
              Google Drive
            </h3>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="bk-ext-link"
            >
              Open GCP Credentials ↗
            </a>
          </div>

          <div className="bk-setup-steps">
            <div className="bk-setup-step">
              <span className="bk-setup-num">1</span>
              <span>
                Create a <strong>service account</strong>, enable <strong>Google Drive API</strong>,
                and share your Drive folder with it as <strong>Editor</strong>.
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">2</span>
              <span>
                Create an OAuth <strong>Web application</strong> client and add this redirect URI:{' '}
                <code>{oauth?.redirectUri || 'http://localhost:3000/api/backup/google/callback'}</code>
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">3</span>
              <span>
                Paste folder ID, owner Gmail, service account JSON, and OAuth client ID/secret below.
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">4</span>
              <span>
                Click <strong>Connect Google account</strong> once — OMNICRM will auto-accept
                ownership for every backup (including cron).
              </span>
            </div>
          </div>

          <div className="bk-drive-fields">
            <label className="bk-field">
              <span className="bk-field-label">
                <FolderOpen className="icon-sm" aria-hidden="true" />
                Drive Folder ID
              </span>
              <input
                type="text"
                value={form.googleDrive.folderId || ''}
                onChange={(e) => updateDrive({ folderId: e.target.value })}
                placeholder="1AbCDefGhijKLmnopQRstuVWxyz"
                autoComplete="off"
              />
            </label>

            <label className="bk-field">
              <span className="bk-field-label">
                <Mail className="icon-sm" aria-hidden="true" />
                Backup Owner Gmail
              </span>
              <input
                type="email"
                value={form.googleDrive.ownerEmail || ''}
                onChange={(e) => updateDrive({ ownerEmail: e.target.value })}
                placeholder="kenwekesir@gmail.com"
                autoComplete="off"
                required
              />
              <span className="auth-field-hint">
                Must match the Google account you connect for auto-accept.
              </span>
            </label>

            <label className="bk-field">
              <span className="bk-field-label">
                <KeyRound className="icon-sm" aria-hidden="true" />
                Service Account Email
              </span>
              <input
                type="email"
                value={form.googleDrive.serviceAccountEmail || ''}
                onChange={(e) => updateDrive({ serviceAccountEmail: e.target.value })}
                placeholder="backup-bot@project.iam.gserviceaccount.com"
                autoComplete="off"
              />
              <span className="auth-field-hint">Auto-filled from the JSON key on save.</span>
            </label>
          </div>

          <label className="bk-field">
            <span className="bk-field-label">
              <KeyRound className="icon-sm" aria-hidden="true" />
              Service Account JSON Key
            </span>
            <textarea
              rows={6}
              value={form.googleDrive.serviceAccountKey || ''}
              onChange={(e) => updateDrive({ serviceAccountKey: e.target.value })}
              placeholder={keyPlaceholder}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="bk-key-footer">
              <span className="bk-key-security">
                <Shield className="icon-sm" aria-hidden="true" />
                Stored encrypted — never returned to the browser after save.
              </span>
              {form.googleDrive.serviceAccountKeySet && (
                <span className="bk-key-set-badge">
                  <CheckCircle2 className="icon-sm" aria-hidden="true" />
                  Key saved
                </span>
              )}
            </div>
          </label>

          <div className="bk-drive-fields" style={{ marginTop: '1rem' }}>
            <label className="bk-field">
              <span className="bk-field-label">
                <KeyRound className="icon-sm" aria-hidden="true" />
                OAuth Client ID
              </span>
              <input
                type="text"
                value={form.googleDrive.oauthClientId || ''}
                onChange={(e) => updateDrive({ oauthClientId: e.target.value })}
                placeholder="xxxxx.apps.googleusercontent.com"
                autoComplete="off"
              />
            </label>

            <label className="bk-field">
              <span className="bk-field-label">
                <KeyRound className="icon-sm" aria-hidden="true" />
                OAuth Client Secret
              </span>
              <input
                type="password"
                value={form.googleDrive.oauthClientSecret || ''}
                onChange={(e) => updateDrive({ oauthClientSecret: e.target.value })}
                placeholder={oauthSecretPlaceholder}
                autoComplete="off"
              />
              {form.googleDrive.oauthClientSecretSet && (
                <span className="auth-field-hint">Secret saved — leave blank to keep it.</span>
              )}
            </label>
          </div>

          <div className="bk-enable-row" style={{ marginTop: '1rem' }}>
            <div className="bk-enable-row-text">
              <p className="bk-enable-row-label">Owner Google account</p>
              <p className="bk-enable-row-hint">
                {oauthConnected
                  ? `Connected as ${oauth?.connectedEmail || form.googleDrive.oauthConnectedEmail}. Backups auto-accept ownership and upload in one step.`
                  : 'One-time consent so OMNICRM can auto-accept ownership for every backup file.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {oauthConnected ? (
                <LoadingButton
                  type="button"
                  className="btn-icon-outline"
                  loading={disconnecting}
                  loadingText="Disconnecting…"
                  onClick={handleDisconnectGoogle}
                >
                  <Link2Off className="icon-sm" aria-hidden="true" />
                  Disconnect
                </LoadingButton>
              ) : (
                <LoadingButton
                  type="button"
                  className="btn-primary btn-sm"
                  loading={connecting}
                  loadingText="Redirecting…"
                  onClick={handleConnectGoogle}
                >
                  <Link2 className="icon-sm" aria-hidden="true" />
                  Connect Google account
                </LoadingButton>
              )}
            </div>
          </div>
        </div>

        <div className="config-form-actions">
          <LoadingButton
            type="submit"
            className="btn-primary btn-sm"
            loading={saving}
            loadingText="Saving…"
          >
            Save backup settings
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

export default DatabaseBackup;
