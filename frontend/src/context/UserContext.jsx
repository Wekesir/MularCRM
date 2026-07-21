import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { logoutRequest } from '../api/auth';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { changePassword as changePasswordThunk, logout as logoutAction, setUser } from '../store/slices/authSlice';
import { loginPathWithNext } from '../utils/safeNextPath';

export function useUser() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
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

  const logout = useCallback(
    async ({ preservePath = false } = {}) => {
      try {
        await logoutRequest();
      } catch {
        /* ignore network errors on logout */
      }
      dispatch(logoutAction());
      const to = preservePath
        ? loginPathWithNext(location.pathname, location.search)
        : '/login';
      navigate(to, { replace: true });
      toast.info(preservePath ? 'Signed out due to inactivity' : 'Signed out');
    },
    [dispatch, navigate, location.pathname, location.search]
  );

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
