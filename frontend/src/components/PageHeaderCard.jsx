function PageHeaderCard({ icon: Icon, title, description, actions, subtitle }) {
  return (
    <div className="page-header-card">
      <div className="page-header-card-banner" />

      <div className="page-header-card-body">
        <div className="page-header-card-top">
          {Icon && (
            <div className="page-header-card-icon" aria-hidden="true">
              <Icon className="page-header-card-icon-svg" />
            </div>
          )}

          {actions && <div className="page-header-card-actions">{actions}</div>}
        </div>

        <div className="page-header-card-text">
          <h1 className="page-header-card-title">{title}</h1>
          {(subtitle ?? description) && (
            <p className="page-header-card-description">{subtitle ?? description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default PageHeaderCard;
