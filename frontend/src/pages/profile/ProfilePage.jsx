import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSystemConfig } from '../../context/SystemConfigContext';
import {
  clearPageDocumentTitle,
  setPageDocumentTitle,
} from '../../utils/documentTitle';

const tabs = [
  { path: '/profile', label: 'Profile', end: true },
  { path: '/profile/password', label: 'Change Password' },
  { path: '/profile/passkeys', label: 'Device Unlock' },
  { path: '/profile/sim-cards', label: 'SIM Cards' },
];

function ProfilePage() {
  const { businessName } = useSystemConfig();

  useEffect(() => {
    setPageDocumentTitle('My Profile', businessName);
    return () => clearPageDocumentTitle(businessName);
  }, [businessName]);

  return (
    <div className="config-page">
      <div className="config-tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            className={({ isActive }) =>
              isActive ? 'config-tab config-tab-active' : 'config-tab'
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}

export default ProfilePage;
