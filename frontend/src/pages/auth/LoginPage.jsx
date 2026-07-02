import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Shield } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { login } from '../../store/slices/authSlice';
import { useAppDispatch } from '../../store/hooks';

const OTP_SESSION_KEY = 'omnicrm-otp-challenge';

export function setOtpChallenge(data) {
  sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(data));
}

export function getOtpChallenge() {
  try {
    const raw = sessionStorage.getItem(OTP_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearOtpChallenge() {
  sessionStorage.removeItem(OTP_SESSION_KEY);
}

function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await dispatch(
        login({ email: form.email.trim(), password: form.password })
      ).unwrap();
      setOtpChallenge({
        challengeId: result.challengeId,
        maskedEmail: result.maskedEmail,
        smsSent: result.smsSent,
      });
      navigate('/login/verify-otp');
    } catch (error) {
      const message = typeof error === 'string' ? error : error?.message || 'Sign in failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-panel auth-panel-modern">
      <div className="auth-panel-header">
        <span className="auth-panel-badge">
          <Shield className="auth-panel-badge-icon" aria-hidden="true" />
          Secure sign-in
        </span>
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-description">
          Enter your work email and password. We&apos;ll send a one-time code to verify it&apos;s you.
        </p>
      </div>

      <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
        <AuthFormField
          id="login-email"
          label="Work email"
          type="email"
          icon={Mail}
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
        <AuthFormField
          id="login-password"
          label="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />

        <div className="auth-form-row">
          <Link to="/forgot-password" className="auth-form-link">
            Forgot password?
          </Link>
        </div>

        <LoadingButton
          type="submit"
          className="btn-primary auth-submit auth-submit-modern"
          loading={submitting}
          loadingText="Signing in..."
          trailingIcon={<ArrowRight className="auth-submit-icon" aria-hidden="true" />}
        >
          Continue to verification
        </LoadingButton>
      </form>
    </div>
  );
}

export default LoginPage;
