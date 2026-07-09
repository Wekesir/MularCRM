import { useCallback, useEffect, useState } from 'react';
import { Percent, Plus, RefreshCw, Pencil, Trash2, Search, Building2 } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import CommissionRateFormModal, { EMPTY_COMMISSION_RATE_FORM } from '../../components/CommissionRateFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  fetchCommissionRates,
  createCommissionRate,
  updateCommissionRate,
  deleteCommissionRate,
} from '../../api/clientCommissionRates';
import { fetchClients } from '../../api/clients';
import { fetchDebtCategories } from '../../api/debtCategories';
import { fetchCurrencies } from '../../api/currencies';

function formatPercent(rate) {
  const n = Number(rate) || 0;
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 2)}%`;
}

function CommissionRatesPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const { isSystemAdmin } = usePermissions();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_COMMISSION_RATE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [rates, setRates] = useState([]);
  const [clients, setClients] = useState([]);
  const [debtCategories, setDebtCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [r, c, dc, cur] = await Promise.all([
        fetchCommissionRates(),
        fetchClients(),
        fetchDebtCategories(),
        fetchCurrencies(),
      ]);
      setRates(r);
      setClients(c);
      setDebtCategories(dc);
      setCurrencies(cur);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load commission rates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_COMMISSION_RATE_FORM);
    setModalOpen(true);
  };

  const openEdit = (rate) => {
    setEditing(rate);
    setForm({
      clientId: String(rate.clientId ?? ''),
      debtCategoryId: rate.debtCategoryId != null ? String(rate.debtCategoryId) : '',
      rate: String(rate.rate ?? ''),
      currencyId: rate.currencyId != null ? String(rate.currencyId) : '',
      isActive: rate.isActive,
      notes: rate.notes || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.clientId) {
      toast.error('Client is required');
      return;
    }
    const rateNum = Number(form.rate);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1) {
      toast.error('Rate must be a number between 0 and 1 (e.g. 0.10 for 10%)');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        clientId: Number(form.clientId),
        debtCategoryId: form.debtCategoryId ? Number(form.debtCategoryId) : null,
        rate: rateNum,
        currencyId: form.currencyId ? Number(form.currencyId) : null,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const updated = await updateCommissionRate(editing.id, payload);
        setRates((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success('Commission rate updated');
      } else {
        const created = await createCommissionRate(payload);
        setRates((prev) => [created, ...prev]);
        toast.success('Commission rate added');
      }
      setModalOpen(false);
      setForm(EMPTY_COMMISSION_RATE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save commission rate');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rate) => {
    await confirm({
      title: 'Delete commission rate',
      message: `Delete the ${formatPercent(rate.rate)} rate for ${rate.clientName} · ${rate.debtCategoryName || 'default'}?`,
      detail: 'Future payments will fall back to the next matching rate (client default or global default). Past earnings keep the rate that was applied at the time.',
      confirmText: 'Delete Rate',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteCommissionRate(rate.id);
          setRates((prev) => prev.filter((r) => r.id !== rate.id));
          toast.success('Commission rate removed');
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete commission rate');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? rates.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.clientName || '').toLowerCase().includes(q) ||
          (r.debtCategoryName || '').toLowerCase().includes(q)
        );
      })
    : rates;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        {isSystemAdmin && (
          <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
            <Plus className="icon-sm" />
            Add Rate
          </button>
        )}
      </>,
    );
    return () => setActions(null);
  }, [setActions, load, isSystemAdmin]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Percent} title="Commission Rates" count={filtered.length} />

          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by client or debt category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="cm-table-wrap cmr-table-wrap">
            <table className="cm-table cmr-table">
              <thead>
                <tr>
                  <th className="cm-th cm-th-index">#</th>
                  <th className="cm-th">Client</th>
                  <th className="cm-th">Debt Category</th>
                  <th className="cm-th cm-th-num">Rate</th>
                  <th className="cm-th">Currency</th>
                  <th className="cm-th">Status</th>
                  <th className="cm-th">Notes</th>
                  {isSystemAdmin && <th className="cm-th cm-th-actions">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={isSystemAdmin ? 8 : 7}>
                      <div className="cm-empty-state">
                        <Percent className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading commission rates…' : 'No commission rates configured'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching the rate matrix from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Rate" to negotiate a commission rate with a client for a debt category.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((rate, idx) => (
                    <tr key={rate.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{idx + 1}</td>
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="cm-client-avatar cmr-avatar" aria-hidden="true">
                            <Building2 className="cm-client-avatar-icon" />
                          </span>
                          <p className="cm-client-name">{rate.clientName || '—'}</p>
                        </div>
                      </td>
                      <td className="cm-td">
                        {rate.debtCategoryName ? (
                          <span className="cmr-category">{rate.debtCategoryName}</span>
                        ) : (
                          <span className="cmr-default-badge">All categories</span>
                        )}
                      </td>
                      <td className="cm-td cm-td-num">
                        <span className="cmr-rate">{formatPercent(rate.rate)}</span>
                      </td>
                      <td className="cm-td">{rate.currencyCode || <span className="dm-muted">Platform default</span>}</td>
                      <td className="cm-td">
                        <span className={`status-pill ${rate.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                          {rate.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="cm-td">{rate.notes || <span className="dm-muted">—</span>}</td>
                      {isSystemAdmin && (
                        <td className="cm-td cm-td-actions">
                          <div className="cm-action-group">
                            <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => openEdit(rate)}>
                              <Pencil className="cm-action-icon" />
                            </button>
                            <button
                              type="button"
                              className="cm-action-btn cm-action-btn-danger"
                              aria-label="Delete"
                              title="Delete"
                              onClick={() => handleDelete(rate)}
                            >
                              <Trash2 className="cm-action-icon" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="cm-table-footer">
              Showing <strong>{filtered.length}</strong> of <strong>{rates.length}</strong> rates
            </p>
          )}
        </div>
      </div>

      {isSystemAdmin && (
        <CommissionRateFormModal
          open={modalOpen}
          onClose={closeModal}
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          onSave={handleSave}
          isEditing={Boolean(editing)}
          clients={clients}
          debtCategories={debtCategories}
          currencies={currencies}
        />
      )}
    </>
  );
}

export default CommissionRatesPage;
