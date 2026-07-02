import { useSystemConfig } from '../../context/SystemConfigContext';

function AuthCopyright({ variant = 'mobile' }) {
  const { businessName } = useSystemConfig();
  const year = new Date().getFullYear();
  const name = businessName || 'OMNICRM';

  return (
    <p className={`auth-copyright auth-copyright-${variant}`}>
      &copy; {year} {name}. All rights reserved.
    </p>
  );
}

export default AuthCopyright;
