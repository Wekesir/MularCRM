import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  Coins,
  Landmark,
  Loader2,
  Percent,
  PieChart,
  Receipt,
  RefreshCw,
  TrendingUp,
  UserCog,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { fetchOrgDashboard } from '../api/dashboard';
import SectionHeader from '../components/SectionHeader';
import StatCard from '../components/StatCard';
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
import { usePageActions } from '../context/PageActionsContext';
import { useSystemConfig } from '../context/SystemConfigContext';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import AgentDashboard from './dashboard/AgentDashboard';
import SeniorSupervisorDashboard from './dashboard/SeniorSupervisorDashboard';
import SupervisorDashboard from './dashboard/SupervisorDashboard';
import AgentPerformanceTable from './dashboard/AgentPerformanceTable';
import RecentActivityFeed from './dashboard/RecentActivityFeed';

function formatCount(n) {
  return Number(n || 0).toLocaleString();
}

function OrgDashboard() {
  const { colorMode } = useTheme();
  const { currencySymbol, themeColor } = useSystemConfig();
  const { setActions } = usePageActions();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const payload = await fetchOrgDashboard();
      setData(payload);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load dashboard');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    load();
    toast.info('Dashboard refreshed');
  }, [load]);

  useEffect(() => {
    setActions(
      <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
        <RefreshCw className="icon-sm" />
      </button>
    );
    return () => setActions(null);
  }, [setActions, handleRefresh]);

  const headcount = data?.headcount;
  const summary = data?.summary;
  const charts = data?.charts;
  const agentRows = data?.agentPerformance || [];

  const caseStatusTotal = useMemo(
    () => (charts?.caseStatus?.values || []).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [charts]
  );

  const statusData = useMemo(() => {
    const chartPalette = getChartPalette();
    return {
      labels: charts?.caseStatus?.labels || [],
      datasets: [
        {
          data: charts?.caseStatus?.values || [],
          backgroundColor: ['#dc2626', chartPalette[0], '#16a34a'],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
          spacing: 2,
        },
      ],
    };
  }, [charts, colorMode, themeColor]);

  const collectionData = useMemo(
    () => ({
      labels: charts?.collectionTrend?.labels || [],
      datasets: [
        createChartDataset({
          label: 'Collections',
          data: charts?.collectionTrend?.values || [],
          type: 'bar',
          colorIndex: 1,
        }),
      ],
    }),
    [charts, colorMode, themeColor]
  );

  const commissionsData = useMemo(
    () => ({
      labels: charts?.commissions?.labels || [],
      datasets: [
        createChartDataset({
          label: 'Commissions',
          data: charts?.commissions?.values || [],
          type: 'line',
          colorIndex: 4,
          fill: true,
        }),
      ],
    }),
    [charts, colorMode, themeColor]
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
    plugins: { legend: { position: 'bottom' } },
  });

  const collectionOptions = useChartOptions({
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { callback: (value) => abbreviateNumber(value) } },
    },
    animation: {
      duration: 1100,
      easing: 'easeOutQuart',
      delay: (context) =>
        context.type === 'data' && context.mode === 'default' ? context.dataIndex * 70 : 0,
    },
  });

  const commissionsOptions = useChartOptions({
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { callback: (value) => abbreviateNumber(value) } },
    },
  });

  if (isLoading && !data) {
    return (
      <div className="dashboard-page">
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Loader2 className="empty-state-icon-svg spin" />
          </div>
          <h2 className="empty-state-title">Loading dashboard</h2>
          <p className="empty-state-description">Pulling live portfolio, collections, and agent activity.</p>
        </div>
      </div>
    );
  }

  const moneyPrefix = `${currencySymbol} `;
  const callCenterOverview = data?.callCenterOverview;

  return (
    <div className="dashboard-page">
      {callCenterOverview?.summary && (
        <section className="stat-grid-compact" style={{ marginBottom: '1rem' }}>
          <StatCard
            icon={Building2}
            numericValue={callCenterOverview.summary.activeCallCenters || 0}
            label="Call Centers"
            meta="Active mini centers"
            accent="theme"
            variant="compact"
            className="dashboard-stat-card"
          />
          <StatCard
            icon={UsersRound}
            numericValue={callCenterOverview.summary.unassignedClients || 0}
            label="Unassigned Clients"
            meta="Awaiting center assignment"
            accent="#f59e0b"
            variant="compact"
            className="dashboard-stat-card"
          />
          <StatCard
            icon={UserCog}
            numericValue={callCenterOverview.summary.supervisors || 0}
            label="Supervisors"
            meta="Call center managers"
            accent="#8b5cf6"
            variant="compact"
            className="dashboard-stat-card"
          />
          <StatCard
            icon={UsersRound}
            numericValue={callCenterOverview.summary.agents || 0}
            label="Agents"
            meta="Collectors across centers"
            accent="#10b981"
            variant="compact"
            className="dashboard-stat-card"
          />
        </section>
      )}
      <section className="stat-grid-compact">
        <StatCard
          icon={UsersRound}
          numericValue={headcount?.activeDebtors || 0}
          label="Active Debtors"
          meta="Accounts in active recovery"
          accent="theme"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 0 }}
        />
        <StatCard
          icon={Building2}
          numericValue={headcount?.totalClients || 0}
          label="Total Clients"
          meta="Portfolio owners onboarded"
          accent="#06b6d4"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 1 }}
        />
        <StatCard
          icon={UserCog}
          numericValue={headcount?.activeAgents || 0}
          label="Active Agents"
          meta="Collectors currently active"
          accent="#8b5cf6"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 2 }}
        />
      </section>

      <section className="stat-grid">
        <StatCard
          icon={Wallet}
          numericValue={summary?.loanTotal || 0}
          decimals={0}
          prefix={moneyPrefix}
          label="Outsourced Amount"
          meta={`${formatCount(summary?.fileCount)} batch files`}
          accent="theme"
          className="dashboard-stat-card"
          style={{ '--card-index': 3 }}
        />
        <StatCard
          icon={Coins}
          numericValue={summary?.collected || 0}
          decimals={0}
          prefix={moneyPrefix}
          label="Total Collected"
          meta={`${formatCount(summary?.debtorCount)} debtors`}
          accent="#10b981"
          className="dashboard-stat-card"
          style={{ '--card-index': 4 }}
        />
        <StatCard
          icon={Receipt}
          numericValue={summary?.outstanding || 0}
          decimals={0}
          prefix={moneyPrefix}
          label="Outstanding Amount"
          meta="Current balance"
          accent="#f59e0b"
          className="dashboard-stat-card"
          style={{ '--card-index': 5 }}
        />
        <StatCard
          icon={CalendarCheck2}
          numericValue={summary?.ptpAmount || 0}
          decimals={0}
          prefix={moneyPrefix}
          label="Promise To Pay"
          meta={`${formatCount(summary?.ptpCount)} accounts`}
          accent="#8b5cf6"
          className="dashboard-stat-card"
          style={{ '--card-index': 6 }}
        />
        <StatCard
          icon={AlertTriangle}
          numericValue={summary?.unconfirmedAmount || 0}
          decimals={0}
          prefix={moneyPrefix}
          label="Non-confirmed Payments"
          meta={`${formatCount(summary?.unconfirmedCount)} payment(s)`}
          accent="#ef4444"
          className="dashboard-stat-card"
          style={{ '--card-index': 7 }}
        />
        <StatCard
          icon={Percent}
          numericValue={summary?.successRate || 0}
          decimals={2}
          suffix="%"
          label="Success Rate"
          meta={`${formatCount(summary?.callCount)} calls`}
          progress={summary?.successRate || 0}
          accent="#06b6d4"
          className="dashboard-stat-card"
          style={{ '--card-index': 8 }}
        />
      </section>

      <section className="chart-grid chart-grid-3">
        <ChartCard
          title="Case Status"
          description="Unassigned · Assigned · Actioned"
          icon={PieChart}
          accent="var(--theme-color)"
          height={300}
        >
          <Doughnut data={statusData} options={statusOptions} plugins={[centerTextPlugin]} />
        </ChartCard>

        <ChartCard
          title="Collection Trend"
          description={`Monthly collections (${currencySymbol})`}
          icon={TrendingUp}
          accent="#10b981"
          height={300}
        >
          <Bar data={collectionData} options={collectionOptions} />
        </ChartCard>

        <ChartCard
          title="Commissions"
          description={charts?.commissions?.year || String(new Date().getFullYear())}
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
            count={agentRows.length}
            badge="Live"
            linkTo="/management/agent-management"
            linkLabel="View All ->"
          />
          <AgentPerformanceTable rows={agentRows} />
        </div>

        <div className="dashboard-bottom-card">
          <RecentActivityFeed
            initialActivities={data?.recentActivity || []}
            onRefresh={() => load({ silent: true })}
            title="Recent Activities"
          />
        </div>
      </section>
    </div>
  );
}

function Dashboard() {
  const { isAgent, isSeniorSupervisor, isSupervisor, isSystemAdmin } = usePermissions();
  if (isAgent) return <AgentDashboard />;
  if (isSeniorSupervisor && !isSystemAdmin) return <SeniorSupervisorDashboard />;
  if (isSupervisor && !isSystemAdmin) return <SupervisorDashboard />;
  return <OrgDashboard />;
}

export default Dashboard;
