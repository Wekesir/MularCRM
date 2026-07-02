import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import {
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  PAGE_SIZE,
} from '../api/notifications';
import { useUser } from '../context/UserContext';

const TYPE_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const created = new Date(isoString);
  const diffMs = Date.now() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return created.toLocaleDateString();
}

function formatUnreadLabel(count) {
  if (count === 1) return '1 unread';
  return `${count} unread`;
}

export function useNotifications() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const loadingRef = useRef(false);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const { count } = await fetchUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      /* keep previous count */
    }
  }, []);

  useEffect(() => {
    if (user.email) {
      refreshUnreadCount();
    }
  }, [refreshUnreadCount, user.email]);

  const loadPage = useCallback(
    async (nextPage, append = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await fetchNotificationsPage({
          page: nextPage,
          limit: PAGE_SIZE,
        });

        setItems((prev) => (append ? [...prev, ...result.data] : result.data));
        setPage(result.page);
        setHasMore(result.hasMore);
        setInitialLoaded(true);
      } catch {
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setPage(0);
    setHasMore(true);
    setInitialLoaded(false);
    loadPage(1, false);
  }, [open, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadPage(page + 1, true);
  }, [hasMore, loadPage, page]);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      /* noop */
    }
  }, []);

  const markRead = useCallback(
    async (id) => {
      const target = items.find((item) => item.id === id);
      if (!target || target.read) return;

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await markNotificationRead(id);
      } catch {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, read: false } : item))
        );
        refreshUnreadCount();
      }
    },
    [items, refreshUnreadCount]
  );

  return {
    open,
    setOpen,
    items,
    unreadCount,
    hasMore,
    loading,
    loadingMore,
    initialLoaded,
    loadMore,
    markAllRead,
    markRead,
  };
}

export function NotificationsBellButton({ panel, className = '' }) {
  const { setOpen, unreadCount } = panel;
  const countLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <button
      type="button"
      className={`top-nav-notifications ${className}`.trim()}
      onClick={() => setOpen(true)}
      aria-label={
        unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
      }
      aria-expanded={panel.open}
      title="Notifications"
    >
      <Bell className="top-nav-notifications-icon" />
      {unreadCount > 0 && (
        <span className="top-nav-notifications-count" aria-hidden="true">
          {countLabel}
        </span>
      )}
    </button>
  );
}

export function NotificationsOffcanvas({ panel }) {
  const {
    open,
    setOpen,
    items,
    unreadCount,
    hasMore,
    loading,
    loadingMore,
    initialLoaded,
    loadMore,
    markAllRead,
    markRead,
  } = panel;

  const scrollRootRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !hasMore) return undefined;

    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { root, rootMargin: '120px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loadMore, items.length]);

  return (
    <>
      <div
        className={open ? 'notifications-backdrop visible' : 'notifications-backdrop'}
        onClick={() => setOpen(false)}
        role="presentation"
        aria-hidden={!open}
      />

      <aside
        className={open ? 'notifications-offcanvas open' : 'notifications-offcanvas'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-offcanvas-title"
        aria-hidden={!open}
      >
        <div className="notifications-offcanvas-header">
          <div className="notifications-offcanvas-heading">
            <h2 id="notifications-offcanvas-title">Notifications</h2>
            {unreadCount > 0 && (
              <span className="notifications-offcanvas-badge">
                {formatUnreadLabel(unreadCount)}
              </span>
            )}
          </div>
          <div className="notifications-offcanvas-actions">
            {unreadCount > 0 && (
              <button type="button" className="notifications-mark-read" onClick={markAllRead}>
                Mark all read
              </button>
            )}
            <button
              type="button"
              className="notifications-close"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            >
              <X className="notifications-close-icon" />
            </button>
          </div>
        </div>

        <div className="notifications-offcanvas-body" ref={scrollRootRef}>
          {loading && !initialLoaded ? (
            <div className="notifications-loading">
              <Loader2 className="notifications-loading-spinner" aria-hidden="true" />
              <p>Loading notifications…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="notifications-empty">
              <span className="notifications-empty-icon" aria-hidden="true">
                <Bell className="notifications-empty-icon-svg" />
              </span>
              <p className="notifications-empty-title">No notifications</p>
              <p className="notifications-empty-description">
                You&apos;re all caught up. New alerts will appear here.
              </p>
            </div>
          ) : (
            <>
              <ul className="notifications-list">
                {items.map((item) => {
                  const TypeIcon = TYPE_ICONS[item.type] || Info;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          item.read
                            ? 'notification-item'
                            : 'notification-item notification-item-unread'
                        }
                        onClick={() => markRead(item.id)}
                      >
                        <span
                          className={`notification-item-icon notification-item-icon-${item.type}`}
                          aria-hidden="true"
                        >
                          <TypeIcon className="notification-item-icon-svg" />
                        </span>
                        <span className="notification-item-content">
                          <span className="notification-item-title">{item.title}</span>
                          <span className="notification-item-message">{item.message}</span>
                          <span className="notification-item-time">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </span>
                        {!item.read && (
                          <span className="notification-item-unread-dot" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {hasMore && (
                <div ref={sentinelRef} className="notifications-load-more">
                  {loadingMore && (
                    <>
                      <Loader2 className="notifications-loading-spinner" aria-hidden="true" />
                      <span>Loading more…</span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
