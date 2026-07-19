import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthFormField from '../../components/auth/AuthFormField';
import LoadingButton from '../../components/LoadingButton';
import { forgotPassword } from '../../store/slices/authSlice';
import { useAppDispatch } from '../../store/hooks';

function ForgotPasswordPage() {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await dispatch(forgotPassword(email.trim())).unwrap();
      setSubmitted(true);
      toast.success(result.message);
    } catch (error) {
      toast.error(error.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-panel auth-panel-modern">
      <div className="auth-panel-header">
        {/* Key avatar */}
        <div className="auth-avatar" aria-hidden="true">
          <div className="auth-avatar-ring auth-avatar-ring--amber" />
          <div className="auth-avatar-inner auth-avatar-inner--amber">
            <KeyRound className="auth-avatar-icon auth-avatar-icon--amber" strokeWidth={1.5} />
          </div>
        </div>

        <span className="auth-panel-badge">
          <Send className="auth-panel-badge-icon" aria-hidden="true" />
          Account recovery
        </span>
        <h2 className="auth-title">Reset your password</h2>
        <p className="auth-description">
          Enter your account email and we&apos;ll send a secure reset link if the account exists.
        </p>
      </div>

      {submitted ? (
        <div className="auth-success auth-success-modern">
          <Mail className="auth-success-icon" aria-hidden="true" />
          <div>
            <strong>Check your inbox</strong>
            <p>
              If an account exists for that email, we sent a password reset link. It expires in
              one hour.
            </p>
          </div>
        </div>
      ) : (
        <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
          <AuthFormField
            id="forgot-email"
            label="Account email"
            type="email"
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
          <LoadingButton
            type="submit"
            className="btn-primary auth-submit auth-submit-modern"
            loading={loading}
            loadingText="Sending..."
            trailingIcon={<ArrowRight className="auth-submit-icon" aria-hidden="true" />}
          >
            Send reset link
          </LoadingButton>
        </form>
      )}

      <p className="auth-inline-link">
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
