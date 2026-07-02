function isoSecondsAgo(secondsAgo) {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

export const dashboardHeadcountStats = [
  { id: 'active-debtors', iconKey: 'users', label: 'Active Debtors', numericValue: 44859, decimals: 0, meta: 'Accounts in active recovery', accent: 'theme' },
  { id: 'total-clients', iconKey: 'building', label: 'Total Clients', numericValue: 128, decimals: 0, meta: 'Portfolio owners onboarded', accent: '#06b6d4' },
  { id: 'active-agents', iconKey: 'agent', label: 'Active Agents', numericValue: 42, decimals: 0, meta: 'Collectors active today', accent: '#8b5cf6' },
];

export const dashboardStats = [
  { id: 'outsourced-amount', iconKey: 'wallet', label: 'Outsourced Amount', numericValue: 3947269663.25, decimals: 2, prefix: 'KSh ', meta: '44,859 files', accent: 'theme' },
  { id: 'total-collected', iconKey: 'coins', label: 'Total Collected', numericValue: 1422427.21, decimals: 2, prefix: 'KSh ', meta: '578 files', accent: '#10b981' },
  { id: 'outstanding-amount', iconKey: 'receipt', label: 'Outstanding Amount', numericValue: 3916985674.09, decimals: 2, prefix: 'KSh ', meta: 'Current balance', accent: '#f59e0b' },
  { id: 'promise-to-pay', iconKey: 'calendar', label: 'Promise To Pay', numericValue: 1350777, decimals: 2, prefix: 'KSh ', meta: '325 files', accent: '#8b5cf6' },
  { id: 'non-confirmed-payments', iconKey: 'alert', label: 'Non-confirmed Payments', numericValue: 68644, decimals: 2, prefix: 'KSh ', meta: '2 files', accent: '#ef4444' },
  { id: 'success-rate', iconKey: 'percent', label: 'Success Rate', numericValue: 10.04, decimals: 2, suffix: '%', meta: '166,351 calls', progress: 10.04, accent: '#06b6d4' },
];

export const caseStatusChart = {
  labels: ['Pending', 'Assigned', 'Actioned'],
  values: [74, 18, 8],
};

export const collectionTrendChart = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  values: [15400000, 17300000, 17650000, 17400000, 18800000, 14950000, 16100000, 620000, 380000, 240000, 160000, 120000],
};

export const commissionsChart = {
  year: '2025',
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  values: [700000, 845000, 550000, 620000, 435000, 650000, 40000, 9000, 2000, 1500, 1200, 1000],
};

export const agentPerformanceRows = [
  { id: 1, rank: 1, agent: 'Patriciah Mukami', totalFiles: 2932, collected: 0, totalPtp: 1000, ptpCount: 1, totalCalls: 0, totalSms: 1, ptpRate: 0 },
  { id: 2, rank: 2, agent: 'Joshua Muthiani Mutua', totalFiles: 6969, collected: 0, totalPtp: 0, ptpCount: 0, totalCalls: 0, totalSms: 1, ptpRate: 0 },
  { id: 3, rank: 3, agent: 'Zipporah Njeri Wainaina', totalFiles: 3689, collected: 0, totalPtp: 0, ptpCount: 0, totalCalls: 0, totalSms: 0, ptpRate: 0 },
  { id: 4, rank: 4, agent: 'Zenka 3', totalFiles: 0, collected: 0, totalPtp: 0, ptpCount: 0, totalCalls: 0, totalSms: 0, ptpRate: 0 },
  { id: 5, rank: 5, agent: 'Zenka 2', totalFiles: 0, collected: 0, totalPtp: 0, ptpCount: 0, totalCalls: 0, totalSms: 0, ptpRate: 0 },
];

export function buildRecentActivities() {
  return [
    { id: 'a1', type: 'note', title: 'Notes Added', subject: 'Chesang Beatrice - ZENKA', actor: 'Purity Nthenya', amount: null, createdAt: isoSecondsAgo(0) },
    { id: 'a2', type: 'note', title: 'Notes Added', subject: 'Maragwa Kamau - ZENKA', actor: 'Evans Otieno', amount: null, createdAt: isoSecondsAgo(14) },
    { id: 'a3', type: 'ptp', title: 'PTP Added', subject: 'Jesilida Mkamburi Mwashwa - CEMES Ltd', actor: 'Purity Makau', amount: 'KSh 200.00', createdAt: isoSecondsAgo(31) },
    { id: 'a4', type: 'note', title: 'Notes Added', subject: 'Jesilida Mkamburi Mwashwa - CEMES Ltd', actor: 'Purity Makau', amount: null, createdAt: isoSecondsAgo(35) },
    { id: 'a5', type: 'note', title: 'Notes Added', subject: 'Michubu Kacharo - ZENKA', actor: 'Joshua Muthiani Mutua', amount: null, createdAt: isoSecondsAgo(40) },
    { id: 'a6', type: 'note', title: 'Notes Added', subject: 'Mariam Yusuf - ZENKA', actor: 'Evans Otieno', amount: null, createdAt: isoSecondsAgo(61) },
    { id: 'a7', type: 'ptp', title: 'PTP Added', subject: 'Musa Njoroge - FIGBUD', actor: 'Patriciah Mukami', amount: 'KSh 1,200.00', createdAt: isoSecondsAgo(79) },
    { id: 'a8', type: 'note', title: 'Notes Added', subject: 'Mumbi Grace - CEMES Ltd', actor: 'Zipporah Wainaina', amount: null, createdAt: isoSecondsAgo(96) },
    { id: 'a9', type: 'note', title: 'Notes Added', subject: 'Kevin Mugo - ZENKA', actor: 'Purity Nthenya', amount: null, createdAt: isoSecondsAgo(128) },
    { id: 'a10', type: 'ptp', title: 'PTP Added', subject: 'Kamau John - FIGBUD', actor: 'Joshua Muthiani Mutua', amount: 'KSh 800.00', createdAt: isoSecondsAgo(164) },
  ];
}
