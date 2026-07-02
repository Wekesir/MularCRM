import { useEffect, useRef } from 'react';
import DataTable from 'datatables.net-dt';
import 'datatables.net-dt/css/dataTables.dataTables.min.css';
import api from '../api/client';

function LazyDataTable({
  ajaxPath,
  columns,
  refreshKey = 0,
  onRowClick,
  onAction,
  extraParams = null,
  dom,
  order,
  tableClassName = 'display datatable-dark',
}) {
  const tableRef = useRef(null);
  const dtRef = useRef(null);
  const onRowClickRef = useRef(onRowClick);
  const onActionRef = useRef(onAction);
  const extraParamsRef = useRef(extraParams);

  onRowClickRef.current = onRowClick;
  onActionRef.current = onAction;
  extraParamsRef.current = extraParams;

  useEffect(() => {
    if (!tableRef.current) return undefined;

    if (dtRef.current) {
      dtRef.current.destroy();
      dtRef.current = null;
    }

    // DataTables.destroy() can leave the <thead>/<tbody> it generated in the DOM.
    // Re-initializing the same <table> node with a different column count then
    // triggers the "Incorrect column count" warning (tn/18) — e.g. when switching
    // tabs that have different numbers of columns. Reset to a clean empty table so
    // the columns option fully drives the generated header.
    if (tableRef.current) {
      tableRef.current.innerHTML = '';
    }

    const tableColumns = [
      {
        data: null,
        title: '#',
        orderable: false,
        searchable: false,
        className: 'dt-index-col',
        render: (_data, type, _row, meta) => {
          if (type !== 'display') return meta.row + meta.settings._iDisplayStart;
          return meta.settings._iDisplayStart + meta.row + 1;
        },
      },
      ...columns,
    ];

    dtRef.current = new DataTable(tableRef.current, {
      serverSide: true,
      processing: true,
      deferRender: true,
      pageLength: 10,
      lengthMenu: [10, 25, 50],
      order: order || [[1, 'asc']],
      ...(dom ? { dom } : {}),
      ajax: (data, callback) => {
        const params = {
          draw: data.draw,
          start: data.start,
          length: data.length,
          'search[value]': data.search?.value || '',
          ...(extraParamsRef.current || {}),
        };
        api
          .get(ajaxPath, { params })
          .then((res) => callback(res.data))
          .catch(() => {
            callback({
              draw: data.draw,
              data: [],
              recordsTotal: 0,
              recordsFiltered: 0,
            });
          });
      },
      columns: tableColumns,
      language: {
        processing: 'Loading...',
        emptyTable: 'No records found',
        zeroRecords: 'No matching records found',
      },
      rowCallback(row, data) {
        if (onRowClickRef.current) {
          row.style.cursor = 'pointer';
          row.dataset.rowId = data.id;
        }
      },
      drawCallback() {
        if (!dtRef.current) return;
        const pageStart = dtRef.current.page.info().start;
        let rowLoop = 0;
        dtRef.current.rows({ page: 'current' }).every(function () {
          const cell = this.node().querySelector('.dt-index-col');
          if (cell) {
            cell.textContent = String(pageStart + rowLoop + 1);
          }
          rowLoop += 1;
        });
      },
    });

    const handleTableClick = (event) => {
      const actionBtn = event.target.closest('[data-action]');
      if (actionBtn && onActionRef.current) {
        event.stopPropagation();
        const rowData = dtRef.current?.row(actionBtn.closest('tr')).data();
        if (rowData) onActionRef.current(actionBtn.dataset.action, rowData);
        return;
      }

      const row = event.target.closest('tbody tr');
      if (row && onRowClickRef.current) {
        const rowData = dtRef.current?.row(row).data();
        if (rowData) onRowClickRef.current(rowData);
      }
    };

    tableRef.current.addEventListener('click', handleTableClick);

    return () => {
      tableRef.current?.removeEventListener('click', handleTableClick);
      dtRef.current?.destroy();
      dtRef.current = null;
    };
  }, [ajaxPath, columns, refreshKey]);

  return (
    <div className="datatable-wrap">
      <table ref={tableRef} className={tableClassName} style={{ width: '100%' }} />
    </div>
  );
}

export default LazyDataTable;
