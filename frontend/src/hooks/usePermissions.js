import { useCallback, useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { slugToPermissionKey } from '../routes/reportRegistry';
import { pathToPermission } from '../routes/moduleMeta';

const AGENT_ROLES = new Set(['agent', 'internal agent', 'external agent']);
const SUPERVISOR_ROLES = new Set([
  'supervisor',
  'manager',
  'call centre supervisor',
  'external agent supervisor',
]);
const SENIOR_SUPERVISOR_ROLES = new Set([
  'senior supervisor',
  'regional manager',
  'tenant administrator',
]);

function hasReadAccess(node) {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.read === 'boolean') return node.read === true;
  return Object.values(node).some((child) => hasReadAccess(child));
}

export function usePermissions() {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const isSystemAdmin = useAppSelector((state) => state.auth.isSystemAdmin);
  const roleName = useAppSelector((state) => state.auth.roleName);
  const callCenterId = useAppSelector((state) => state.auth.callCenterId);
  const callCenterName = useAppSelector((state) => state.auth.callCenterName);
  const permissionsLoaded = useAppSelector((state) => state.auth.permissionsLoaded);
  const permissionsLoading = useAppSelector((state) => state.auth.permissionsLoading);
  const permissionsError = useAppSelector((state) => state.auth.permissionsError);

  const roleKey = String(roleName || '').trim().toLowerCase();
  const isAgent = AGENT_ROLES.has(roleKey);
  const isSupervisor = SUPERVISOR_ROLES.has(roleKey);
  const isSeniorSupervisor = SENIOR_SUPERVISOR_ROLES.has(roleKey);

  /** Supervisors, Senior Supervisors, and System Admins may assign cases. */
  const canAssignCases =
    Boolean(isSystemAdmin) || isSupervisor || isSeniorSupervisor;

  const canReadReport = useCallback(
    (slug) => {
      if (isSystemAdmin) return true;

      const modulePerms = permissions?.reports ?? permissions?.reporting_analytics;
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
      if (!permissions) return false;
      if (subKey) {
        return Boolean(permissions?.[moduleKey]?.[subKey]?.read);
      }
      return hasReadAccess(permissions?.[moduleKey]);
    },
    [isSystemAdmin, permissions]
  );

  /** Whether the signed-in user may see / open a sidebar or module path. */
  const canAccessPath = useCallback(
    (path) => {
      if (isSystemAdmin) return true;
      if (!permissions) return false;

      const entry = pathToPermission[path];
      if (!entry) return false;

      if (entry.sub) {
        return Boolean(permissions?.[entry.module]?.[entry.sub]?.read);
      }

      return hasReadAccess(permissions?.[entry.module]);
    },
    [isSystemAdmin, permissions]
  );

  return useMemo(
    () => ({
      permissions,
      roleName,
      isAgent,
      isSupervisor,
      isSeniorSupervisor,
      callCenterId,
      callCenterName,
      canAssignCases,
      isSystemAdmin,
      permissionsLoaded,
      permissionsLoading,
      permissionsError,
      canReadReport,
      canReadModule,
      canAccessPath,
    }),
    [
      permissions,
      roleName,
      isAgent,
      isSupervisor,
      isSeniorSupervisor,
      callCenterId,
      callCenterName,
      canAssignCases,
      isSystemAdmin,
      permissionsLoaded,
      permissionsLoading,
      permissionsError,
      canReadReport,
      canReadModule,
      canAccessPath,
    ]
  );
}
