import { useMemo } from 'react';
import {
  BarChart3,
  Layers,
  PieChart,
  Radar as RadarIcon,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  ChartCard,
  Doughnut,
  Line,
  Radar,
  abbreviateNumber,
  createChartDataset,
  getChartPalette,
  getThemeColors,
  getThemedChartOptions,
  useChartOptions,
} from '../charts';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useTheme } from '../../context/ThemeContext';

const TYPE_META = {
  doughnut: { label: 'Donut', icon: PieChart, accent: 'var(--theme-color)' },
  pie: { label: 'Pie', icon: PieChart, accent: 'var(--theme-color)' },
  radar: { label: 'Radar', icon: RadarIcon, accent: '#8b5cf6' },
  'stacked-bar': { label: 'Stacked', icon: Layers, accent: '#06b6d4' },
  line: { label: 'Trend', icon: TrendingUp, accent: '#10b981' },
  bar: { label: 'Bar', icon: BarChart3, accent: '#10b981' },
};

const ACCENT_BY_ID = {
  outstandingByBucket: '#f59e0b',
  debtorsByBucket: 'var(--theme-color)',
  statusMix: '#8b5cf6',
  assignmentMix: '#06b6d4',
  recoveryByClient: '#10b981',
  topCollected: '#10b981',
  collectorProfile: '#8b5cf6',
};

function hasPlottableData(seriesItem) {
  const values = (seriesItem.datasets || []).flatMap((ds) => ds.data || []);
  return values.some((v) => Number(v) > 0);
}

