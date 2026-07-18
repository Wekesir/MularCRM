import { TrendingUp } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function PaymentPerformancePage() {
  return (
    <ReportShell
      slug="payment-performance"
      icon={TrendingUp}
      title="Payment Performance"
      description="Payment trends and collection performance"
    />
  );
}

export default PaymentPerformancePage;
