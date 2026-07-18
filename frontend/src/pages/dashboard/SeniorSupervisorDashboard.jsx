import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Headphones,
  RefreshCw,
  UserCog,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchOrgDashboard } from '../../api/dashboard';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import { usePageActions } from '../../context/PageActionsContext';
import { useCountUp } from '../../hooks/useCountUp';

function formatCount(n) {
  return Number(n || 0).toLocaleString();
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Animated count-up inside the hero panel */
function HeroStat({ label, value }) {
  const count = useCountUp(Number(value) || 0, { duration: 1200 });
  return (
    <div className="adash-hero-stat">
      <p className="adash-hero-stat-value">{Math.round(count).toLocaleString()}</p>
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
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="adash-skel adash-skel-stat" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="adash-skel adash-skel-chart-lg" style={{ height: '12rem' }} />
    </div>
  );
}

function SeniorSupervisorDashboard() {
  const { setActions } = usePageActions();
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

  if (isLoading && !data) return <DashSkeleton />;

  const hasUnassigned = Number(summary.unassignedClients || 0) > 0;
  const hasUnbound = Number(summary.unboundAgents || 0) > 0;

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="dashboard-page space-y-8">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="adash-hero">
        <div className="adash-hero-deco adash-hero-deco--1" aria-hidden="true" />
        <div className="adash-hero-deco adash-hero-deco--2" aria-hidden="true" />
        <div className="adash-hero-inner">
          <div className="adash-hero-left">
            <p className="adash-hero-eyebrow">{todayFormatted}</p>
            <p className="adash-hero-greeting">{getGreeting()}</p>
            <p className="adash-hero-date">Organization-wide overview at a glance</p>
            <div className="adash-hero-actions">
              <Link to="/management/call-centers" className="adash-hero-cta">
                <Headphones className="icon-sm" aria-hidden="true" />
                Call Centers
                <ArrowRight className="icon-sm" aria-hidden="true" />
              </Link>
              <Link to="/management/agent-management" className="adash-hero-cta adash-hero-cta--ghost">
                <Users className="icon-sm" aria-hidden="true" />
                Agents
              </Link>
            </div>
          </div>

          <div className="adash-hero-stats" aria-label="Organization key figures">
            <HeroStat label="Call Centers" value={summary.activeCallCenters} />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Supervisors" value={summary.supervisors} />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Agents" value={summary.agents} />
            <div className="adash-hero-divider" aria-hidden="true" />
            <HeroStat label="Clients" value={summary.assignedClients} />
          </div>
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────── */}
      {(hasUnassigned || hasUnbound) && (
        <div className="ss-alerts">
          {hasUnassigned && (
            <div className="ss-alert ss-alert--warn">
              <AlertTriangle className="ss-alert-icon" />
              <div className="ss-alert-body">
                <p className="ss-alert-title">
                  {formatCount(summary.unassignedClients)} client
                  {Number(summary.unassignedClients) !== 1 ? 's' : ''} not yet assigned
                </p>
                <p className="ss-alert-desc">
                  Assign them to a call center so their files appear for the right supervisor.
                </p>
              </div>
              <Link to="/settings/client-agents" className="ss-alert-link">
                Assign now <ArrowRight className="icon-sm" />
              </Link>
            </div>
          )}
          {hasUnbound && (
            <div className="ss-alert ss-alert--error">
              <Users className="ss-alert-icon" />
              <div className="ss-alert-body">
                <p className="ss-alert-title">
                  {formatCount(summary.unboundAgents)} agent
                  {Number(summary.unboundAgents) !== 1 ? 's' : ''} not bound to a call center
                </p>
                <p className="ss-alert-desc">
                  Agents must be bound to a call center before they can receive cases.
                </p>
              </div>
              <Link to="/management/agent-management" className="ss-alert-link">
                Fix now <ArrowRight className="icon-sm" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Row 1: headcount (3 cards) ───────────────────── */}
      <section className="stat-grid-compact" aria-label="Organization headcount">
        <StatCard
          icon={Headphones}
          numericValue={Number(summary.activeCallCenters) || 0}
          label="Call Centers"
          meta="Org-wide call centers"
          accent="theme"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 0 }}
        />
        <StatCard
          icon={UserCog}
          numericValue={Number(summary.supervisors) || 0}
          label="Supervisors"
          meta="Center managers"
          accent="#8b5cf6"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 1 }}
        />
        <StatCard
          icon={Users}
          numericValue={Number(summary.agents) || 0}
          label="Agents"
          meta="Active collectors"
          accent="#10b981"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 2 }}
        />
      </section>

      {/* ── Row 2: clients & alert metrics (3 cards) ─────── */}
      <section className="stat-grid-compact" aria-label="Client and agent status">
        <StatCard
          icon={Building2}
          numericValue={Number(summary.assignedClients) || 0}
          label="Clients Assigned"
          meta="Routed to a center"
          accent="#06b6d4"
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 3 }}
        />
        <StatCard
          icon={AlertTriangle}
          numericValue={Number(summary.unassignedClients) || 0}
          label="Clients Unassigned"
          meta="Need center assignment"
          accent={hasUnassigned ? '#f59e0b' : undefined}
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 4 }}
        />
        <StatCard
          icon={Users}
          numericValue={Number(summary.unboundAgents) || 0}
          label="Agents Unbound"
          meta="Not linked to a center"
          accent={hasUnbound ? '#ef4444' : undefined}
          variant="compact"
          className="dashboard-stat-card"
          style={{ '--card-index': 5 }}
        />
      </section>

      {/* ── Call Centers overview ─────────────────────────── */}
      <section className="cm-table-card">
        <SectionHeader
          icon={Headphones}
          title="Call Centers"
          count={(data?.callCenters || []).length}
          linkTo="/management/call-centers"
          linkLabel="Manage →"
        />
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th">Name</th>
                <th className="cm-th cm-th-num">Clients</th>
                <th className="cm-th cm-th-num">Supervisors</th>
                <th className="cm-th cm-th-num">Agents</th>
                <th className="cm-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.callCenters || []).length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={5}>
                    <div className="cm-empty-state">
                      <div className="cm-empty-icon">
                        <Headphones />
                      </div>
                      <p className="cm-empty-title">No call centers yet</p>
                      <Link to="/management/call-centers" className="btn-primary btn-sm">
                        Create call center
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                data.callCenters.map((c) => (
                  <tr key={c.id} className="cm-table-row">
                    <td className="cm-td">
                      <div className="ss-center-cell">
                        <span className="ss-center-avatar" aria-hidden="true">
                          <Headphones className="ss-center-avatar-icon" />
                        </span>
                        <span className="cm-client-name">{c.name}</span>
                      </div>
                    </td>
                    <td className="cm-td cm-td-num">{c.clientCount ?? 0}</td>
                    <td className="cm-td cm-td-num">{c.supervisorCount ?? 0}</td>
                    <td className="cm-td cm-td-num">{c.agentCount ?? 0}</td>
                    <td className="cm-td">
                      <span
                        className={`status-pill ${
                          c.status === 'active' ? 'status-pill--active' : 'status-pill--inactive'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Recent client assignments ─────────────────────── */}
      <section className="cm-table-card">
        <SectionHeader
          icon={CheckCircle2}
          title="Recent client assignments"
          count={(data?.recentClientAssignments || []).length}
          linkTo="/settings/client-agents"
          linkLabel="Assign clients →"
        />
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th">Client</th>
                <th className="cm-th">Call Center</th>
                <th className="cm-th">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentClientAssignments || []).length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={3}>
                    <div className="cm-empty-state">
                      <p className="cm-empty-title">No recent assignments</p>
                      <p className="cm-empty-desc">
                        Assigned clients will appear here as you route them to call centers.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.recentClientAssignments.map((row) => (
                  <tr key={row.clientId} className="cm-table-row">
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="cm-client-avatar" aria-hidden="true">
                          <Building2 className="cm-client-avatar-icon" />
                        </span>
                        <p className="cm-client-name">{row.clientName}</p>
                      </div>
                    </td>
                    <td className="cm-td">
                      <span className="ss-center-tag">{row.callCenterName}</span>
                    </td>
                    <td className="cm-td cm-td-date">
                      <div className="ss-date-cell">
                        <Calendar className="ss-date-icon" />
                        <span>{formatRelativeDate(row.assignedAt)}</span>
                      </div>
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

export default SeniorSupervisorDashboard;
