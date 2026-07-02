import { useEffect } from 'react';
import { setAuthTokenGetter, setUnauthorizedHandler } from '../api/client';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearSession } from '../store/slices/authSlice';

function AuthClientSetup() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.session.token);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      dispatch(clearSession());
      if (!window.location.pathname.startsWith('/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/login?next=${next}`);
      }
    });
  }, [dispatch]);

  return null;
}

export default AuthClientSetup;
