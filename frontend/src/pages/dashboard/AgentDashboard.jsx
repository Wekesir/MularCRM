import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CalendarCheck2,
  CircleDollarSign,
  Coins,
  Mail,
  MessageSquare,
  Percent,
  Phone,
  PieChart,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import StatCard from '../../components/StatCard';
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
} from '../../components/charts';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useTheme } from '../../context/ThemeContext';
import { useCountUp } from '../../hooks/useCountUp';
import { fetchAgentDashboard } from '../../api/agentDashboard';
import RecentActivityFeed from './RecentActivityFeed';

const PERIODS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
];

const KPI_META = {
  calls: { color: 'var(--theme-color)', icon: Phone },
  collection: { color: '#10b981', icon: Coins },
  sms: { color: '#06b6d4', icon: MessageSquare },
  emails: { color: '#8b5cf6', icon: Mail },
  ptpVolume: { color: '#f59e0b', icon: CalendarCheck2 },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMoney(value, symbol) {
  const n = Number(value) || 0;
  return `${symbol} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Animated SVG circular progress ring */
function KpiRing({ progress, color, size = 80 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const target = circ - (Math.min(100, Math.max(0, Number(progress) || 0)) / 100) * circ;
  const [offset, setOffset] = useState(circ);

  useEffect(() => {
    const t = setTimeout(() => setOffset(target), 120);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="adash-kpi-ring-svg" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={7} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
    </svg>
  );
}

/** Animated count-up stat inside the hero banner */
function HeroStat({ label, value, prefix = '', suffix = '', decimals = 0 }) {
  const raw = useCountUp(Number(value) || 0, { decimals, duration: 1200 });
  const display =
    decimals > 0
      ? raw.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(raw).toLocaleString();
  return (
    <div className="adash-hero-stat">
      <p className="adash-hero-stat-value">
        {prefix}
        {display}
        {suffix}
      </p>
      <p className="adash-hero-stat-label">{label}</p>
    </div>
  );
}

/** Pulsing skeleton shown while data is loading */
function DashSkeleton() {
  return (
    <div className="adash-skeleton-wrap">
      <div className="adash-skel adash-skel-hero" />
      <div className="adash-skel-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adash-skel adash-skel-stat" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="adash-skel-row adash-skel-row--kpi">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="adash-skel adash-skel-kpi" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="adash-skel-row adash-skel-row--charts">
        <div className="adash-skel adash-skel-chart-lg" />
        <div className="adash-skel adash-skel-chart-sm" />
      </div>
    </div>
  );
}

function AgentDashboard() {
  const { setActions } = usePageActions();
  const { currencySymbol, themeColor } = useSystemConfig();
  const { colorMode } = useTheme();

  const [period, setPeriod] = useState('daily');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setIsLoading(true);
      try {
        const payload = await fetchAgentDashboard({ period });
        setData(payload);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load your dashboard');
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    load();
    toast.info('Dashboard refreshed');
  }, [load]);

  useEffect(() => {
    setActions(
      <>
        <div className="agent-dash-period" role="group" aria-label="Dashboard period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={period === p.value ? 'agent-dash-period-btn is-active' : 'agent-dash-period-btn'}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
          <RefreshCw className="icon-sm" />
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, handleRefresh, period]);

  const summary = data?.summary;
  const activity = data?.activity;
  const kpiItems = data?.kpi?.items || [];
  const charts = data?.charts;
  const agentName = data?.agent?.name || '';

  const firstName = agentName ? agentName.trim().split(' ')[0] : '';
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'Today';

  const contactsMade = useMemo(
    () =>
      (Number(activity?.calls) || 0) +
      (Number(activity?.sms) || 0) +
      (Number(activity?.emails) || 0) +
      (Number(activity?.whatsapp) || 0),
    [activity]
  );

  const portfolioTotal = useMemo(
    () => (charts?.caseStatus?.values || []).reduce((s, v) => s + (Number(v) || 0), 0),
    [charts]
  );

  const statusData = useMemo(() => {
    const palette = getChartPalette();
    return {
      labels: charts?.caseStatus?.labels || [],
      datasets: [
        {
          data: charts?.caseStatus?.values || [],
          backgroundColor: ['#f59e0b', palette[0], '#16a34a'],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
          spacing: 2,
        },
      ],
    };
  }, [charts, colorMode, themeColor]);

  const contactMixData = useMemo(() => {
    const palette = getChartPalette();
    return {
      labels: charts?.contactMix?.labels || [],
      datasets: [
        {
          data: charts?.contactMix?.values || [],
          backgroundColor: [palette[0], '#06b6d4', '#8b5cf6', '#10b981'],
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

  const contactTrendData = useMemo(
    () => ({
      labels: charts?.contactTrend?.labels || [],
      datasets: [
        createChartDataset({
          label: 'Contacts',
          data: charts?.contactTrend?.values || [],
          type: 'line',
          colorIndex: 0,
          fill: true,
        }),
      ],
    }),
    [charts, colorMode, themeColor]
  );

  const centerTextPlugin = useMemo(() => {
    const colors = getThemeColors(colorMode);
    return {
      id: 'agentPortfolioStatusCenter',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 1.75rem system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.tooltipText;
        ctx.fillText(String(portfolioTotal), cx, cy - 10);
        ctx.font = '500 0.75rem system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.textMuted;
        ctx.fillText('Portfolio', cx, cy + 14);
        ctx.restore();
      },
    };
  }, [colorMode, portfolioTotal]);

  const doughnutOptions = useChartOptions({
    scales: false,
    cutout: '70%',
    plugins: { legend: { position: 'bottom' } },
  });

  const collectionOptions = useChartOptions({
    plugins: { legend: { display: false } },
    scales: { y: { ticks: { callback: (v) => abbreviateNumber(v) } } },
    animation: {
      duration: 1100,
      easing: 'easeOutQuart',
      delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * 70 : 0),
    },
  });

  const contactTrendOptions = useChartOptions({
    plugins: { legend: { display: false } },
    scales: { y: { ticks: { precision: 0 } } },
  });

  if (isLoading && !data) return <DashSkeleton />;

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="dashboard-page agent-dashboard">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="adash-hero">
        <div className="adash-hero-deco adash-hero-deco--1" aria-hidden="true" />
        <div className="adash-hero-deco adash-hero-deco--2" aria-hidden="true" />
        <div className="adash-hero-inner">
          <div className="adash-hero-left">
            <p className="adash-hero-eyebrow">{todayFormatted}</p>
            <p className="adash-hero-greeting">
              {getGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </p>
            <p className="adash-hero-date">
              Your {periodLabel.toLowerCase()} performance at a glance
            </p>
            <div className="adash-hero-actions">
              <Link to="/case-management/my-portfolio" className="adash-hero-cta">
                <Briefcase className="icon-sm" aria-hidden="true" />
                My Portfolio
                <ArrowRight className="icon-sm" aria-hidden="true" />
              </Link>
              <Link to="/payments/ptp" className="adash-hero-cta adash-hero-cta--ghost">
                <CalendarCheck2 className="icon-sm" aria-hidden="true" />
                PTP
              </Link>
            </div>
          </div>
          <div className="adash-hero-stats" aria-label="Key performance metrics">
            <HeroStat
              label={`${periodLabel}'s Collections`}
              value={summary?.periodCollected}
              prefix={`${currencySymbol} `}
            />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Recovery Rate" value={summary?.recoveryRate} suffix="%" decimals={1} />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Active PTPs" value={summary?.ptpCount} />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Contacts Made" value={contactsMade} />
          </div>
        </div>
      </div>

      {/* ── Portfolio Stats ──────────────────────────────── */}
      <section className="adash-stats-grid" aria-label="Portfolio financials">
        <StatCard
          icon={Coins}
          numericValue={summary?.collected || 0}
          decimals={0}
          prefix={`${currencySymbol} `}
          label="Total Collected"
          meta={`${periodLabel}: ${formatMoney(summary?.periodCollected || 0, currencySymbol)}`}
          accent="#10b981"
          className="dashboard-stat-card"
          style={{ '--card-index': 0 }}
        />
        <StatCard
          icon={Wallet}
          numericValue={summary?.outstanding || 0}
          decimals={0}
          prefix={`${currencySymbol} `}
          label="Outstanding Balance"
          meta={`Book: ${formatMoney(summary?.loanTotal || 0, currencySymbol)}`}
          accent="#f59e0b"
          className="dashboard-stat-card"
          style={{ '--card-index': 1 }}
        />
        <StatCard
          icon={CalendarCheck2}
          numericValue={summary?.ptpCount || 0}
          label="Promise To Pay"
          meta={formatMoney(summary?.ptpAmount || 0, currencySymbol)}
          accent="#8b5cf6"
          className="dashboard-stat-card"
          style={{ '--card-index': 2 }}
        />
        <StatCard
          icon={CircleDollarSign}
          numericValue={summary?.commissionsEarned || 0}
          decimals={0}
          prefix={`${currencySymbol} `}
          label="Commissions Earned"
          meta={`${summary?.unconfirmedPayments || 0} unconfirmed payment(s)`}
          accent="#ec4899"
          className="dashboard-stat-card"
          style={{ '--card-index': 3 }}
        />
      </section>

      {/* ── Contact Activity ─────────────────────────────── */}
      <section aria-label="Contact activity">
        <SectionHeader icon={Phone} title="Contact Activity" count={contactsMade} />
        <div className="adash-activity-strip" role="group" aria-label={`${periodLabel} contact summary`}>
          <div className="adash-activity-pill adash-activity-pill--calls">
            <span className="adash-activity-pill-icon" aria-hidden="true">
              <Phone className="icon-sm" />
            </span>
            <div className="adash-activity-pill-text">
              <span className="adash-activity-pill-count">
                {(activity?.calls || 0).toLocaleString()}
              </span>
              <span className="adash-activity-pill-label">Calls</span>
            </div>
          </div>
          <div className="adash-activity-pill adash-activity-pill--sms">
            <span className="adash-activity-pill-icon" aria-hidden="true">
              <MessageSquare className="icon-sm" />
            </span>
            <div className="adash-activity-pill-text">
              <span className="adash-activity-pill-count">
                {(activity?.sms || 0).toLocaleString()}
              </span>
              <span className="adash-activity-pill-label">SMS</span>
            </div>
          </div>
          <div className="adash-activity-pill adash-activity-pill--email">
            <span className="adash-activity-pill-icon" aria-hidden="true">
              <Mail className="icon-sm" />
            </span>
            <div className="adash-activity-pill-text">
              <span className="adash-activity-pill-count">
                {(activity?.emails || 0).toLocaleString()}
              </span>
              <span className="adash-activity-pill-label">Email</span>
            </div>
          </div>
          <div className="adash-activity-pill adash-activity-pill--whatsapp">
            <span className="adash-activity-pill-icon" aria-hidden="true">
              <MessageSquare className="icon-sm" />
            </span>
            <div className="adash-activity-pill-text">
              <span className="adash-activity-pill-count">
                {(activity?.whatsapp || 0).toLocaleString()}
              </span>
              <span className="adash-activity-pill-label">WhatsApp</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI Progress ─────────────────────────────────── */}
      {kpiItems.length > 0 && (
        <section className="agent-kpi-section">
          <SectionHeader icon={Target} title="KPI Progress" count={kpiItems.length} />
          <div className="adash-kpi-grid">
            {kpiItems.map((item, index) => {
              const meta = KPI_META[item.key] || { color: 'var(--theme-color)', icon: Target };
              const IconComp = meta.icon;
              const isComplete = (item.progress || 0) >= 100;
              return (
                <article
                  key={item.key}
                  className={`adash-kpi-card dashboard-stat-card${isComplete ? ' is-complete' : ''}`}
                  style={{ '--card-index': 4 + index, '--kpi-color': meta.color }}
                >
                  <div className="adash-kpi-ring-wrap">
                    <KpiRing
                      progress={item.progress}
                      color={isComplete ? '#16a34a' : meta.color}
                      size={76}
                    />
                    <div className="adash-kpi-ring-center" aria-hidden="true">
                      <span className="adash-kpi-ring-pct">
                        {Math.round(item.progress || 0)}
                        <span className="adash-kpi-ring-pct-sym">%</span>
                      </span>
                    </div>
                  </div>
                  <div className="adash-kpi-card-body">
                    <div className="adash-kpi-card-label-row">
                      <span className="adash-kpi-icon-wrap" aria-hidden="true">
                        <IconComp className="icon-sm" />
                      </span>
                      <span className="adash-kpi-name">{item.label}</span>
                    </div>
                    <p className="adash-kpi-actual">
                      {item.kind === 'money'
                        ? formatMoney(item.actual, currencySymbol)
                        : Number(item.actual || 0).toLocaleString()}
                    </p>
                    <p className="adash-kpi-target">
                      Target:{' '}
                      {item.kind === 'money'
                        ? formatMoney(item.target, currencySymbol)
                        : Number(item.target || 0).toLocaleString()}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Charts ───────────────────────────────────────── */}
      <section className="chart-grid-agent">
        <ChartCard
          title="Collection Trend"
          description={`${periodLabel} confirmed collections`}
          icon={TrendingUp}
          accent="#10b981"
          height={320}
        >
          <Bar data={collectionData} options={collectionOptions} />
        </ChartCard>

        <div className="adash-doughnut-stack">
          <ChartCard
            title="Portfolio Status"
            description="Open · PTP · Closed"
            icon={PieChart}
            accent="var(--theme-color)"
            height={220}
          >
            <Doughnut data={statusData} options={doughnutOptions} plugins={[centerTextPlugin]} />
          </ChartCard>
          <ChartCard
            title="Channel Mix"
            description="Calls, SMS, email & WhatsApp"
            icon={MessageSquare}
            accent="#06b6d4"
            height={220}
          >
            <Doughnut data={contactMixData} options={doughnutOptions} />
          </ChartCard>
        </div>
      </section>

      {/* ── Contact Volume + Activity Feed ───────────────── */}
      <section className="adash-bottom-section">
        <ChartCard
          title="Contact Volume"
          description="All channels combined, over time"
          icon={Percent}
          accent="var(--theme-color)"
          height={260}
        >
          <Line data={contactTrendData} options={contactTrendOptions} />
        </ChartCard>

        <div className="dashboard-bottom-card">
          <RecentActivityFeed
            initialActivities={data?.recentActivity || []}
            onRefresh={() => load({ silent: true })}
            title="My Recent Activity"
          />
        </div>
      </section>
    </div>
  );
}

export default AgentDashboard;
