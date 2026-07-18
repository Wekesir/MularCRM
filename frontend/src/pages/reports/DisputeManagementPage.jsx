import { ShieldAlert } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function DisputeManagementPage() {
  return (
    <ReportShell
      slug="dispute-management"
      icon={ShieldAlert}
      title="Dispute Management"
      description="Disputed accounts by contact status and notes"
    />
  );
}

export default DisputeManagementPage;
