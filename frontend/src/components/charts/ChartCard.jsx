function ChartCard({
  title,
  description,
  icon: Icon,
  accent = null,
  badge = null,
  children,
  height = 280,
  className = '',
  actions = null,
  style: styleProp = undefined,
}) {
  const style = {
    ...(accent ? { '--chart-accent': accent } : null),
    ...(height
      ? { '--chart-canvas-height': typeof height === 'number' ? `${height}px` : height }
      : null),
    ...styleProp,
  };

  return (
    <section className={`chart-card ${className}`.trim()} style={style}>
      {(title || description || badge || actions) && (
        <header className="chart-card-header">
          {Icon ? (
            <span className="chart-card-icon" aria-hidden="true">
              <Icon className="icon-sm" />
            </span>
          ) : null}
          <div className="chart-card-header-text">
            <div className="chart-card-title-row">
              {title && <h3 className="chart-card-title">{title}</h3>}
              {badge ? <span className="chart-card-badge">{badge}</span> : null}
            </div>
            {description && <p className="chart-card-description">{description}</p>}
          </div>
          {actions ? <div className="chart-card-actions">{actions}</div> : null}
        </header>
      )}
      <div className="chart-card-canvas">{children}</div>
    </section>
  );
}

export default ChartCard;
