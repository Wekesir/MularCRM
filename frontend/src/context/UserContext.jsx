import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { logoutRequest } from '../api/auth';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { changePassword as changePasswordThunk, logout as logoutAction, setUser } from '../store/slices/authSlice';

export function useUser() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);

  const updateProfile = useCallback(
    (updates) => {
      dispatch(setUser(updates));
      toast.success('Profile updated');
    },
    [dispatch]
  );

  const changePassword = useCallback(
    async ({ currentPassword, newPassword, confirmPassword }) => {
      if (!currentPassword || !newPassword || !confirmPassword) {
        toast.error('All password fields are required');
        return false;
      }

      if (newPassword.length < 8) {
        toast.error('New password must be at least 8 characters');
        return false;
      }

      if (newPassword !== confirmPassword) {
        toast.error('New passwords do not match');
        return false;
      }

      try {
        await dispatch(
          changePasswordThunk({ currentPassword, newPassword })
        ).unwrap();
        toast.success('Password updated');
        return true;
      } catch (error) {
        toast.error(error?.message || error || 'Failed to update password');
        return false;
      }
    },
    [dispatch]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      /* ignore network errors on logout */
    }
    dispatch(logoutAction());
    navigate('/login', { replace: true });
    toast.info('Signed out');
  }, [dispatch, navigate]);

  return {
    user,
    updateProfile,
    changePassword,
    logout,
  };
}

export function getUserInitials(name) {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** @deprecated Provider no longer required — Redux store is used instead. */
export function UserProvider({ children }) {
  return children;
}
