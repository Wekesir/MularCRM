import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppBootstrap from './components/AppBootstrap';
import AuthClientSetup from './components/AuthClientSetup';
import { GuestOnly, RequireAuth } from './components/RequireAuth';
import ThemeInitializer from './components/ThemeInitializer';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import { modules } from './routes/modules';
import LoginPage from './pages/auth/LoginPage';
import VerifyOtpPage from './pages/auth/VerifyOtpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import SystemConfigLayout from './pages/system-config/SystemConfigLayout';
import BusinessConfig from './pages/system-config/BusinessConfig';
import CommunicationIntegration from './pages/system-config/CommunicationIntegration';
import AccessLevels from './pages/system-config/AccessLevels';
import Integrations from './pages/system-config/Integrations';
import ReportAccess from './pages/system-config/ReportAccess';
import AuditLogs from './pages/system-config/AuditLogs';
import ProfilePage from './pages/profile/ProfilePage';
import ProfileDetailsTab from './pages/profile/ProfileDetailsTab';
import ChangePasswordTab from './pages/profile/ChangePasswordTab';
import CommunicationChannelsLayout from './pages/communication/CommunicationChannelsLayout';
import ChannelsOverview from './pages/communication/channels/ChannelsOverview';
import ChannelsSettingsLayout from './pages/communication/channels/ChannelsSettingsLayout';
import EmailTemplates from './pages/communication/channels/EmailTemplates';
import SmsTemplates from './pages/communication/channels/SmsTemplates';
import CallConfigurations from './pages/communication/channels/CallConfigurations';
import ChannelsCompliance from './pages/communication/channels/ChannelsCompliance';

function App() {
  return (
    <>
      <ThemeInitializer />
      <AuthClientSetup />
      <AppBootstrap />
      <BrowserRouter>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/login/verify-otp" element={<VerifyOtpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/integrations"
              element={<Navigate to="/system-configurations/integrations" replace />}
            />
            <Route element={<AppLayout />}>
              {modules.map(({ path, component: Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="/profile" element={<ProfilePage />}>
                <Route index element={<ProfileDetailsTab />} />
                <Route path="password" element={<ChangePasswordTab />} />
              </Route>
              <Route path="/communication/communication-channels" element={<CommunicationChannelsLayout />}>
                <Route index element={<ChannelsOverview />} />
                <Route path="settings" element={<ChannelsSettingsLayout />}>
                  <Route index element={<Navigate to="email-templates" replace />} />
                  <Route path="email-templates" element={<EmailTemplates />} />
                  <Route path="sms-templates" element={<SmsTemplates />} />
                  <Route path="call-configurations" element={<CallConfigurations />} />
                </Route>
                <Route path="compliance" element={<ChannelsCompliance />} />
              </Route>
              <Route path="/system-configurations" element={<SystemConfigLayout />}>
                <Route index element={<Navigate to="business" replace />} />
                <Route path="business" element={<BusinessConfig />} />
                <Route path="communication" element={<CommunicationIntegration />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="access-levels" element={<AccessLevels />} />
                <Route path="report-access" element={<ReportAccess />} />
                <Route path="audit-logs" element={<AuditLogs />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
