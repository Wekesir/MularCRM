import { Hourglass } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function AgingReportPage() {
  return (
    <ReportShell
      slug="aging-report"
      icon={Hourglass}
      title="Aging Report"
      description="Outstanding balances by age bucket"
    />
  );
}

export default AgingReportPage;
