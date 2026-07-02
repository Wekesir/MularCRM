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

  return (
    <div className="app-layout">
      <div
        className={sidebarOpen ? 'sidebar-overlay visible' : 'sidebar-overlay'}
        onClick={() => setSidebarOpen(false)}
        role="presentation"
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <TopNav
          onMenuToggle={() => setSidebarOpen((open) => !open)}
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
