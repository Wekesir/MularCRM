import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setColorMode, toggleColorMode as toggleColorModeAction } from '../store/slices/preferencesSlice';

export function useTheme() {
  const dispatch = useAppDispatch();
  const colorMode = useAppSelector((state) => state.preferences.colorMode);

  const toggleColorMode = useCallback(() => {
    dispatch(toggleColorModeAction());
  }, [dispatch]);

  const setColorModeFn = useCallback(
    (mode) => dispatch(setColorMode(mode)),
    [dispatch]
  );

  return {
    colorMode,
    isDark: colorMode === 'dark',
    setColorMode: setColorModeFn,
    toggleColorMode,
  };
}

/** @deprecated Provider no longer required — Redux store is used instead. */
export function ThemeProvider({ children }) {
  return children;
}
