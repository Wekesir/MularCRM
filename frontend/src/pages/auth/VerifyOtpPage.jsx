import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock, Loader2, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { clearOtpChallenge, getOtpChallenge } from './LoginPage';
import { resendOtp, verifyOtp, loadUserPermissions } from '../../store/slices/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { safeNextPath } from '../../utils/safeNextPath';

function VerifyOtpPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(getOtpChallenge);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!challenge?.challengeId) {
      navigate(
        nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login',
        { replace: true }
      );
    }
  }, [challenge, navigate, nextPath]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const id = window.setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!challenge?.challengeId) return;
    setSubmitting(true);
    try {
      await dispatch(verifyOtp({ challengeId: challenge.challengeId, code: code.trim() })).unwrap();
      clearOtpChallenge();
      await dispatch(loadUserPermissions()).unwrap();
      toast.success('Signed in successfully');
      navigate(nextPath || '/dashboard', { replace: true });
    } catch (error) {
      const message = typeof error === 'string' ? error : error?.message || 'Invalid verification code';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!challenge?.challengeId || resendCooldown > 0) return;
    setResending(true);
    try {
      const result = await dispatch(resendOtp(challenge.challengeId)).unwrap();
      setChallenge((prev) => ({ ...prev, maskedEmail: result.maskedEmail, smsSent: result.smsSent }));
      toast.success('A new code was sent');
      setResendCooldown(30);
    } catch (error) {
      toast.error(error.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  if (!challenge?.challengeId) return null;

  const canResend = !resending && !submitting && resendCooldown === 0;

  return (
    <div className="auth-panel auth-panel-modern">
      <div className="auth-panel-header">
        <span className="auth-panel-badge">
          <ShieldCheck className="auth-panel-badge-icon" aria-hidden="true" />
          Two-step verification
        </span>
        <h2 className="auth-title">Check your inbox</h2>
        <p className="auth-description">
          We sent a 6-digit code to{' '}
          <strong className="auth-description-highlight">{challenge.maskedEmail}</strong>.
          {challenge.smsSent && ' A copy was also sent via SMS.'}
        </p>
      </div>

      <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
        <div className="otp-input-group">
          <label className="otp-input-label" htmlFor="otp-code">
            Verification code
          </label>
          <div className="otp-input-wrap">
            <MessageSquare className="otp-input-icon" aria-hidden="true" />
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              placeholder="000000"
              required
              className="otp-input"
              aria-describedby="otp-hint"
              autoFocus
            />
            {code.length > 0 && code.length < 6 && (
              <span className="otp-input-counter" aria-live="polite">
                {6 - code.length} left
              </span>
            )}
          </div>
          <p id="otp-hint" className="otp-input-hint">
            Enter the 6-digit code exactly as received.
          </p>
        </div>

        <LoadingButton
          type="submit"
          className="btn-primary auth-submit auth-submit-modern"
          loading={submitting}
          loadingText="Verifying..."
          disabled={code.length < 6}
          trailingIcon={<ArrowRight className="auth-submit-icon" aria-hidden="true" />}
        >
          Verify and sign in
        </LoadingButton>
      </form>

      <div className="otp-footer">
        <button
          type="button"
          className="otp-resend-btn"
          onClick={handleResend}
          disabled={!canResend}
          aria-label={resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend code'}
        >
          {resending ? (
            <Loader2 className="otp-resend-spinner" aria-hidden="true" />
          ) : (
            <RefreshCw className="otp-resend-icon" aria-hidden="true" />
          )}
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </button>

        <span className="otp-footer-divider" aria-hidden="true" />

        <Link
          to={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'}
          className="otp-back-link"
        >
          Back to sign in
        </Link>
      </div>

      <div className="otp-session-note" aria-label="Session information">
        <Clock className="otp-session-note-icon" aria-hidden="true" />
        <span>Session expires at midnight after sign-in.</span>
      </div>
    </div>
  );
}

export default VerifyOtpPage;
