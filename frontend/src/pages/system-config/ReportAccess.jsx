import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import {
  clearReportPassword,
  fetchReportAccessSettings,
  setReportPassword,
} from '../../api/reports';
import { reports } from '../../routes/reportRegistry';

function ReportAccessRow({ report, passwordSet, onUpdated }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!password.trim()) {
      toast.error('Enter a password');
      return;
    }
    setSaving(true);
    try {
      await setReportPassword(report.slug, password);
      setPassword('');
      toast.success(`Password set for ${report.label}`);
      onUpdated();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to set password');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearReportPassword(report.slug);
      toast.success(`Password removed for ${report.label}`);
      onUpdated();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove password');
    } finally {
      setClearing(false);
    }
  };

  return (
    <tr>
      <td>{report.label}</td>
      <td>{passwordSet ? 'Protected' : 'Open (RBAC only)'}</td>
      <td>
        <form className="report-access-form" onSubmit={handleSave}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordSet ? 'New password' : 'Set password'}
            autoComplete="new-password"
          />
          <LoadingButton
            type="submit"
            className="btn-primary btn-inline"
            loading={saving}
            loadingText="Saving..."
          >
            {passwordSet ? 'Update' : 'Protect'}
          </LoadingButton>
          {passwordSet && (
            <LoadingButton
              type="button"
              className="btn-danger-sm"
              onClick={handleClear}
              loading={clearing}
              loadingText="Removing..."
            >
              Remove
            </LoadingButton>
          )}
        </form>
      </td>
    </tr>
  );
}

function ReportAccess() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSettings = () => {
    setLoading(true);
    fetchReportAccessSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load report access settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const passwordMap = Object.fromEntries(settings.map((item) => [item.slug, item.passwordSet]));

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <h2>Report Access</h2>
      </div>
      <p className="reports-placeholder report-access-intro">
        Set optional passwords on individual reports. Users still need the correct role permission
        (Read on the report in Access Levels) before they can unlock a protected report.
      </p>

      {loading ? (
        <p className="reports-placeholder">Loading…</p>
      ) : (
        <div className="report-access-table-wrap">
          <table className="report-access-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Status</th>
                <th>Password</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <ReportAccessRow
                  key={report.slug}
                  report={report}
                  passwordSet={Boolean(passwordMap[report.slug])}
                  onUpdated={loadSettings}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ReportAccess;
