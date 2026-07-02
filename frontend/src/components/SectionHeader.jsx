import { Link } from 'react-router-dom';

function SectionHeader({
  icon: Icon,
  title,
  count = null,
  badge = null,
  actions = null,
  linkTo = null,
  linkLabel = 'View All ->',
}) {
  return (
    <div className="section-header">
      <div className="section-header-left">
        {Icon ? (
          <span className="section-header-icon" aria-hidden="true">
            <Icon className="icon-sm" />
          </span>
        ) : null}
        <h2 className="section-header-title">
          {title}
          {count !== null ? <span className="section-header-count">({count})</span> : null}
          {badge ? <span className="section-header-badge">{badge}</span> : null}
        </h2>
      </div>

      {actions}

      {linkTo ? (
        <Link className="section-header-link" to={linkTo}>
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default SectionHeader;
