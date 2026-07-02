import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { fetchReportGate, unlockReport as unlockReportApi } from '../api/reports';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setReportUnlock } from '../store/slices/authSlice';

export function useReportGate(reportSlug) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.session.isAuthenticated);
  const reportUnlocks = useAppSelector((state) => state.auth.reportUnlocks) ?? {};
  const [gate, setGate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  const storedUnlock = reportUnlocks[reportSlug];
  const storedToken =
    storedUnlock && new Date(storedUnlock.expiresAt).getTime() > Date.now()
      ? storedUnlock.token
      : null;

  const refreshGate = useCallback(async () => {
    if (!reportSlug) {
      setLoading(false);
      setGate(null);
      return;
    }

    if (!isAuthenticated) {
      setLoading(true);
      return;
    }

    setLoading(true);
    try {
      const status = await fetchReportGate(reportSlug, storedToken);
      setGate(status);
    } catch {
      setGate({ canRead: false, requiresPassword: false, unlocked: false });
    } finally {
      setLoading(false);
    }
  }, [reportSlug, storedToken, isAuthenticated]);

  useEffect(() => {
    refreshGate();
  }, [refreshGate]);

  const unlock = useCallback(
    async (password) => {
      setUnlocking(true);
      try {
        const result = await unlockReportApi(reportSlug, password);
        if (result.token) {
          dispatch(
            setReportUnlock({
              slug: reportSlug,
              token: result.token,
              expiresAt: result.expiresAt,
            })
          );
        }
        setGate((prev) => ({
          ...prev,
          unlocked: true,
          requiresPassword: result.requiresPassword,
        }));
        toast.success('Report unlocked');
        return true;
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to unlock report');
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [dispatch, reportSlug]
  );

  return {
    gate,
    loading,
    unlocking,
    refreshGate,
    unlock,
  };
}
