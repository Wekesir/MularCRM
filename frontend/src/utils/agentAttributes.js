// Workload is a fixed three-tier enum shared between the Agent Management page
// and the Assign Cases modal (rule-based tab). Experience and expertise are
// DB-backed lookups fetched from their own API clients.
export const WORKLOAD_LEVELS = ['Light', 'Medium', 'Heavy'];

export function isValidWorkload(value) {
  return WORKLOAD_LEVELS.includes(value);
}
