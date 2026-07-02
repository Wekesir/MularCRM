import { useEffect } from 'react';
import { useAppSelector } from '../store/hooks';
import { applyThemeColor, normalizeHex, reapplyThemeColor } from '../utils/theme';

/** Keeps CSS variables in sync with Redux preferences + system theme color. */
function ThemeInitializer() {
  const colorMode = useAppSelector((state) => state.preferences.colorMode);
  const themeColor = useAppSelector((state) => state.systemConfig.config.theme?.color);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorMode);
  }, [colorMode]);

  useEffect(() => {
    const normalized = normalizeHex(themeColor);
    if (normalized) {
      applyThemeColor(normalized, colorMode);
    }
  }, [themeColor, colorMode]);

  useEffect(() => {
    reapplyThemeColor();
  }, [colorMode]);

  return null;
}

export default ThemeInitializer;
