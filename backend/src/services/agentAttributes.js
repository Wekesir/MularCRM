// Fixed enums + display helpers for agent attributes. Experience and expertise
// are DB-backed lookups (agent_experience_levels / agent_expertise_areas);
// workload is a fixed three-tier enum managed here.
const WORKLOAD_LEVELS = ['Light', 'Medium', 'Heavy'];

const WORKLOAD_LABELS = {
  Light: 'Light',
  Medium: 'Medium',
  Heavy: 'Heavy',
};

function isValidWorkload(value) {
  return Boolean(value) && WORKLOAD_LEVELS.includes(value);
}

module.exports = {
  WORKLOAD_LEVELS,
  WORKLOAD_LABELS,
  isValidWorkload,
};
