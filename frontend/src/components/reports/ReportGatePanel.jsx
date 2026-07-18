import { useState } from 'react';
import { Lock, ShieldX } from 'lucide-react';

function ReportGatePanel({ gate, unlocking, onUnlock }) {
  const [password, setPassword] = useState('');

  if (!gate) return null;

  if (!gate.canRead) {
    return (
      <div className="empty-state-card report-gate">
        <div className="report-gate-icon report-gate-icon-denied">
          <ShieldX className="report-gate-icon-svg" />
        </div>
        <h2 className="report-gate-title">Access denied</h2>
        <p className="report-gate-description">
          You do not have permission to view this report. Contact an administrator if you need access.
        </p>
      </div>
    );
  }

  if (gate.requiresPassword && !gate.unlocked) {
    return (
      <div className="empty-state-card report-gate">
        <div className="report-gate-icon">
          <Lock className="report-gate-icon-svg" />
        </div>
        <h2 className="report-gate-title">Password required</h2>
        <p className="report-gate-description">
          This report is password-protected. Enter the report password to continue.
        </p>
        <form
          className="report-gate-form space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock?.(password);
          }}
        >
          <label className="rpt-field">
            <span className="rpt-field-label">Report password</span>
            <input
              type="password"
              className="rpt-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn-primary btn-sm" disabled={unlocking || !password}>
            {unlocking ? 'Unlocking…' : 'Unlock report'}
          </button>
        </form>
      </div>
    );
  }

  return null;
}

export default ReportGatePanel;
