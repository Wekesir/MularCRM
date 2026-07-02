import { getThemeAccentColor } from './theme';

export function getChartPalette() {
  const accent = getThemeAccentColor();
  return [accent, '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
}

export function getThemeColors(colorMode) {
  const isDark = colorMode === 'dark';

  return {
    text: isDark ? '#a3a3a3' : '#475569',
    textMuted: isDark ? '#737373' : '#94a3b8',
    grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(71, 85, 105, 0.15)',
    tooltipBg: isDark ? '#111111' : '#ffffff',
    tooltipText: isDark ? '#ffffff' : '#0f172a',
    tooltipBorder: isDark ? '#262626' : '#e2e8f0',
  };
}

export function abbreviateNumber(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);

  if (abs >= 1_000_000) {
    const scaled = number / 1_000_000;
    return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}M`;
  }

  if (abs >= 1_000) {
    const scaled = number / 1_000;
    return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}K`;
  }

  return `${number}`;
}

export function getThemedChartOptions(colorMode, overrides = {}) {
  const colors = getThemeColors(colorMode);

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 900,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: {
        labels: {
          color: colors.text,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          padding: 16,
          font: { size: 12, weight: 500 },
        },
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.tooltipText,
        bodyColor: colors.tooltipText,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        cornerRadius: 8,
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12.5 },
      },
    },
    scales: {
      x: {
        ticks: { color: colors.text, font: { size: 11.5 } },
        grid: { display: false },
        border: { color: colors.grid },
      },
      y: {
        ticks: { color: colors.text, font: { size: 11.5 } },
        grid: { color: colors.grid },
        border: { display: false },
      },
    },
  };

  if (overrides.scales === false) {
    const { scales, ...rest } = base;
    return deepMerge(rest, { ...overrides, scales: undefined });
  }

  return deepMerge(base, overrides);
}

function createVerticalGradient(color, alphaStart = 0x55, alphaEnd = 0x00) {
  return (context) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return `${color}22`;

    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, `${color}${alphaStart.toString(16).padStart(2, '0')}`);
    gradient.addColorStop(1, `${color}${alphaEnd.toString(16).padStart(2, '0')}`);
    return gradient;
  };
}

export function createChartDataset({
  label,
  data,
  colorIndex = 0,
  type = 'line',
  fill = false,
}) {
  const chartPalette = getChartPalette();
  const color = chartPalette[colorIndex % chartPalette.length];

  if (type === 'bar') {
    return {
      label,
      data,
      backgroundColor: createVerticalGradient(color, 0xe6, 0x66),
      hoverBackgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 34,
    };
  }

  if (type === 'line') {
    return {
      label,
      data,
      backgroundColor: fill ? createVerticalGradient(color, 0x40, 0x00) : `${color}33`,
      borderColor: color,
      borderWidth: 2.5,
      tension: 0.35,
      fill,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      pointHoverBorderWidth: 2,
    };
  }

  return {
    label,
    data,
    backgroundColor: data.map((_, i) => getChartPalette()[i % getChartPalette().length]),
    borderColor: 'transparent',
    borderWidth: 0,
  };
}

function deepMerge(base, overrides) {
  const result = { ...base };

  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      base[key]
    ) {
      result[key] = deepMerge(base[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }

  return result;
}
