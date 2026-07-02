// AppLayout already renders this page's header (icon/title/description come from
// moduleMeta.js + sidebarIcons.js) and provides the page-root spacing shell, so this
// component only needs to render the body content.
function PlaceholderModulePage({
  icon: Icon,
  description,
  emptyTitle = 'Nothing Here Yet',
  emptyDescription,
}) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon">
        <Icon className="empty-state-icon-svg" />
      </div>
      <h2 className="empty-state-title">{emptyTitle}</h2>
      <p className="empty-state-description">
        {emptyDescription || description || 'This module is coming soon.'}
      </p>
    </div>
  );
}

export default PlaceholderModulePage;
