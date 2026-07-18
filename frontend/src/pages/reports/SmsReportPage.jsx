import { MessageSquareText } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function SmsReportPage() {
  return (
    <ReportShell
      slug="sms-report"
      icon={MessageSquareText}
      title="SMS Report"
      description="SMS delivery activity and outcomes"
    />
  );
}

export default SmsReportPage;
