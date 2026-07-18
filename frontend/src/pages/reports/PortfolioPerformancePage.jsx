import { BarChart3 } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function PortfolioPerformancePage() {
  return (
    <ReportShell
      slug="portfolio-performance"
      icon={BarChart3}
      title="Portfolio Performance"
      description="Portfolio health and recovery by client"
    />
  );
}

export default PortfolioPerformancePage;
