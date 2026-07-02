import { Crown, Download, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

const TABLE_HEADERS = [
  'Rank',
  'Agent',
  'Total Files',
  'Collected',
  'Total PTP',
  'PTP Count',
  'Total Calls',
  'Total SMS',
  'PTP Rate',
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function toCsv(rows) {
  const lines = [
    TABLE_HEADERS.join(','),
    ...rows.map((row) =>
      [
        row.rank,
        row.agent,
        row.totalFiles,
        row.collected,
        row.totalPtp,
        row.ptpCount,
        row.totalCalls,
        row.totalSms,
        row.ptpRate,
      ]
        .map((field) => `"${String(field).replaceAll('"', '""')}"`)
        .join(',')
    ),
  ];

  return lines.join('\n');
}

function downloadCsv(csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `agent-performance-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AgentPerformanceTable({ rows }) {
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.agent.toLowerCase().includes(query));
  }, [rows, search]);

  const onExport = () => {
    downloadCsv(toCsv(filteredRows));
  };

  return (
    <div className="agent-performance-card">
      <div className="agent-performance-toolbar">
        <label className="agent-search-field" htmlFor="agent-search">
          <input
            id="agent-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
            aria-label="Search agent performance"
          />
        </label>

        <div className="agent-performance-actions">
          <button type="button" className="btn-secondary btn-sm">
            <SlidersHorizontal className="icon-sm" />
            View
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={onExport}>
            <Download className="icon-sm" />
            Export
          </button>
        </div>
      </div>

      <div className="agent-performance-table-wrap">
        <table className="report-access-table agent-performance-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Agent</th>
              <th>Total Files</th>
              <th>Collected</th>
              <th>Total PTP</th>
              <th>PTP Count</th>
              <th>Total Calls</th>
              <th>Total SMS</th>
              <th>PTP Rate</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="agent-rank-badge">
                    {row.rank === 1 ? <Crown className="agent-rank-crown" aria-hidden="true" /> : null}
                    {row.rank}
                  </span>
                </td>
                <td>{row.agent}</td>
                <td>{formatNumber(row.totalFiles)}</td>
                <td>{formatNumber(row.collected)}</td>
                <td>{formatNumber(row.totalPtp)}</td>
                <td>{formatNumber(row.ptpCount)}</td>
                <td>{formatNumber(row.totalCalls)}</td>
                <td>{formatNumber(row.totalSms)}</td>
                <td>{formatNumber(row.ptpRate)}</td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="agent-performance-empty" colSpan={9}>
                  No matching agents found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AgentPerformanceTable;
