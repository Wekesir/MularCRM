import { useEffect } from 'react';
import ObservedPageHeader from '../components/ObservedPageHeader';
import { useSystemConfig } from '../context/SystemConfigContext';

function PageLayout({ title, description, icon, actions, subtitle, children }) {
  const { businessName } = useSystemConfig();

  useEffect(() => {
    document.title = `${title} | ${businessName}`;

    return () => {
      document.title = businessName;
    };
  }, [title, businessName]);

  return (
    <div className="page-layout">
      <ObservedPageHeader
        icon={icon}
        title={title}
        description={description}
        subtitle={subtitle}
        actions={actions}
      />
      {children && <div className="page-body">{children}</div>}
    </div>
  );
}

export default PageLayout;
