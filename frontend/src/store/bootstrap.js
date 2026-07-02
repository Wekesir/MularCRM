import { applyThemeColor, normalizeHex } from '../utils/theme';

const PERSIST_KEY = 'persist:omnicrm';

/** Apply branding + color mode from redux-persist storage before React mounts. */
export function bootstrapFromPersistedState() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;

    const persisted = JSON.parse(raw);
    const preferences = persisted.preferences ? JSON.parse(persisted.preferences) : null;
    const systemConfig = persisted.systemConfig ? JSON.parse(persisted.systemConfig) : null;

    const colorMode = preferences?.colorMode;
    if (colorMode === 'light' || colorMode === 'dark') {
      document.documentElement.setAttribute('data-theme', colorMode);
    }

    const themeColor = normalizeHex(systemConfig?.config?.theme?.color);
    if (themeColor) {
      applyThemeColor(themeColor, colorMode === 'light' ? 'light' : 'dark');
    }
  } catch {
    /* ignore parse errors */
  }
}
