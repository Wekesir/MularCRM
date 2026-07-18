import { StickyNote } from 'lucide-react';
import ReportShell from '../../components/reports/ReportShell';

function DebtorNotesPage() {
  return (
    <ReportShell
      slug="debtor-notes"
      icon={StickyNote}
      title="Debtor Notes"
      description="Notes logged against debtor accounts"
    />
  );
}

export default DebtorNotesPage;
