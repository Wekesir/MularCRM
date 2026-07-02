import { useCallback, useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { slugToPermissionKey } from '../routes/reportRegistry';

export function usePermissions() {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const isSystemAdmin = useAppSelector((state) => state.auth.isSystemAdmin);
  const permissionsLoaded = useAppSelector((state) => state.auth.permissionsLoaded);
  const permissionsLoading = useAppSelector((state) => state.auth.permissionsLoading);
  const permissionsError = useAppSelector((state) => state.auth.permissionsError);

  const canReadReport = useCallback(
    (slug) => {
      if (isSystemAdmin) return true;

      const modulePerms = permissions?.reporting_analytics;
      if (!modulePerms) return false;

      // Legacy flat module permission (before per-report submodules)
      if (modulePerms.read === true) return true;

      const key = slugToPermissionKey(slug);
      return Boolean(modulePerms[key]?.read);
    },
    [isSystemAdmin, permissions]
  );

  const canReadModule = useCallback(
    (moduleKey, subKey = null) => {
      if (isSystemAdmin) return true;
      if (subKey) {
        return Boolean(permissions?.[moduleKey]?.[subKey]?.read);
      }
      return Boolean(permissions?.[moduleKey]?.read);
    },
    [isSystemAdmin, permissions]
  );

  return useMemo(
    () => ({
      permissions,
      isSystemAdmin,
      permissionsLoaded,
      permissionsLoading,
      permissionsError,
      canReadReport,
      canReadModule,
    }),
    [permissions, isSystemAdmin, permissionsLoaded, permissionsLoading, permissionsError, canReadReport, canReadModule]
  );
}
