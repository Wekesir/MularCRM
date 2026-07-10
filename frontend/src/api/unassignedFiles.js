import api from './client';

/**
 * Open batch files that still have unassigned debtor cases.
 * @param {string} [search]
 */
export async function fetchUnassignedFiles(search = '') {
  const params = search ? { search } : undefined;
  const { data } = await api.get('/api/unassigned-files', { params });
  return data;
}
