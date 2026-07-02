import { createContext, useContext, useState } from 'react';

const PageActionsContext = createContext(null);

export function PageActionsProvider({ children }) {
  const [actions, setActions] = useState(null);
  return (
    <PageActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  const ctx = useContext(PageActionsContext);
  if (!ctx) {
    return { actions: null, setActions: () => {} };
  }
  return ctx;
}
