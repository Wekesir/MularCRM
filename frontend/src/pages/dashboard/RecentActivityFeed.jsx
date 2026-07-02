import { CalendarCheck2, NotebookPen, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '../../utils/relativeTime';

function shuffle(array) {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sortRecent(list) {
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function RecentActivityFeed({ initialActivities }) {
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

  const onRefresh = () => {
    setRefreshing(true);
    setActivities((current) => shuffle(current));
    window.setTimeout(() => setRefreshing(false), 550);
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
        <h3 className="activity-feed-title">Recent Activities</h3>
        <button
          type="button"
          className={refreshing ? 'btn-icon-outline activity-refresh is-spinning' : 'btn-icon-outline activity-refresh'}
          onClick={onRefresh}
          aria-label="Refresh recent activities"
        >
          <RefreshCw className="icon-sm" />
        </button>
      </div>

      <div className="activity-feed" role="list">
        {renderedActivities.map((activity) => (
          <article key={activity.id} className="activity-item" role="listitem">
            <span
              className={activity.type === 'ptp' ? 'activity-icon activity-icon-ptp' : 'activity-icon activity-icon-note'}
              aria-hidden="true"
            >
              {activity.type === 'ptp' ? (
                <CalendarCheck2 className="icon-sm" />
              ) : (
                <NotebookPen className="icon-sm" />
              )}
            </span>

            <div className="activity-content">
              <p className="activity-title">{activity.title}</p>
              <p className="activity-subject">
                {activity.subject}
                {activity.amount ? <span className="activity-amount">{activity.amount}</span> : null}
              </p>
              <div className="activity-meta">
                <span className="activity-chip">{activity.actor}</span>
                <span className="activity-timestamp">{activity.relativeTime}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default RecentActivityFeed;
