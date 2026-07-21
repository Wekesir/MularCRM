import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { loginPathWithNext, safeNextPath } from '../utils/safeNextPath';

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
    return (
      <Navigate
        to={loginPathWithNext(location.pathname, location.search)}
        replace
      />
    );
  }

  return <Outlet />;
}

function GuestOnly() {
  const session = useAppSelector((state) => state.auth.session);
  const [searchParams] = useSearchParams();
  const valid = useMemo(() => isSessionValid(session), [session]);

  if (valid) {
    const next = safeNextPath(searchParams.get('next'));
    return <Navigate to={next || '/dashboard'} replace />;
  }

  return <Outlet />;
}

export { isSessionValid, RequireAuth, GuestOnly };
