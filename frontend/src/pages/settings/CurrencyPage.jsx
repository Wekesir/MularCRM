import { useCallback, useEffect, useState } from 'react';
import { Coins, Plus, RefreshCw, Pencil, Trash2, Search, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import CurrencyFormModal, { EMPTY_CURRENCY_FORM } from '../../components/CurrencyFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency,
} from '../../api/currencies';

function CurrencyRow({ currency, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar cur-avatar" aria-hidden="true">
            <Coins className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">
              {currency.name}
              {currency.isDefault && (
                <span className="cur-default-badge" title="Default currency">
                  <Star className="cur-default-icon" />
                  Default
                </span>
              )}
            </p>
            <p className="cm-client-type">
              <code className="dm-cfid-badge dm-cfid-badge--sm">{currency.code}</code>
            </p>
          </div>
        </div>
      </td>
      <td className="cm-td">
        <span className="cur-symbol">{currency.symbol}</span>
      </td>
      <td className="cm-td">
        <span className={`status-pill ${currency.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {currency.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(currency)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button
            type="button"
            className="cm-action-btn cm-action-btn-danger"
            aria-label="Delete"
            title={currency.isDefault ? 'Default currency cannot be deleted' : 'Delete'}
            onClick={() => onDelete(currency)}
            disabled={currency.isDefault}
          >
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CurrencyPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CURRENCY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currencies, setCurrencies] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCurrencies();
      setCurrencies(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load currencies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_CURRENCY_FORM);
    setModalOpen(true);
  };

  const openEdit = (currency) => {
    setEditing(currency);
    setForm({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      isActive: currency.isActive,
      isDefault: currency.isDefault,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.symbol.trim()) {
      toast.error('Code, name and symbol are required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        isActive: form.isActive,
        isDefault: form.isDefault,
      };
      if (editing) {
        const updated = await updateCurrency(editing.id, payload);
        setCurrencies((prev) => {
          const next = prev.map((c) => (c.id === updated.id ? updated : c));
          // Only one default at a time — mirror backend behaviour locally.
          if (updated.isDefault) return next.map((c) => (c.id === updated.id ? c : { ...c, isDefault: false }));
          return next;
        });
        toast.success(`Currency "${updated.code}" updated`);
      } else {
        const created = await createCurrency(payload);
        setCurrencies((prev) => {
          const next = [created, ...prev];
          if (created.isDefault) return next.map((c) => (c.id === created.id ? c : { ...c, isDefault: false }));
          return next;
        });
        toast.success(`Currency "${created.code}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_CURRENCY_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save currency');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (currency) => {
    await confirm({
      title: 'Delete currency',
      message: `Delete currency "${currency.code}"?`,
      detail: 'Debtors previously tagged with this currency will keep their value until reassigned.',
      confirmText: 'Delete Currency',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteCurrency(currency.id);
          setCurrencies((prev) => prev.filter((c) => c.id !== currency.id));
          toast.success(`Currency "${currency.code}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete currency');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? currencies.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q)
        );
      })
    : currencies;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Currency
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Coins} title="Currencies" count={filtered.length} />

          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by code, name or symbol…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th className="cm-th cm-th-index">#</th>
                  <th className="cm-th">Currency</th>
                  <th className="cm-th">Symbol</th>
                  <th className="cm-th">Status</th>
                  <th className="cm-th cm-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={5}>
                      <div className="cm-empty-state">
                        <Coins className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading currencies…' : 'No currencies found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching currencies from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Currency" to create your first currency.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((currency, idx) => (
                    <CurrencyRow
                      key={currency.id}
                      currency={currency}
                      index={idx}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="cm-table-footer">
              Showing <strong>{filtered.length}</strong> of <strong>{currencies.length}</strong> currencies
            </p>
          )}
        </div>
      </div>

      <CurrencyFormModal
        open={modalOpen}
        onClose={closeModal}
        form={form}
        setForm={setForm}
        isSaving={isSaving}
        onSave={handleSave}
        isEditing={Boolean(editing)}
      />
    </>
  );
}

export default CurrencyPage;
