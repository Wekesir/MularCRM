import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Moon, Settings, Sun, UserPen } from 'lucide-react';
import { useSystemConfig } from '../context/SystemConfigContext';
import { useTheme } from '../context/ThemeContext';
import { getUserInitials, useUser } from '../context/UserContext';
import {
  NotificationsBellButton,
  NotificationsOffcanvas,
  useNotifications,
} from './NotificationsOffcanvas';

function UserAvatarButton({ user }) {
  const initials = getUserInitials(user.name);

  return (
    <div className="top-nav-user-trigger">
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="top-nav-user-avatar" />
      ) : (
        <span className="top-nav-user-avatar top-nav-user-avatar-initials">{initials}</span>
      )}
      <div className="top-nav-user-text">
        <p className="top-nav-user-name">{user.name}</p>
        <p className="top-nav-user-email">{user.email}</p>
      </div>
      <ChevronDown className="top-nav-user-chevron" aria-hidden="true" />
    </div>
  );
}

function TopBarUserMenu() {
  const { user, logout } = useUser();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="profile-menu" ref={dropdownRef}>
      <button
        type="button"
        className="top-nav-user-btn"
        onClick={() => setDropdownOpen((open) => !open)}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <UserAvatarButton user={user} />
      </button>

      {dropdownOpen && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <span className="profile-dropdown-label">Signed in as</span>
            <strong>{user.email}</strong>
          </div>
          <Link
            to="/profile"
            className="dropdown-item"
            onClick={() => setDropdownOpen(false)}
          >
            <UserPen className="dropdown-item-icon" aria-hidden="true" />
            Update Profile
          </Link>
          <Link
            to="/system-configurations"
            className="dropdown-item"
            onClick={() => setDropdownOpen(false)}
          >
            <Settings className="dropdown-item-icon" aria-hidden="true" />
            System Settings
          </Link>
          <button
            type="button"
            className="dropdown-item dropdown-item-danger"
            onClick={() => {
              logout();
              setDropdownOpen(false);
            }}
          >
            <LogOut className="dropdown-item-icon" aria-hidden="true" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

function TopNavMobileBrand() {
  const { businessName, businessLogo } = useSystemConfig();

  if (businessLogo) {
    return <img src={businessLogo} alt={businessName} className="top-nav-mobile-logo" />;
  }

  return <span className="top-nav-mobile-brand-name">{businessName}</span>;
}

function TopNav({ onMenuToggle, pageTitle, pageDescription, showStickyTitle }) {
  const { colorMode, toggleColorMode } = useTheme();
  const notifications = useNotifications();
  const desktopNavClassName = showStickyTitle
    ? 'top-nav top-nav-desktop has-sticky-title'
    : 'top-nav top-nav-desktop';

  return (
    <>
      <header className="top-nav top-nav-mobile">
        <button
          type="button"
          className="menu-toggle"
          onClick={onMenuToggle}
          aria-label="Open menu"
        >
          <Menu className="menu-toggle-icon" />
        </button>

        {showStickyTitle ? (
          <div className="top-nav-mobile-page-meta">
            <p className="top-nav-mobile-page-title">{pageTitle}</p>
            {pageDescription && (
              <p className="top-nav-mobile-page-description">{pageDescription}</p>
            )}
          </div>
        ) : (
          <Link to="/dashboard" className="top-nav-mobile-brand">
            <TopNavMobileBrand />
          </Link>
        )}

        <div className="top-nav-mobile-actions">
          <NotificationsBellButton panel={notifications} />
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleColorMode}
            aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
          >
            {colorMode === 'dark' ? <Sun className="theme-toggle-icon" /> : <Moon className="theme-toggle-icon" />}
          </button>
          <TopBarUserMenu />
        </div>
      </header>

      <header className={desktopNavClassName}>
        <div
          className={showStickyTitle ? 'top-nav-page-meta is-visible' : 'top-nav-page-meta'}
          aria-hidden={!showStickyTitle}
        >
          <p className="top-nav-page-title">{pageTitle}</p>
          {pageDescription && <p className="top-nav-page-description">{pageDescription}</p>}
        </div>

        <div className="top-nav-right">
          <NotificationsBellButton panel={notifications} />

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleColorMode}
            aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
          >
            {colorMode === 'dark' ? <Sun className="theme-toggle-icon" /> : <Moon className="theme-toggle-icon" />}
          </button>

          <div className="top-nav-divider" aria-hidden="true" />

          <TopBarUserMenu />
        </div>
      </header>

      <NotificationsOffcanvas panel={notifications} />
    </>
  );
}

export default TopNav;
