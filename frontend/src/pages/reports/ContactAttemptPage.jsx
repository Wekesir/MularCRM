import { PhoneCall } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function ContactAttemptPage() {
  return (
    <ReportShell
      slug="contact-attempt"
      icon={PhoneCall}
      title="Contact Attempt"
      description="History of contact attempts with debtors"
    />
  );
}

export default ContactAttemptPage;
