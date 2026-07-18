import { CalendarClock } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function PromiseToPayPage() {
  return (
    <ReportShell
      slug="promise-to-pay"
      icon={CalendarClock}
      title="Promise To Pay"
      description="PTP arrangements and outcomes"
    />
  );
}

export default PromiseToPayPage;
