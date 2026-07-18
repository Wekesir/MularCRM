import { LineChart } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function RecoveryRatePage() {
  return (
    <ReportShell
      slug="recovery-rate"
      icon={LineChart}
      title="Recovery Rate"
      description="Percentage of debt recovered by client"
    />
  );
}

export default RecoveryRatePage;
