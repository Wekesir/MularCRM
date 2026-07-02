import { SignalHigh } from 'lucide-react';
import PlaceholderModulePage from '../../components/PlaceholderModulePage';

function ContactabilityPage() {
  return (
    <PlaceholderModulePage
      icon={SignalHigh}
      title="Contactability"
      description="Configure contactability scoring rules for debtors."
    />
  );
}

export default ContactabilityPage;
