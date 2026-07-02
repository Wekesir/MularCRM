import { Gauge } from 'lucide-react';
import PlaceholderModulePage from '../../components/PlaceholderModulePage';

function WorkloadParametersPage() {
  return (
    <PlaceholderModulePage
      icon={Gauge}
      title="Workload Parameters"
      description="Configure limits and rules for agent case load distribution."
    />
  );
}

export default WorkloadParametersPage;
