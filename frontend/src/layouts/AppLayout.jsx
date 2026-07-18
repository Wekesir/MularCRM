import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import PageLayout from '../layouts/PageLayout';
import { PageHeaderStickyProvider, usePageHeaderSticky } from '../context/PageHeaderStickyContext';
import { PageActionsProvider, usePageActions } from '../context/PageActionsContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { getModuleMeta, pathToModuleKey } from '../routes/moduleMeta';
import { getSidebarIcon } from '../routes/sidebarIcons';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleSidebarCollapsed } from '../store/slices/preferencesSlice';

function resolveIconPath(pathname) {
  if (pathname.startsWith('/system-configurations')) {
    return '/system-configurations';
  }

  if (pathToModuleKey[pathname]) {
    return pathname;
  }

  const match = Object.keys(pathToModuleKey).find((path) => pathname.startsWith(path));
  return match || '/dashboard';
}

function AppLayoutContent() {
  const dispatch = useAppDispatch();
  const sidebarCollapsed = useAppSelector((state) => state.preferences.sidebarCollapsed);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const meta = getModuleMeta(location.pathname);
  const isSystemConfig = location.pathname.startsWith('/system-configurations');
  const PageIcon = getSidebarIcon(resolveIconPath(location.pathname));
  const { headerInView } = usePageHeaderSticky();
  const { actions: pageActions } = usePageActions();
  const showStickyTitle = !headerInView;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const layoutClassName = sidebarCollapsed
    ? 'app-layout app-layout--sidebar-collapsed'
    : 'app-layout';

  return (
    <div className={layoutClassName}>
      <div
        className={sidebarOpen ? 'sidebar-overlay visible' : 'sidebar-overlay'}
        onClick={() => setSidebarOpen(false)}
        role="presentation"
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <TopNav
          onMenuToggle={() => setSidebarOpen((open) => !open)}
          onSidebarToggle={() => dispatch(toggleSidebarCollapsed())}
          sidebarCollapsed={sidebarCollapsed}
          pageTitle={meta.title}
          pageDescription={meta.description}
          showStickyTitle={showStickyTitle}
        />

        <main className="main-content">
          <div className="page-container">
            <div className="page-root">
              {!isSystemConfig && (
                <PageLayout
                  title={meta.title}
                  description={meta.description}
                  icon={PageIcon}
                  actions={pageActions}
                />
              )}
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AppLayout() {
  return (
    <PageHeaderStickyProvider>
      <PageActionsProvider>
        <ConfirmProvider>
          <AppLayoutContent />
        </ConfirmProvider>
      </PageActionsProvider>
    </PageHeaderStickyProvider>
  );
}

export default AppLayout;
