import { CircleDollarSign } from 'lucide-react';
import PlaceholderModulePage from '../../components/PlaceholderModulePage';

function NonConfirmedPaymentsPage() {
  return (
    <PlaceholderModulePage
      icon={CircleDollarSign}
      title="Non-confirmed Payments"
      description="Review payments awaiting confirmation or reconciliation."
    />
  );
}

export default NonConfirmedPaymentsPage;
