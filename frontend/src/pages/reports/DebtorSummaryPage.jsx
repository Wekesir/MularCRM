import { FileText } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function DebtorSummaryPage() {
  return (
    <ReportShell
      slug="debtor-summary"
      icon={FileText}
      title="Debtor Summary"
      description="Debtor accounts, balances and recovery snapshot"
    />
  );
}

export default DebtorSummaryPage;
