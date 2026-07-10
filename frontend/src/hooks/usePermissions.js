import { useCallback, useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { slugToPermissionKey } from '../routes/reportRegistry';

const AGENT_ROLE_NAME = 'agent';

export function usePermissions() {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const isSystemAdmin = useAppSelector((state) => state.auth.isSystemAdmin);
  const roleName = useAppSelector((state) => state.auth.roleName);
  const permissionsLoaded = useAppSelector((state) => state.auth.permissionsLoaded);
  const permissionsLoading = useAppSelector((state) => state.auth.permissionsLoading);
  const permissionsError = useAppSelector((state) => state.auth.permissionsError);

  const isAgent = String(roleName || '').trim().toLowerCase() === AGENT_ROLE_NAME;

  /** Non-Agent users (and System Admins) may assign/reallocate cases. */
  const canAssignCases = Boolean(isSystemAdmin) || !isAgent;

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
      roleName,
      isAgent,
      canAssignCases,
      isSystemAdmin,
      permissionsLoaded,
      permissionsLoading,
      permissionsError,
      canReadReport,
      canReadModule,
    }),
    [
      permissions,
      roleName,
      isAgent,
      canAssignCases,
      isSystemAdmin,
      permissionsLoaded,
      permissionsLoading,
      permissionsError,
      canReadReport,
      canReadModule,
    ]
  );
}