function truncateLabel(label, max = 18) {
  const text = String(label ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildChartData(seriesItem) {
  const palette = getChartPalette();
  const type = seriesItem.type;
  const labels = (seriesItem.labels || []).map((label) =>
    type === 'bar' && seriesItem.indexAxis === 'y' ? truncateLabel(label, 16) : truncateLabel(label, 22)
  );

  if (type === 'doughnut' || type === 'pie') {
    const data = seriesItem.datasets?.[0]?.data || [];
    return {
      labels: seriesItem.labels || [],
      datasets: [
        {
          data,
          backgroundColor: data.map((_, i) => palette[i % palette.length]),
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 8,
          spacing: 3,
        },
      ],
    };
  }

  if (type === 'radar') {
    return {
      labels: seriesItem.labels || [],
      datasets: (seriesItem.datasets || []).map((ds, index) => {
        const color = palette[index % palette.length];
        return {
          label: ds.label,
          data: ds.data || [],
          borderColor: color,
          backgroundColor: `${color}28`,
          borderWidth: 2,
          pointBackgroundColor: color,
          pointBorderColor: '#fff',
          pointRadius: 3,
          pointHoverRadius: 5,
        };
      }),
    };
  }

  if (type === 'stacked-bar') {
    return {
      labels,
      datasets: (seriesItem.datasets || []).map((ds, index) =>
        createChartDataset({
          label: ds.label,
          data: ds.data || [],
          type: 'bar',
          colorIndex: index === 0 ? 0 : 2,
        })
      ),
    };
  }

  return {
    labels,
    datasets: (seriesItem.datasets || []).map((ds, index) =>
      createChartDataset({
        label: ds.label || 'Value',
        data: ds.data || [],
        type: type === 'line' ? 'line' : 'bar',
        colorIndex: index,
        fill: type === 'line',
      })
    ),
  };
}

function canvasHeight(item) {
  const labelCount = (item.labels || []).length;
  if (item.type === 'radar') return 300;
  if (item.type === 'doughnut' || item.type === 'pie') return 260;
  if (item.indexAxis === 'y') return Math.min(360, Math.max(220, labelCount * 34 + 56));
  if (item.type === 'stacked-bar') return 280;
  return 260;
}

function ReportCharts({ series = [] }) {
  const { colorMode } = useTheme();
  const { currencySymbol } = useSystemConfig();

  const items = useMemo(
    () => (Array.isArray(series) ? series.filter((item) => item && hasPlottableData(item)) : []),
    [series]
  );

  const doughnutOptions = useChartOptions({
    scales: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 14, boxWidth: 8 },
      },
    },
  });

  const horizontalBarOptions = useChartOptions({
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { callback: (value) => abbreviateNumber(value), maxTicksLimit: 5 },
        grid: { drawBorder: false },
      },
      y: {
        ticks: { autoSkip: false, font: { size: 11 } },
        grid: { display: false },
      },
    },
    layout: { padding: { right: 8 } },
  });

  const verticalBarOptions = useChartOptions({
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { callback: (value) => abbreviateNumber(value), maxTicksLimit: 5 } },
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
    },
  });

  const stackedBarOptions = useChartOptions({
    plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 8 } } },
    scales: {
      x: {
        stacked: true,
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        stacked: true,
        ticks: { callback: (value) => abbreviateNumber(value), maxTicksLimit: 5 },
      },
    },
  });

  const radarOptions = useMemo(() => {
    const colors = getThemeColors(colorMode);
    const base = getThemedChartOptions(colorMode, {
      scales: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 8 } } },
    });
    return {
      ...base,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false, stepSize: 25, color: colors.textMuted },
          grid: { color: colors.grid },
          angleLines: { color: colors.grid },
          pointLabels: { color: colors.text, font: { size: 11, weight: 500 } },
        },
      },
    };
  }, [colorMode]);

  const percentBarOptions = useChartOptions({
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: { callback: (value) => `${value}%`, maxTicksLimit: 5 },
      },
      y: {
        ticks: { autoSkip: false, font: { size: 11 } },
        grid: { display: false },
      },
    },
  });

  const centerPlugins = useMemo(() => {
    const colors = getThemeColors(colorMode);
    return items
      .filter((item) => item.type === 'doughnut' || item.type === 'pie')
      .map((item) => {
        const total = (item.datasets?.[0]?.data || []).reduce((sum, n) => sum + (Number(n) || 0), 0);
        return {
          id: `center-${item.id}`,
          afterDraw(chart) {
            if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 1.5rem system-ui, -apple-system, sans-serif';
            ctx.fillStyle = colors.tooltipText;
            ctx.fillText(abbreviateNumber(total), centerX, centerY - 8);
            ctx.font = '500 0.7rem system-ui, -apple-system, sans-serif';
            ctx.fillStyle = colors.textMuted;
            ctx.fillText('Total', centerX, centerY + 12);
            ctx.restore();
          },
        };
      });
  }, [items, colorMode]);

  if (items.length === 0) return null;

  const gridClass =
    items.length >= 3 ? 'chart-grid-3' : items.length === 2 ? 'chart-grid-2' : 'chart-grid-1';

  return (
    <section className="rpt-charts-panel" aria-label="Report visualizations">
      <div className="rpt-charts-toolbar">
        <div className="rpt-charts-toolbar-left">
          <h2 className="rpt-table-title">Visualizations</h2>
          <span className="rpt-table-count-badge">
            {items.length} chart{items.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="rpt-charts-toolbar-hint">Updates with your active filters</p>
      </div>

      <div className={`rpt-charts-body chart-grid ${gridClass}`}>
        {items.map((item, index) => {
          const chartData = buildChartData(item);
          const typeMeta = TYPE_META[item.type] || TYPE_META.bar;
          const Icon = typeMeta.icon;
          const accent = ACCENT_BY_ID[item.id] || typeMeta.accent;
          const isHorizontal = item.indexAxis === 'y';
          const isPercent =
            item.id === 'recoveryByClient' ||
            String(item.datasets?.[0]?.label || '')
              .toLowerCase()
              .includes('%');

          let options = verticalBarOptions;
          if (item.type === 'doughnut' || item.type === 'pie') options = doughnutOptions;
          else if (item.type === 'radar') options = radarOptions;
          else if (item.type === 'stacked-bar') options = stackedBarOptions;
          else if (isPercent) options = percentBarOptions;
          else if (isHorizontal) options = horizontalBarOptions;

          const description =
            item.description ||
            (item.type === 'doughnut'
              ? 'Distribution of filtered results'
              : `Values in ${currencySymbol || 'KES'}`);

          const plugin =
            item.type === 'doughnut' || item.type === 'pie'
              ? centerPlugins.find((p) => p.id === `center-${item.id}`)
              : null;

          return (
            <ChartCard
              key={item.id || item.title}
              title={item.title}
              description={description}
              icon={Icon}
              badge={typeMeta.label}
              accent={accent}
              height={canvasHeight(item)}
              className={`rpt-chart-card ${items.length === 1 ? 'chart-grid-span-full' : ''}`}
              style={{ '--card-index': index }}
            >
              {(item.type === 'doughnut' || item.type === 'pie') && (
                <Doughnut
                  data={chartData}
                  options={options}
                  plugins={plugin ? [plugin] : undefined}
                />
              )}
              {item.type === 'radar' && <Radar data={chartData} options={options} />}
              {item.type === 'line' && <Line data={chartData} options={options} />}
              {(item.type === 'bar' || item.type === 'stacked-bar') && (
                <Bar data={chartData} options={options} />
              )}
            </ChartCard>
          );
        })}
      </div>
    </section>
  );
}

export default ReportCharts;
