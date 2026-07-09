import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Fingerprint, Mail, Shield } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { login, loginWithPasskey } from '../../store/slices/authSlice';
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

function browserSupportsPasskeys() {
  return typeof window !== 'undefined' && window.PublicKeyCredential != null;
}

function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const passkeysSupported = browserSupportsPasskeys();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await dispatch(
        login({ email: form.email.trim(), password: form.password })
      ).unwrap();

      if (result?.token) {
        clearOtpChallenge();
        navigate('/dashboard', { replace: true });
        return;
      }

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
      navigate('/dashboard', { replace: true });
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
          <p className="auth-passkey-hint">
            Enter your email, then click Sign in with fingerprint. If Chrome asks for a Google PIN,
            the passkey is still in Google Password Manager — remove it under Chrome → Password
            Manager → Passkeys for localhost, then re-register under Profile → Device Unlock and
            choose this device. On Linux, Chrome often cannot use the laptop fingerprint sensor.
          </p>
        </>
      ) : null}
    </div>
  );
}

export default LoginPage;
