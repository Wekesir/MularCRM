import { NavLink, Outlet } from 'react-router-dom';
import { LayoutGrid, Settings, ShieldCheck } from 'lucide-react';

const tabs = [
  {
    path: '/communication/communication-channels',
    label: 'Overview',
    icon: LayoutGrid,
    end: true,
  },
  {
    path: '/communication/communication-channels/settings',
    label: 'Settings',
    icon: Settings,
  },
  {
    path: '/communication/communication-channels/compliance',
    label: 'Compliance',
    icon: ShieldCheck,
  },
];

function CommunicationChannelsLayout() {
  return (
    <div className="cc-layout">
      <div className="config-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) =>
                isActive ? 'config-tab config-tab-active cc-tab' : 'config-tab cc-tab'
              }
            >
              <Icon className="cc-tab-icon" />
              {tab.label}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}

export default CommunicationChannelsLayout;
