import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { useSystemConfig } from '../context/SystemConfigContext';
import { getUserInitials, useUser } from '../context/UserContext';
import { usePermissions } from '../hooks/usePermissions';
import { sidebarNav } from '../routes/sidebarNav';
import { getSidebarIcon } from '../routes/sidebarIcons';

function SidebarNavLink({ path, label, onNavigate, end = false }) {
  const Icon = getSidebarIcon(path);

  return (
    <NavLink
      to={path}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        isActive ? 'sidebar-nav-link sidebar-nav-link-active' : 'sidebar-nav-link'
      }
    >
      <span className="sidebar-nav-icon-box" aria-hidden="true">
        <Icon className="sidebar-nav-icon" />
      </span>
      <span className="sidebar-nav-label">{label}</span>
    </NavLink>
  );
}

function SidebarNavDropdown({ dropdownKey, label, items, onNavigate }) {
  const location = useLocation();
  const isChildActive = items.some((child) => location.pathname.startsWith(child.path));
  const [open, setOpen] = useState(isChildActive);
  const Icon = getSidebarIcon(dropdownKey);

  return (
    <div className="sidebar-nav-dropdown">
      <button
        type="button"
        className={
          isChildActive
            ? 'sidebar-nav-dropdown-trigger sidebar-nav-dropdown-trigger-active'
            : 'sidebar-nav-dropdown-trigger'
        }
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="sidebar-nav-icon-box" aria-hidden="true">
          <Icon className="sidebar-nav-icon" />
        </span>
        <span className="sidebar-nav-label">{label}</span>
        <ChevronDown
          className={open ? 'sidebar-nav-dropdown-chevron is-open' : 'sidebar-nav-dropdown-chevron'}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="sidebar-nav-dropdown-panel">
          {items.map(({ path, label: childLabel }) => {
            const ChildIcon = getSidebarIcon(path);

            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/case-management'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  isActive
                    ? 'sidebar-nav-sublink sidebar-nav-sublink-active'
                    : 'sidebar-nav-sublink'
                }
              >
                <span className="sidebar-nav-sublink-icon-box" aria-hidden="true">
                  <ChildIcon className="sidebar-nav-sublink-icon" />
                </span>
                <span className="sidebar-nav-label">{childLabel}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarUserCard() {
  const { user } = useUser();
  const initials = getUserInitials(user.name);

  return (
    <div className="sidebar-user-card">
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="sidebar-user-avatar" />
      ) : (
        <span className="sidebar-user-avatar sidebar-user-avatar-initials">{initials}</span>
      )}
      <div className="sidebar-user-info">
        <p className="sidebar-user-name">{user.name}</p>
        <p className="sidebar-user-email">{user.email}</p>
      </div>
    </div>
  );
}

function isNavItemVisible(item, { canAssignCases }) {
  if (item.assignersOnly && !canAssignCases) return false;
  return true;
}

function SidebarNav({ onNavigate, className = '' }) {
  const { logout } = useUser();
  const { canAssignCases } = usePermissions();

  const visibleNav = sidebarNav
    .map((item) => {
      if (item.type === 'dropdown') {
        const children = (item.children || []).filter((child) =>
          isNavItemVisible(child, { canAssignCases })
        );
        if (children.length === 0) return null;
        return { ...item, children };
      }
      return isNavItemVisible(item, { canAssignCases }) ? item : null;
    })
    .filter(Boolean);

  return (
    <div className={`sidebar-inner ${className}`.trim()}>
      <nav className="sidebar-nav-groups">
        <div className="sidebar-nav-group">
          <div className="sidebar-nav-group-items">
            {visibleNav.map((item) =>
              item.type === 'dropdown' ? (
                <SidebarNavDropdown
                  key={item.key}
                  dropdownKey={item.key}
                  label={item.label}
                  items={item.children}
                  onNavigate={onNavigate}
                />
              ) : (
                <SidebarNavLink
                  key={item.path}
                  path={item.path}
                  label={item.label}
                  onNavigate={onNavigate}
                />
              )
            )}
          </div>
        </div>
      </nav>

      <div className="sidebar-footer">
        <SidebarUserCard />
        <button type="button" className="sidebar-logout-btn" onClick={logout}>
          <span className="sidebar-nav-icon-box" aria-hidden="true">
            <LogOut className="sidebar-nav-icon" />
          </span>
          Log out
        </button>
      </div>
    </div>
  );
}

function getBusinessInitial(name) {
  const trimmed = (name || '').trim();
  return (trimmed.charAt(0) || 'O').toUpperCase();
}

function SidebarBrand() {
  const { businessName, businessLogo } = useSystemConfig();
  const initial = getBusinessInitial(businessName);

  return (
    <Link to="/dashboard" className="sidebar-brand">
      <span className="sidebar-brand-mark" aria-hidden="true">
        {businessLogo ? (
          <img src={businessLogo} alt="" className="sidebar-brand-logo" />
        ) : (
          <span className="sidebar-brand-initial">{initial}</span>
        )}
      </span>
      <span className="sidebar-brand-text">
        <span className="sidebar-brand-name">{businessName}</span>
        <span className="sidebar-brand-tagline">Collections CRM</span>
      </span>
    </Link>
  );
}

function Sidebar({ isOpen, onClose }) {
  return (
    <>
      <aside className="sidebar sidebar-desktop">
        <SidebarBrand />
        <SidebarNav className="sidebar-inner-desktop" />
      </aside>

      <aside className={isOpen ? 'sidebar sidebar-mobile sidebar-open' : 'sidebar sidebar-mobile'}>
        <SidebarBrand />
        <SidebarNav onNavigate={onClose} />
      </aside>
    </>
  );
}

export default Sidebar;
