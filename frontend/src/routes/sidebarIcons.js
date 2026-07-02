import {
  Archive,
  Award,
  BarChart3,
  Braces,
  Briefcase,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CircleCheck,
  CircleDollarSign,
  CircleSlash,
  Coins,
  Contact,
  CreditCard,
  FileBarChart,
  FileCog,
  FileText,
  Flag,
  FolderKanban,
  FolderOpen,
  Gauge,
  GraduationCap,
  HandCoins,
  Handshake,
  Headset,
  Hourglass,
  LayoutDashboard,
  Layers,
  LineChart,
  Mail,
  MessageSquare,
  MessageSquareText,
  Percent,
  PhoneCall,
  Radio,
  Send,
  SignalHigh,
  Settings,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Tags,
  TrendingUp,
  UploadCloud,
  UserCog,
  UserPen,
  UserRound,
  UsersRound,
  Wallet,
  Wrench,
} from 'lucide-react';

export const sidebarIcons = {
  '/dashboard': LayoutDashboard,

  // Dropdown parents (virtual keys — these have no route of their own)
  management: FolderKanban,
  communication: MessageSquare,
  payments: CreditCard,
  reports: FileBarChart,
  settings: Wrench,

  // Management
  '/management/client-management': UserRound,
  '/management/debtor-management': UsersRound,
  '/management/file-management': FolderOpen,
  '/management/closed-files': Archive,
  '/management/agent-management': UserCog,

  // Case Management
  '/case-management': Briefcase,

  // Communication
  '/communication/bulk-sms': Send,
  '/communication/bulk-emails': Mail,
  '/communication/communication-channels': Radio,
  '/communication/discounts-and-waivers': Percent,

  // Contact Upload
  '/contact-upload': UploadCloud,

  // Payments
  '/payments/payments': Wallet,
  '/payments/commissions': HandCoins,
  '/payments/ptp': CalendarCheck2,
  '/payments/non-confirmed-payments': CircleDollarSign,

  // Reports
  '/reports/debtor-summary': FileText,
  '/reports/payment-performance': TrendingUp,
  '/reports/collector-performance': Award,
  '/reports/portfolio-performance': BarChart3,
  '/reports/promise-to-pay': CalendarClock,
  '/reports/aging-report': Hourglass,
  '/reports/dispute-management': ShieldAlert,
  '/reports/recovery-rate': LineChart,
  '/reports/goip-calls-report': Headset,
  '/reports/sms-report': MessageSquareText,
  '/reports/debtor-notes': StickyNote,
  '/reports/contact-attempt': PhoneCall,

  // Settings
  '/settings/commission-rates': Percent,
  '/settings/debt-type': Tags,
  '/settings/debt-category': Layers,
  '/settings/client-type': Building2,
  '/settings/debtor-upload-rules': FileCog,
  '/settings/currency': Coins,
  '/settings/payment-channels': CreditCard,
  '/settings/closure-reason': CircleSlash,
  '/settings/template-variables': Braces,
  '/settings/case-priority': Flag,
  '/settings/agent-experience': GraduationCap,
  '/settings/agent-expertise': Sparkles,
  '/settings/client-agents': Handshake,
  '/settings/workload-parameters': Gauge,
  '/settings/contactability': SignalHigh,
  '/settings/contact-type': Contact,
  '/settings/contact-status': CircleCheck,

  '/profile': UserPen,
  '/system-configurations': Settings,
};

export function getSidebarIcon(path) {
  return sidebarIcons[path] || LayoutDashboard;
}
