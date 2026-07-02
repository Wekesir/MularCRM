import { NavLink, Outlet } from 'react-router-dom';
import { Mail, MessageSquare, PhoneCall, SlidersHorizontal } from 'lucide-react';

const subModules = [
  {
    path: '/communication/communication-channels/settings/email-templates',
    label: 'Email Templates',
    icon: Mail,
  },
  {
    path: '/communication/communication-channels/settings/sms-templates',
    label: 'SMS Templates',
    icon: MessageSquare,
  },
  {
    path: '/communication/communication-channels/settings/call-configurations',
    label: 'Call Configurations',
    icon: PhoneCall,
  },
];

function ChannelsSettingsLayout() {
  return (
    <div className="cc-settings-layout">
      <aside className="cc-sub-nav">
        <div className="cc-sub-nav-header">
          <SlidersHorizontal className="cc-sub-nav-header-icon" />
          <h2 className="cc-sub-nav-title">Channel Settings</h2>
        </div>
        <nav className="cc-sub-nav-list">
          {subModules.map((sub) => {
            const Icon = sub.icon;
            return (
              <NavLink
                key={sub.path}
                to={sub.path}
                className={({ isActive }) =>
                  isActive ? 'cc-sub-nav-link cc-sub-nav-link-active' : 'cc-sub-nav-link'
                }
              >
                <Icon className="cc-sub-nav-link-icon" />
                <span className="cc-sub-nav-link-label">{sub.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="cc-settings-content">
        <Outlet />
      </div>
    </div>
  );
}

export default ChannelsSettingsLayout;
