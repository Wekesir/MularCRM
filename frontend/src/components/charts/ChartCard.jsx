function ChartCard({ title, description, icon: Icon, accent = null, children, height = 280, className = '' }) {
  const style = accent ? { '--chart-accent': accent } : undefined;

  return (
    <section className={`chart-card ${className}`.trim()} style={style}>
      {(title || description) && (
        <header className="chart-card-header">
          {Icon ? (
            <span className="chart-card-icon" aria-hidden="true">
              <Icon className="icon-sm" />
            </span>
          ) : null}
          <div className="chart-card-header-text">
            {title && <h3 className="chart-card-title">{title}</h3>}
            {description && <p className="chart-card-description">{description}</p>}
          </div>
        </header>
      )}
      <div className="chart-card-canvas" style={{ height }}>
        {children}
      </div>
    </section>
  );
}

export default ChartCard;
