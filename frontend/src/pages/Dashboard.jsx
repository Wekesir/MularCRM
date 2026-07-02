import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CircleDollarSign,
  Coins,
  PieChart,
  Landmark,
  Percent,
  Receipt,
  TrendingUp,
  UserCog,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import SectionHeader from '../components/SectionHeader';
import StatCard from '../components/StatCard';
import { useSystemConfig } from '../context/SystemConfigContext';
import { useTheme } from '../context/ThemeContext';
import {
  Bar,
  ChartCard,
  Doughnut,
  Line,
  createChartDataset,
  getChartPalette,
  getThemeColors,
  abbreviateNumber,
  useChartOptions,
} from '../components/charts';
import AgentPerformanceTable from './dashboard/AgentPerformanceTable';
import RecentActivityFeed from './dashboard/RecentActivityFeed';
import {
  agentPerformanceRows,
  buildRecentActivities,
  caseStatusChart,
  collectionTrendChart,
  commissionsChart,
  dashboardHeadcountStats,
  dashboardStats,
} from './dashboard/dashboardMockData';

const STAT_ICON_MAP = {
  users: UsersRound,
  building: Building2,
  agent: UserCog,
  wallet: Wallet,
  coins: Coins,
  receipt: Receipt,
  calendar: CalendarCheck2,
  alert: AlertTriangle,
  percent: Percent,
};

function Dashboard() {
  const { colorMode } = useTheme();
  const { themeColor } = useSystemConfig();
  const recentActivities = useMemo(() => buildRecentActivities(), []);

  const caseStatusTotal = useMemo(
    () => caseStatusChart.values.reduce((sum, value) => sum + value, 0),
    []
  );

  const statusData = useMemo(
    () => {
      const chartPalette = getChartPalette();
      return {
        labels: caseStatusChart.labels,
        datasets: [
          {
            data: caseStatusChart.values,
            backgroundColor: ['#dc2626', chartPalette[0], '#16a34a'],
            borderColor: 'transparent',
            borderWidth: 0,
            hoverOffset: 6,
            spacing: 2,
          },
        ],
      };
    },
    [colorMode, themeColor]
  );

  const collectionData = useMemo(
    () => ({
      labels: collectionTrendChart.labels,
      datasets: [
        createChartDataset({
          label: 'Collections',
          data: collectionTrendChart.values,
          type: 'bar',
          colorIndex: 1,
        }),
      ],
    }),
    [colorMode, themeColor]
  );

  const commissionsData = useMemo(
    () => ({
      labels: commissionsChart.labels,
      datasets: [
        createChartDataset({
          label: 'Commissions',
          data: commissionsChart.values,
          type: 'line',
          colorIndex: 4,
          fill: true,
        }),
      ],
    }),
    [colorMode, themeColor]
  );

  const centerTextPlugin = useMemo(() => {
    const colors = getThemeColors(colorMode);

    return {
      id: 'caseStatusCenterText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;

        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 1.75rem system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.tooltipText;
        ctx.fillText(String(caseStatusTotal), centerX, centerY - 10);
        ctx.font = '500 0.75rem system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.textMuted;
        ctx.fillText('Total Cases', centerX, centerY + 14);
        ctx.restore();
      },
    };
  }, [colorMode, caseStatusTotal]);

  const statusOptions = useChartOptions({
    scales: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  });

  const collectionOptions = useChartOptions({
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        ticks: { callback: (value) => abbreviateNumber(value) },
      },
    },
    animation: {
      duration: 1100,
      easing: 'easeOutQuart',
      delay: (context) =>
        context.type === 'data' && context.mode === 'default' ? context.dataIndex * 70 : 0,
    },
  });

  const commissionsOptions = useChartOptions({
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        ticks: { callback: (value) => abbreviateNumber(value) },
      },
    },
  });

  return (
    <div className="dashboard-page">
      <section className="stat-grid-compact">
        {dashboardHeadcountStats.map((stat, index) => {
          const Icon = STAT_ICON_MAP[stat.iconKey];

          return (
            <StatCard
              key={stat.id}
              icon={Icon}
              numericValue={stat.numericValue}
              decimals={stat.decimals}
              prefix={stat.prefix}
              suffix={stat.suffix}
              label={stat.label}
              meta={stat.meta}
              accent={stat.accent}
              variant="compact"
              className="dashboard-stat-card"
              style={{ '--card-index': index }}
            />
          );
        })}
      </section>

      <section className="stat-grid">
        {dashboardStats.map((stat, index) => {
          const Icon = STAT_ICON_MAP[stat.iconKey];

          return (
            <StatCard
              key={stat.id}
              icon={Icon}
              numericValue={stat.numericValue}
              decimals={stat.decimals}
              prefix={stat.prefix}
              suffix={stat.suffix}
              label={stat.label}
              meta={stat.meta}
              progress={stat.progress}
              accent={stat.accent}
              className="dashboard-stat-card"
              style={{ '--card-index': dashboardHeadcountStats.length + index }}
            />
          );
        })}
      </section>

      <section className="chart-grid chart-grid-3">
        <ChartCard
          title="Case Status"
          description="Open case distribution"
          icon={PieChart}
          accent="var(--theme-color)"
          height={300}
        >
          <Doughnut data={statusData} options={statusOptions} plugins={[centerTextPlugin]} />
        </ChartCard>

        <ChartCard
          title="Collection Trend"
          description="Monthly collections (KSh)"
          icon={TrendingUp}
          accent="#10b981"
          height={300}
        >
          <Bar data={collectionData} options={collectionOptions} />
        </ChartCard>

        <ChartCard
          title="Commissions"
          description={commissionsChart.year}
          icon={Landmark}
          accent="#8b5cf6"
          height={300}
        >
          <Line data={commissionsData} options={commissionsOptions} />
        </ChartCard>
      </section>

      <section className="dashboard-bottom-grid">
        <div className="dashboard-bottom-card">
          <SectionHeader
            icon={UserCog}
            title="Agent Performance"
            count={agentPerformanceRows.length}
            badge="Today"
            linkTo="/management/agent-management"
            linkLabel="View All ->"
          />
          <AgentPerformanceTable rows={agentPerformanceRows} />
        </div>

        <div className="dashboard-bottom-card">
          <RecentActivityFeed initialActivities={recentActivities} />
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
