import { useEffect } from 'react';
import ObservedPageHeader from '../components/ObservedPageHeader';
import { useSystemConfig } from '../context/SystemConfigContext';
import {
  clearPageDocumentTitle,
  setPageDocumentTitle,
} from '../utils/documentTitle';

function PageLayout({ title, description, icon, actions, subtitle, children }) {
  const { businessName } = useSystemConfig();

  useEffect(() => {
    setPageDocumentTitle(title, businessName);
    return () => clearPageDocumentTitle(businessName);
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
