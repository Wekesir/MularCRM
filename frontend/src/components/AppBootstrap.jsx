import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  bootstrapSession,
  loadUserPermissions,
} from '../store/slices/authSlice';
import { loadBranding } from '../store/slices/systemConfigSlice';

/** Syncs branding and authenticated session from the database after Redux rehydrates. */
function AppBootstrap() {
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.auth.session);
  const permissionsLoaded = useAppSelector((state) => state.auth.permissionsLoaded);

  useEffect(() => {
    dispatch(loadBranding());
  }, [dispatch]);

  useEffect(() => {
    if (!session.isAuthenticated || !session.token) return;

    dispatch(bootstrapSession())
      .unwrap()
      .then(() => {
        if (!permissionsLoaded) {
          dispatch(loadUserPermissions());
        }
      })
      .catch(() => {
        /* session cleared in rejected handler */
      });
  }, [dispatch, session.isAuthenticated, session.token, permissionsLoaded]);

  return null;
}

export default AppBootstrap;
