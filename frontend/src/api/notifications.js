import api from './client';

const PAGE_SIZE = 15;

export async function fetchUnreadNotificationCount() {
  const { data } = await api.get('/api/notifications/unread-count');
  return data;
}

export async function fetchNotificationsPage({ page, limit = PAGE_SIZE }) {
  const { data } = await api.get('/api/notifications', {
    params: { page, limit },
  });
  return data;
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/api/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch('/api/notifications/read-all');
  return data;
}

export { PAGE_SIZE };
