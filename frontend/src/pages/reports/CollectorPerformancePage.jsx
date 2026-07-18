import { Award } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function CollectorPerformancePage() {
  return (
    <ReportShell
      slug="collector-performance"
      icon={Award}
      title="Collector Performance"
      description="Compare collection performance across agents"
    />
  );
}

export default CollectorPerformancePage;
