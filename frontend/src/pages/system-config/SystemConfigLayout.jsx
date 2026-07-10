import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Settings } from 'lucide-react';
import ObservedPageHeader from '../../components/ObservedPageHeader';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { usePermissions } from '../../hooks/usePermissions';

const submodules = [
  { path: '/system-configurations/business', label: 'Business Configs' },
  { path: '/system-configurations/communication', label: 'Communication Integration' },
  { path: '/system-configurations/integrations', label: 'Integrations' },
  { path: '/system-configurations/database-backup', label: 'Database Backup', systemAdminOnly: true },
  { path: '/system-configurations/access-levels', label: 'Access Levels' },
  { path: '/system-configurations/report-access', label: 'Report Access' },
  { path: '/system-configurations/audit-logs', label: 'Audit Logs', systemAdminOnly: true },
];

function SystemConfigLayout() {
  const { businessName } = useSystemConfig();
  const { isSystemAdmin } = usePermissions();
  const visibleSubmodules = submodules.filter(
    (sub) => !sub.systemAdminOnly || isSystemAdmin
  );

  useEffect(() => {
    document.title = `System Configurations | ${businessName}`;
    return () => {
      document.title = businessName;
    };
  }, [businessName]);

  return (
    <div className="config-page config-page-wide">
      <ObservedPageHeader
        icon={Settings}
        title="System Configurations"
        description="Manage business branding, communication channels, integrations, user access levels, and report passwords for this deployment."
      />

      <div className="config-tabs">
        {visibleSubmodules.map((sub) => (
          <NavLink
            key={sub.path}
            to={sub.path}
            className={({ isActive }) =>
              isActive ? 'config-tab config-tab-active' : 'config-tab'
            }
          >
            {sub.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}

export default SystemConfigLayout;
