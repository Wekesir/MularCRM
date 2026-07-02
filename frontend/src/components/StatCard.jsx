import { useCountUp } from '../hooks/useCountUp';

function formatNumber(value, decimals) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function StatCard({
  icon: Icon,
  value,
  numericValue = null,
  decimals = 0,
  prefix = '',
  suffix = '',
  label,
  meta,
  progress = null,
  accent = null,
  variant = 'default',
  className = '',
  style = undefined,
}) {
  const hasNumeric = typeof numericValue === 'number' && Number.isFinite(numericValue);
  const animatedValue = useCountUp(hasNumeric ? numericValue : 0, { decimals, duration: 1400 });
  const displayValue = hasNumeric ? `${prefix}${formatNumber(animatedValue, decimals)}${suffix}` : value;

  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const normalizedProgress = hasProgress ? Math.max(0, Math.min(100, progress)) : null;

  const accentColor = accent && accent !== 'theme' ? accent : null;
  const mergedStyle = accentColor ? { ...style, '--stat-accent': accentColor } : style;

  return (
    <article className={`stat-card stat-card-${variant} ${className}`.trim()} style={mergedStyle}>
      <span className="stat-card-glow" aria-hidden="true" />

      {Icon && (
        <span className="stat-card-icon" aria-hidden="true">
          <Icon className="icon-md" />
        </span>
      )}

      <div className="stat-card-content">
        <p className="stat-card-value">{displayValue}</p>
        <p className="stat-card-label">{label}</p>
        {meta ? <p className="stat-card-meta">{meta}</p> : null}

        {normalizedProgress !== null ? (
          <div
            className="stat-card-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(normalizedProgress)}
          >
            <span className="stat-card-progress-fill" style={{ width: `${normalizedProgress}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default StatCard;
