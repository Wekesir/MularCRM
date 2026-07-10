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
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  Timer,
} from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { fetchBackupStatus, runBackupNow } from '../../api/backup';
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
    serviceAccountKey: '',
    serviceAccountKeySet: false,
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

function StatusBadge({ ok, running }) {
  if (running) {
    return (
      <span className="bk-badge bk-badge--running">
        <Loader2 className="icon-sm bk-spin" aria-hidden="true" />
        Running
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
            serviceAccountKey: form.googleDrive.serviceAccountKey || '',
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
      toast.success(result.message || 'Backup completed');
      await refreshStatus(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Backup failed');
      await refreshStatus(true);
    } finally {
      setRunning(false);
    }
  };

  const lastRun = status?.lastRun;
  const cron = status?.cron;
  const keyPlaceholder = form.googleDrive?.serviceAccountKeySet
    ? 'Leave blank to keep the current service account key'
    : 'Paste the full Google service account JSON key here…';

  return (
    <div className="space-y-6 min-h-[50vh]">
      {/* ── Status card ────────────────────────────────────── */}
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
                  <StatusBadge ok={lastRun?.ok} running={lastRun?.running} />
                </div>
                <p className="bk-status-card-desc">
                  {statusLoading ? 'Loading…' : (lastRun?.message || 'No backup has run yet')}
                </p>
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
              <LoadingButton
                type="button"
                className="btn-primary btn-sm"
                loading={running}
                loadingText="Backing up…"
                onClick={handleRunNow}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Run now
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

      {/* ── Settings form ──────────────────────────────────── */}
      <form className="config-form" onSubmit={handleSave}>
        {/* Schedule section */}
        <div className="config-form-section">
          <h3 className="config-form-section-title">
            <Clock className="icon-sm" aria-hidden="true" />
            Schedule
          </h3>

          {/* Enable toggle */}
          <div className="bk-enable-row">
            <div className="bk-enable-row-text">
              <p className="bk-enable-row-label">Enable automatic backups</p>
              <p className="bk-enable-row-hint">
                Runs <code>mysqldump</code> on the selected schedule and uploads to Google Drive.
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

          {/* Frequency cards */}
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

        {/* Google Drive section */}
        <div className="config-form-section">
          <div className="bk-section-hd">
            <h3 className="config-form-section-title">
              <Cloud className="icon-sm" aria-hidden="true" />
              Google Drive
            </h3>
            <a
              href="https://console.cloud.google.com/iam-admin/serviceaccounts"
              target="_blank"
              rel="noopener noreferrer"
              className="bk-ext-link"
            >
              Open GCP Console ↗
            </a>
          </div>

          {/* Setup steps */}
          <div className="bk-setup-steps">
            <div className="bk-setup-step">
              <span className="bk-setup-num">1</span>
              <span>
                Create a <strong>service account</strong> in GCP and enable the{' '}
                <strong>Google Drive API</strong>.
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">2</span>
              <span>
                Download a JSON key and share your Drive folder with the service account email as{' '}
                <strong>Editor</strong>.
              </span>
            </div>
            <div className="bk-setup-step">
              <span className="bk-setup-num">3</span>
              <span>
                Copy the folder ID from the Drive URL:{' '}
                <code>
                  .../folders/<strong>FOLDER_ID</strong>
                </code>
                .
              </span>
            </div>
          </div>

          {/* Folder ID + service email */}
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

          {/* JSON key */}
          <label className="bk-field">
            <span className="bk-field-label">
              <KeyRound className="icon-sm" aria-hidden="true" />
              Service Account JSON Key
            </span>
            <textarea
              rows={7}
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
