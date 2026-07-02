import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const PageHeaderStickyContext = createContext(null);

export function PageHeaderStickyProvider({ children }) {
  const [headerInView, setHeaderInView] = useState(true);
  const location = useLocation();

  useEffect(() => {
    setHeaderInView(true);
  }, [location.pathname]);

  const setPageHeaderInView = useCallback((inView) => {
    setHeaderInView(inView);
  }, []);

  return (
    <PageHeaderStickyContext.Provider value={{ headerInView, setPageHeaderInView }}>
      {children}
    </PageHeaderStickyContext.Provider>
  );
}

export function usePageHeaderSticky() {
  const context = useContext(PageHeaderStickyContext);
  if (!context) {
    throw new Error('usePageHeaderSticky must be used within PageHeaderStickyProvider');
  }
  return context;
}
