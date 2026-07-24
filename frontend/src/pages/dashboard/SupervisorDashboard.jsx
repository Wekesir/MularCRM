import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FileStack,
  PieChart,
  RefreshCw,
  Users,
  Wallet,
  AlertCircle,
  Headphones,
  TrendingUp,
  UserCog,
  ArrowUpRight,
  CalendarClock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchOrgDashboard } from '../../api/dashboard';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import {
  Bar,
  ChartCard,
  Doughnut,
  abbreviateNumber,
  createChartDataset,
  getChartPalette,
  useChartOptions,
} from '../../components/charts';
import { usePageActions } from '../../context/PageActionsContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useTheme } from '../../context/ThemeContext';
import { usePermissions } from '../../hooks/usePermissions';

function formatCount(n) {
  return Number(n || 0).toLocaleString();
}

function formatMoney(n, symbol = 'KES') {
  return `${symbol} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SupervisorDashboard() {
  const { setActions } = usePageActions();
  const { currencySymbol, themeColor } = useSystemConfig();
  const { colorMode } = useTheme();
  const { callCenterName } = usePermissions();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await fetchOrgDashboard();
      setData(payload);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setActions(
      <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
        <RefreshCw className="icon-sm" />
      </button>
    );
    return () => setActions(null);
  }, [load, setActions]);

  const summary = data?.summary || {};
  const centerLabel = data?.callCenter?.name || callCenterName || 'Your call center';
  const newBatches = data?.newBatches || [];
  const agents = data?.agents || [];
  const hasNewBatches = newBatches.length > 0;
  const assignedCases = Number(summary.assignedCases) || 0;
  const unassignedCases = Number(summary.unassignedCases) || 0;

  const assignmentData = useMemo(() => {
    const palette = getChartPalette();
    return {
      labels: ['Assigned', 'Unassigned'],
      datasets: [
        {
          data: [assignedCases, unassignedCases],
          backgroundColor: [palette[0], '#f59e0b'],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
          spacing: 2,
        },
      ],
    };
  }, [assignedCases, unassignedCases, colorMode, themeColor]);

  const agentLoadData = useMemo(() => {
    const top = [...agents]
      .sort((a, b) => Number(b.casesAssigned || 0) - Number(a.casesAssigned || 0))
      .slice(0, 8);
    return {
      labels: top.map((a) => a.name),
      datasets: [
        createChartDataset({
          label: 'Cases',
          data: top.map((a) => Number(a.casesAssigned) || 0),
          type: 'bar',
          colorIndex: 4,
        }),
      ],
      _count: top.length,
    };
  }, [agents, colorMode, themeColor]);

  const doughnutOptions = useChartOptions({
    scales: false,
    cutout: '68%',
    plugins: { legend: { position: 'bottom' } },
  });

  const agentLoadOptions = useChartOptions({
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { callback: (value) => abbreviateNumber(value) } },
    },
  });

  if (isLoading && !data) {
    return (
      <div className="dashboard-page">
        <div className="ss-loading">
          <div className="ss-loading-spinner" />
          <p className="ss-loading-text">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (data?.message && !data?.callCenter) {
    return (
      <div className="dashboard-page">
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <AlertCircle className="empty-state-icon-svg" />
          </div>
          <h2 className="empty-state-title">No call center assigned</h2>
          <p className="empty-state-description">{data.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page space-y-8">
      {/* Context header banner */}
      <div className="sv-center-banner">
        <div className="sv-center-banner-icon" aria-hidden="true">
          <Headphones className="sv-center-banner-icon-svg" />
        </div>
        <div className="sv-center-banner-body">
          <p className="sv-center-banner-label">Managing portfolios for</p>
          <p className="sv-center-banner-name">{centerLabel}</p>
        </div>
        <div className="sv-center-banner-hint">
          <p>New client batches appear here automatically after upload.</p>
        </div>
      </div>

      {/* Alert: unassigned cases */}
      {Number(summary.unassignedCases || 0) > 0 && (
        <div className="ss-alert ss-alert--warn">
          <AlertCircle className="ss-alert-icon" />
          <div className="ss-alert-body">
            <p className="ss-alert-title">
              {formatCount(summary.unassignedCases)} case
              {Number(summary.unassignedCases) !== 1 ? 's' : ''} awaiting assignment
            </p>
            <p className="ss-alert-desc">
              Assign these cases to agents before they become overdue.
            </p>
          </div>
          <Link to="/case-management/unassigned-files" className="ss-alert-link">
            Assign now <ArrowUpRight className="icon-sm" />
          </Link>
        </div>
      )}

      {/* Leave / coverage active */}
      {Number(summary.activeCoverages || 0) > 0 && (
        <div className="ss-alert ss-alert--info">
          <CalendarClock className="ss-alert-icon" />
          <div className="ss-alert-body">
            <p className="ss-alert-title">
              {formatCount(summary.activeCoverages)} leave coverage
              {Number(summary.activeCoverages) !== 1 ? 's' : ''} active
            </p>
            <p className="ss-alert-desc">
              Covering agents can work those portfolios; ownership stays with the absent agent.
            </p>
          </div>
          <Link to="/management/agent-management" className="ss-alert-link">
            Manage <ArrowUpRight className="icon-sm" />
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <section
        className="cm-stat-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}
      >
        <StatCard icon={Building2} value={formatCount(summary.clients)} label="Clients" />
        <StatCard icon={Users} value={formatCount(summary.agents)} label="Agents" />
        <StatCard
          icon={FileStack}
          value={formatCount(summary.newBatches)}
          label="Unallocated batches"
          accent={hasNewBatches ? '#f59e0b' : undefined}
        />
        <StatCard
          icon={AlertCircle}
          value={formatCount(summary.unassignedCases)}
          label="Unassigned cases"
          accent={Number(summary.unassignedCases || 0) > 0 ? '#ef4444' : undefined}
        />
        <StatCard
          icon={Wallet}
          value={formatMoney(summary.outstanding, currencySymbol)}
          label="Outstanding"
        />
        <StatCard
          icon={TrendingUp}
          value={formatMoney(summary.collected, currencySymbol)}
          label="Collected"
          accent="#10b981"
        />
      </section>

      {(assignedCases > 0 || unassignedCases > 0 || agentLoadData._count > 0) && (
        <section className="chart-grid chart-grid-2" aria-label="Call center charts">
          {(assignedCases > 0 || unassignedCases > 0) && (
            <ChartCard
              title="Case assignment"
              description="Assigned vs awaiting allocation"
              icon={PieChart}
              badge="Donut"
              accent="var(--theme-color)"
              height={280}
            >
              <Doughnut data={assignmentData} options={doughnutOptions} />
            </ChartCard>
          )}
          {agentLoadData._count > 0 && (
            <ChartCard
              title="Agent caseload"
              description="Open cases per agent"
              icon={UserCog}
              badge="Bar"
              accent="#8b5cf6"
              height={Math.max(240, agentLoadData._count * 34 + 48)}
            >
              <Bar data={agentLoadData} options={agentLoadOptions} />
            </ChartCard>
          )}
        </section>
      )}

      {/* New / unallocated batches */}
      <section className="cm-table-card">
        <SectionHeader
          icon={FileStack}
          title="New / unallocated batches"
          count={newBatches.length}
          linkTo="/case-management/unassigned-files"
          linkLabel="Unassigned Files →"
        />
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th">File</th>
                <th className="cm-th">Client</th>
                <th className="cm-th cm-th-num">Unassigned</th>
                <th className="cm-th cm-th-num">Loan total</th>
                <th className="cm-th">Uploaded</th>
                <th className="cm-th">Action</th>
              </tr>
            </thead>
            <tbody>
              {newBatches.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={6}>
                    <div className="cm-empty-state">
                      <div className="cm-empty-icon">
                        <FileStack />
                      </div>
                      <p className="cm-empty-title">No unallocated batches</p>
                      <p className="cm-empty-desc">
                        When a Senior Supervisor uploads a debtor batch bound to your call center, it appears here for you to allocate to agents.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                newBatches.map((batch) => {
                  const urgency = Number(batch.unassignedCases || 0);
                  return (
                    <tr key={batch.fileId} className="cm-table-row">
                      <td className="cm-td">
                        <div className="sv-file-cell">
                          <FileStack className="sv-file-icon" />
                          <span>{batch.fileName || `File #${batch.fileId}`}</span>
                        </div>
                      </td>
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="cm-client-avatar" aria-hidden="true">
                            <Building2 className="cm-client-avatar-icon" />
                          </span>
                          <span className="cm-client-name">{batch.clientName}</span>
                        </div>
                      </td>
                      <td className="cm-td cm-td-num">
                        <span
                          className={`sv-urgency-badge ${
                            urgency > 50
                              ? 'sv-urgency-badge--high'
                              : urgency > 10
                              ? 'sv-urgency-badge--mid'
                              : 'sv-urgency-badge--low'
                          }`}
                        >
                          {urgency}
                        </span>
                      </td>
                      <td className="cm-td cm-td-num">
                        {formatMoney(batch.loanTotal, currencySymbol)}
                      </td>
                      <td className="cm-td cm-td-date">
                        {batch.createdAt
                          ? new Date(batch.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="cm-td">
                        <Link
                          to={`/case-management/clients/${batch.clientId}/files/${batch.fileId}/cases`}
                          className="sv-allocate-btn"
                        >
                          Allocate <ArrowUpRight className="icon-sm" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Agents */}
      <section className="cm-table-card">
        <SectionHeader
          icon={Users}
          title="Agents in your center"
          count={agents.length}
          linkTo="/management/agent-management"
          linkLabel="Manage agents →"
        />
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th">Agent</th>
                <th className="cm-th">Email</th>
                <th className="cm-th cm-th-num">Cases assigned</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={3}>
                    <div className="cm-empty-state">
                      <div className="cm-empty-icon">
                        <Users />
                      </div>
                      <p className="cm-empty-title">No agents yet</p>
                      <p className="cm-empty-desc">
                        Agents bound to your call center will appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr key={agent.id} className="cm-table-row">
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="cm-client-avatar" aria-hidden="true">
                          <UserCog className="cm-client-avatar-icon" />
                        </span>
                        <p className="cm-client-name">{agent.name}</p>
                      </div>
                    </td>
                    <td className="cm-td">
                      <span className="cm-client-type">{agent.email}</span>
                    </td>
                    <td className="cm-td cm-td-num">
                      <span className={`sv-cases-badge ${Number(agent.casesAssigned || 0) > 0 ? 'sv-cases-badge--active' : ''}`}>
                        {agent.casesAssigned ?? 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default SupervisorDashboard;
