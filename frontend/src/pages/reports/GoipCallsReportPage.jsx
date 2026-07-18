import { Headset } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function GoipCallsReportPage() {
  return (
    <ReportShell
      slug="goip-calls-report"
      icon={Headset}
      title="GOIP Calls Report"
      description="Voice call activity and outcomes"
    />
  );
}

export default GoipCallsReportPage;
