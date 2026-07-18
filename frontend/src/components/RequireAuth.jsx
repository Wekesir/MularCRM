import { useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

function isSessionValid(session) {
  if (!session.isAuthenticated || !session.token) return false;
  if (!session.expiresAt) return true;
  return new Date(session.expiresAt).getTime() > Date.now();
}

function RequireAuth() {
  const location = useLocation();
  const session = useAppSelector((state) => state.auth.session);

  const valid = useMemo(() => isSessionValid(session), [session]);

  if (!valid) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

function GuestOnly() {
  const session = useAppSelector((state) => state.auth.session);
  const valid = useMemo(() => isSessionValid(session), [session]);

  if (valid) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export { isSessionValid, RequireAuth, GuestOnly };
