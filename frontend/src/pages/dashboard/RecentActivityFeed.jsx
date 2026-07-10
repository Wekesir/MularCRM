import { CalendarCheck2, NotebookPen, Phone, RefreshCw, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '../../utils/relativeTime';

function sortRecent(list) {
  return [...(list || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function ActivityIcon({ type }) {
  if (type === 'ptp') return <CalendarCheck2 className="icon-sm" />;
  if (type === 'call') return <Phone className="icon-sm" />;
  if (type === 'contact') return <MessageSquare className="icon-sm" />;
  return <NotebookPen className="icon-sm" />;
}

function iconClass(type) {
  if (type === 'ptp') return 'activity-icon activity-icon-ptp';
  if (type === 'call') return 'activity-icon activity-icon-call';
  if (type === 'contact') return 'activity-icon activity-icon-contact';
  return 'activity-icon activity-icon-note';
}

/**
 * @param {{ initialActivities: Array, onRefresh?: () => Promise<void> | void, title?: string }} props
 */
function RecentActivityFeed({ initialActivities, onRefresh = null, title = 'Recent Activities' }) {
  const [activities, setActivities] = useState(() => sortRecent(initialActivities));
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setActivities(sortRecent(initialActivities));
  }, [initialActivities]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
    } finally {
      window.setTimeout(() => setRefreshing(false), 400);
    }
  };

  const renderedActivities = useMemo(
    () =>
      activities.map((activity) => ({
        ...activity,
        relativeTime: formatRelativeTime(activity.createdAt),
      })),
    [activities, tick]
  );

  return (
    <div className="activity-feed-card">
      <div className="activity-feed-header">
        <h3 className="activity-feed-title">{title}</h3>
        <button
          type="button"
          className={refreshing ? 'btn-icon-outline activity-refresh is-spinning' : 'btn-icon-outline activity-refresh'}
          onClick={handleRefresh}
          aria-label="Refresh recent activities"
        >
          <RefreshCw className="icon-sm" />
        </button>
      </div>

      <div className="activity-feed" role="list">
        {renderedActivities.length === 0 ? (
          <div className="activity-feed-empty">
            <p>No recent activity yet.</p>
          </div>
        ) : (
          renderedActivities.map((activity) => (
            <article key={activity.id} className="activity-item" role="listitem">
              <span className={iconClass(activity.type)} aria-hidden="true">
                <ActivityIcon type={activity.type} />
              </span>

              <div className="activity-content">
                <p className="activity-title">{activity.title}</p>
                <p className="activity-subject">
                  {activity.subject}
                  {activity.amount != null && activity.amount !== '' ? (
                    <span className="activity-amount">
                      {typeof activity.amount === 'number'
                        ? activity.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : activity.amount}
                    </span>
                  ) : null}
                </p>
                <div className="activity-meta">
                  <span className="activity-chip">{activity.actor}</span>
                  <span className="activity-timestamp">{activity.relativeTime}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export default RecentActivityFeed;
