import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Fingerprint, Mail, Shield, UserRound } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { login, loginWithPasskey } from '../../store/slices/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { safeNextPath } from '../../utils/safeNextPath';

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

function browserSupportsPasskeys() {
  return typeof window !== 'undefined' && window.PublicKeyCredential != null;
}

function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const passkeysSupported = browserSupportsPasskeys();

  const goAfterAuth = () => {
    navigate(nextPath || '/dashboard', { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await dispatch(
        login({ email: form.email.trim(), password: form.password })
      ).unwrap();

      if (result?.token) {
        clearOtpChallenge();
        goAfterAuth();
        return;
      }

      setOtpChallenge({
        challengeId: result.challengeId,
        maskedEmail: result.maskedEmail,
        smsSent: result.smsSent,
      });
      const otpTo = nextPath
        ? `/login/verify-otp?next=${encodeURIComponent(nextPath)}`
        : '/login/verify-otp';
      navigate(otpTo);
    } catch (error) {
      const message = typeof error === 'string' ? error : error?.message || 'Sign in failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!passkeysSupported) {
      toast.error('This device does not support fingerprint / passkey unlock.');
      return;
    }

    const email = form.email.trim();
    if (!email) {
      toast.error('Enter your email, then click Sign in with fingerprint.');
      return;
    }

    setPasskeySubmitting(true);
    try {
      await dispatch(loginWithPasskey({ email })).unwrap();
      clearOtpChallenge();
      goAfterAuth();
    } catch (error) {
      const message = typeof error === 'string' ? error : error?.message || 'Passkey sign-in failed';
      toast.error(message);
    } finally {
      setPasskeySubmitting(false);
    }
  };

  return (
    <div className="auth-panel auth-panel-modern">
      <div className="auth-panel-header">
        {/* Human avatar */}
        <div className="auth-avatar" aria-hidden="true">
          <div className="auth-avatar-ring" />
          <div className="auth-avatar-inner">
            <UserRound className="auth-avatar-icon" strokeWidth={1.5} />
          </div>
        </div>

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
          autoComplete="email username webauthn"
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
          disabled={passkeySubmitting}
          trailingIcon={<ArrowRight className="auth-submit-icon" aria-hidden="true" />}
        >
          Continue to verification
        </LoadingButton>
      </form>

      {passkeysSupported ? (
        <>
          <div className="auth-divider" role="separator">
            <span>or</span>
          </div>
          <LoadingButton
            type="button"
            className="btn-secondary auth-passkey-btn"
            loading={passkeySubmitting}
            loadingText="Waiting for device..."
            disabled={submitting}
            onClick={handlePasskeySignIn}
          >
            <Fingerprint className="icon-sm" aria-hidden="true" />
            Sign in with fingerprint
          </LoadingButton>
        </>
      ) : null}
    </div>
  );
}

export default LoginPage;
