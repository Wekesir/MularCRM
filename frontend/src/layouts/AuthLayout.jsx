import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import AuthCopyright from '../components/auth/AuthCopyright';
import AuthShowcase from '../components/auth/AuthShowcase';
import { useSystemConfig } from '../context/SystemConfigContext';
import {
  clearPageDocumentTitle,
  setPageDocumentTitle,
  setUnreadDocumentTitleCount,
} from '../utils/documentTitle';

function getBusinessInitial(name) {
  const trimmed = (name || '').trim();
  return (trimmed.charAt(0) || 'O').toUpperCase();
}

function AuthLayout() {
  const { businessName, businessLogo } = useSystemConfig();
  const location = useLocation();
  const showFooterLink = !location.pathname.startsWith('/forgot-password')
    && !location.pathname.startsWith('/reset-password')
    && location.pathname !== '/login';

  useEffect(() => {
    setUnreadDocumentTitleCount(0);
    setPageDocumentTitle('Sign in', businessName);
    return () => clearPageDocumentTitle(businessName);
  }, [businessName]);

  const initial = getBusinessInitial(businessName);

  return (
    <div className="auth-page auth-page-split">
      <aside className="auth-showcase" aria-label="Platform overview">
        <div className="auth-showcase-body">
          <AuthShowcase />
        </div>
        <AuthCopyright variant="showcase" />
      </aside>

      <main className="auth-main">
        <div className="auth-main-inner">
          <div className="auth-card">
            <div className="auth-brand auth-brand-compact">
              <span className="auth-brand-mark" aria-hidden="true">
                {businessLogo ? (
                  <img src={businessLogo} alt="" className="auth-brand-logo" />
                ) : (
                  <span className="auth-brand-initial">{initial}</span>
                )}
              </span>
              <div className="auth-brand-text">
                <h1 className="auth-brand-name">{businessName}</h1>
                <p className="auth-brand-tagline">Sign in to continue</p>
              </div>
            </div>

            <div className="auth-card-divider" aria-hidden="true" />

            <Outlet />

            {showFooterLink && (
              <p className="auth-footer-note">
                Secure access with email verification.{' '}
                <Link to="/forgot-password">Forgot password?</Link>
              </p>
            )}
          </div>
        </div>
        <AuthCopyright variant="mobile" />
      </main>
    </div>
  );
}

export default AuthLayout;
