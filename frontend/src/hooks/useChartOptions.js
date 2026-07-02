import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getThemedChartOptions } from '../utils/chartTheme';

export function useChartOptions(overrides = {}) {
  const { colorMode } = useTheme();

  return useMemo(
    () => getThemedChartOptions(colorMode, overrides),
    [colorMode, overrides]
  );
}
