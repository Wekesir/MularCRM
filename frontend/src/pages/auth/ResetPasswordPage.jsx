import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { resetPassword } from '../../store/slices/authSlice';
import { useAppDispatch } from '../../store/hooks';

function ResetPasswordPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error('Reset link is invalid or missing');
      return;
    }
    if (form.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await dispatch(
        resetPassword({ token, newPassword: form.newPassword })
      ).unwrap();
      toast.success('Password updated. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-panel auth-panel-modern">
        <div className="auth-panel-header">
          <span className="auth-panel-badge auth-panel-badge-warning">Link expired</span>
          <h2 className="auth-title">Invalid reset link</h2>
          <p className="auth-description">
            This password reset link is missing or has expired. Request a new one below.
          </p>
        </div>
        <Link to="/forgot-password" className="btn-primary auth-submit auth-submit-modern auth-submit-link">
          Request new reset link
          <ArrowRight className="auth-submit-icon" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-panel auth-panel-modern">
      <div className="auth-panel-header">
        <span className="auth-panel-badge">
          <KeyRound className="auth-panel-badge-icon" aria-hidden="true" />
          Password reset
        </span>
        <h2 className="auth-title">Create a new password</h2>
        <p className="auth-description">
          Choose a strong password you haven&apos;t used on this account before.
        </p>
      </div>

      <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
        <AuthFormField
          id="reset-password"
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
          id="reset-password-confirm"
          label="Confirm password"
          type="password"
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
          loading={loading}
          loadingText="Saving..."
          trailingIcon={<ArrowRight className="auth-submit-icon" aria-hidden="true" />}
        >
          Update password
        </LoadingButton>
      </form>

      <p className="auth-inline-link">
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export default ResetPasswordPage;
