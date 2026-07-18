import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { useUser } from '../../context/UserContext';

function ChangePasswordTab() {
  const { changePassword } = useUser();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const success = await changePassword(form);
      if (success) {
        setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-password-panel">
      <div className="profile-password-card">
        <div className="auth-panel-header">
          <span className="auth-panel-badge">
            <KeyRound className="auth-panel-badge-icon" aria-hidden="true" />
            Security
          </span>
          <h2 className="auth-title">Change password</h2>
          <p className="auth-description">
            Choose a strong password you have not used on this account before.
          </p>
        </div>

        <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
          <AuthFormField
            id="profile-current-password"
            label="Current password"
            type="password"
            icon={Lock}
            value={form.currentPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            autoComplete="current-password"
            placeholder="Enter your current password"
            required
          />
          <AuthFormField
            id="profile-new-password"
            label="New password"
            type="password"
            icon={Lock}
            value={form.newPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            hint="Use 8+ characters with a mix of letters and numbers."
            required
          />
          <AuthFormField
            id="profile-confirm-password"
            label="Confirm new password"
            type="password"
            icon={Lock}
            value={form.confirmPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            minLength={8}
            required
          />

          <ul className="auth-password-tips">
            <li className={form.newPassword.length >= 8 ? 'auth-password-tip met' : 'auth-password-tip'}>
              <ShieldCheck className="auth-password-tip-icon" aria-hidden="true" />
              Minimum 8 characters
            </li>
            <li
              className={
                form.newPassword && form.newPassword === form.confirmPassword
                  ? 'auth-password-tip met'
                  : 'auth-password-tip'
              }
            >
              <ShieldCheck className="auth-password-tip-icon" aria-hidden="true" />
              Passwords match
            </li>
          </ul>

          <LoadingButton
            type="submit"
            className="btn-primary auth-submit auth-submit-modern"
            loading={saving}
            loadingText="Updating..."
          >
            Update password
          </LoadingButton>
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordTab;
