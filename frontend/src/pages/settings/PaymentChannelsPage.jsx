import { CreditCard } from 'lucide-react';
import PlaceholderModulePage from '../../components/PlaceholderModulePage';

function PaymentChannelsPage() {
  return (
    <PlaceholderModulePage
      icon={CreditCard}
      title="Payment Channels"
      description="Configure the payment channels accepted for repayments."
    />
  );
}

export default PaymentChannelsPage;
