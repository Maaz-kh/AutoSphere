import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { X, Pencil, Trash2 } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import { apiClient } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/PartModal.css';
import '../styles/ServicesOfferedPage.css';

const formatPkr = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

/** Category pill — distinct colors (inventory-style palette + default for unknown slugs) */
const CATEGORY_PALETTE_CLASS = {
  maintenance: 'svc-pill-cat--maintenance',
  repair: 'svc-pill-cat--repair',
  inspection: 'svc-pill-cat--inspection',
  bodywork: 'svc-pill-cat--bodywork',
  other: 'svc-pill-cat--other'
};

const serviceCategoryPillClass = (category) => {
  const k =
    String(category || 'other')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') || 'other';
  const palette = CATEGORY_PALETTE_CLASS[k] || 'svc-pill-cat--default';
  return `svc-pill svc-pill-cat ${palette}`;
};

const priceLabel = (min, max) => {
  const minFmt = min == null ? null : formatPkr(min);
  const maxFmt = max == null ? null : formatPkr(max);
  if (!minFmt && !maxFmt) return 'Price not set';
  if (minFmt && maxFmt) return `PKR ${minFmt} - ${maxFmt}`;
  if (minFmt) return `From PKR ${minFmt}`;
  return `Up to PKR ${maxFmt}`;
};

const groupByCategory = (services) => {
  const groups = new Map();
  for (const s of services) {
    const key = s.category || 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const [, arr] of groups) {
    arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
};

const ServicesOfferedPage = () => {
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [myServices, setMyServices] = useState([]);
  const [catalog, setCatalog] = useState([]);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedServices, setSelectedServices] = useState({}); // serviceId -> { price_min, price_max }
  const [savingAdd, setSavingAdd] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null); // { id, service_id, name, category, price_min, price_max, is_active }
  const [savingEdit, setSavingEdit] = useState(false);

  const loadMyServices = useCallback(async () => {
    const res = await apiClient.get('/workshop/services');
    setMyServices(res.data?.data || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await apiClient.get('/workshop/services/catalog');
      setCatalog(res.data?.data || []);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadMyServices();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load offered services.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [loadMyServices]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const myServiceIds = useMemo(() => new Set((myServices || []).map((s) => Number(s.service_id))), [myServices]);

  const openAdd = async () => {
    setShowAddModal(true);
    setSelectedServices({});
    try {
      await loadCatalog();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load services catalog.';
      toast.error(msg);
    }
  };

  const toggleService = (serviceId) => {
    setSelectedServices((prev) => {
      const next = { ...prev };
      if (next[serviceId]) {
        delete next[serviceId];
      } else {
        next[serviceId] = { price_min: '', price_max: '' };
      }
      return next;
    });
  };

  const setSelectedPrice = (serviceId, field, value) => {
    setSelectedServices((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || { price_min: '', price_max: '' }),
        [field]: value
      }
    }));
  };

  const submitAdd = async () => {
    const payload = Object.entries(selectedServices).map(([service_id, v]) => ({
      service_id: Number(service_id),
      price_min: v.price_min === '' ? null : Number(v.price_min),
      price_max: v.price_max === '' ? null : Number(v.price_max)
    }));

    if (payload.length === 0) {
      toast.error('Select at least one service to add.');
      return;
    }

    setSavingAdd(true);
    try {
      await apiClient.post('/workshop/services', { services: payload });
      toast.success('Services updated successfully.');
      setShowAddModal(false);
      await loadMyServices();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to add services.';
      toast.error(msg);
    } finally {
      setSavingAdd(false);
    }
  };

  const openEdit = (item) => {
    setEditTarget({
      id: item.id,
      service_id: item.service_id,
      name: item.name,
      category: item.category,
      price_min: item.price_min == null ? '' : String(item.price_min),
      price_max: item.price_max == null ? '' : String(item.price_max),
      is_active: item.is_active !== false && item.is_active !== 0
    });
  };

  const submitEdit = async () => {
    if (!editTarget?.id) return;
    setSavingEdit(true);
    try {
      const payload = {
        price_min: editTarget.price_min === '' ? null : Number(editTarget.price_min),
        price_max: editTarget.price_max === '' ? null : Number(editTarget.price_max),
        is_active: Boolean(editTarget.is_active)
      };
      await apiClient.patch(`/workshop/services/${editTarget.id}`, payload);
      toast.success('Service updated.');
      setEditTarget(null);
      await loadMyServices();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to update service.';
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const removeService = async (item) => {
    const ok = window.confirm(`Remove "${item?.name}" from your offered services?`);
    if (!ok) return;
    try {
      await apiClient.delete(`/workshop/services/${item.id}`);
      toast.success('Service removed.');
      await loadMyServices();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to remove service.';
      toast.error(msg);
    }
  };

  const groupedCatalog = useMemo(() => groupByCategory(catalog || []), [catalog]);

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="services-offered-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Services Offered"
            subtitle="Manage the services you offer and set price ranges."
            button={{
              text: 'Add Service',
              onClick: openAdd
            }}
          />

        <section className="services-offered-card services-offered-body">
          {loading ? (
            <div className="services-offered-empty">Loading services…</div>
          ) : myServices.length === 0 ? (
            <div className="services-offered-empty">
              <div className="services-offered-empty-title">No services added yet</div>
              <div className="services-offered-empty-sub">
                Click <b>Add Service</b> to select from the catalog.
              </div>
            </div>
          ) : (
            <div className="services-offered-grid">
              {myServices.map((s) => (
                <div key={s.id} className={`svc-card ${s.is_active ? '' : 'inactive'}`}>
                  <div className="svc-head">
                    <div className="svc-title">{s.name}</div>
                    <div className="svc-actions">
                      <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(s)}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="icon-btn danger" title="Remove" onClick={() => removeService(s)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="svc-price">{priceLabel(s.price_min, s.price_max)}</div>
                  <div className="svc-meta">
                    <span className={serviceCategoryPillClass(s.category)}>{s.category}</span>
                    {!s.is_active && <span className="svc-pill svc-pill-muted">Inactive</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
      </main>

      {/* Add modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => !savingAdd && setShowAddModal(false)}>
          <div className="modal-content services-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add services</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddModal(false)}
                disabled={savingAdd}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="services-modal-body">
              {catalogLoading ? (
                <div className="services-offered-empty">Loading catalog…</div>
              ) : catalog.length === 0 ? (
                <div className="services-offered-empty">No services available.</div>
              ) : (
                <div className="services-catalog">
                  {groupedCatalog.map(([cat, items]) => (
                    <div key={cat} className="services-cat">
                      <div className="services-cat-title">{cat}</div>
                      <div className="services-cat-list">
                        {items.map((item) => {
                          const idStr = String(item.id);
                          const checked = !!selectedServices[idStr];
                          const alreadyAdded = myServiceIds.has(Number(item.id));
                          const prices = selectedServices[idStr] || { price_min: '', price_max: '' };
                          return (
                            <div key={item.id} className={`services-row ${checked ? 'selected' : ''} ${alreadyAdded ? 'already' : ''}`}>
                              <label className="services-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleService(idStr)}
                                  disabled={alreadyAdded}
                                />
                                <span className="services-name">{item.name}</span>
                                {alreadyAdded && <span className="services-note">Already added</span>}
                              </label>
                              {checked && (
                                <div className="services-prices">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Min (PKR)"
                                    value={prices.price_min}
                                    onChange={(e) => setSelectedPrice(idStr, 'price_min', e.target.value)}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Max (PKR)"
                                    value={prices.price_max}
                                    onChange={(e) => setSelectedPrice(idStr, 'price_max', e.target.value)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="services-modal-actions">
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() => setShowAddModal(false)}
                disabled={savingAdd}
              >
                Cancel
              </button>
              <button type="button" className="ui-btn-primary" onClick={submitAdd} disabled={savingAdd || catalogLoading}>
                {savingAdd ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => !savingEdit && setEditTarget(null)}>
          <div className="modal-content services-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit service</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditTarget(null)}
                disabled={savingEdit}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="services-modal-body">
              <div className="svc-edit-head">
                <div className="svc-edit-name">{editTarget.name}</div>
                <span className={serviceCategoryPillClass(editTarget.category)}>{editTarget.category}</span>
              </div>

              <div className="svc-edit-grid">
                <div className="modal-field">
                  <label>Min price (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editTarget.price_min}
                    onChange={(e) => setEditTarget((p) => ({ ...p, price_min: e.target.value }))}
                    placeholder="Not set"
                  />
                </div>
                <div className="modal-field">
                  <label>Max price (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editTarget.price_max}
                    onChange={(e) => setEditTarget((p) => ({ ...p, price_max: e.target.value }))}
                    placeholder="Not set"
                  />
                </div>
              </div>

              <label className="svc-edit-active">
                <input
                  type="checkbox"
                  checked={!!editTarget.is_active}
                  onChange={(e) => setEditTarget((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active (visible to public)
              </label>
            </div>

            <div className="services-modal-actions">
              <button type="button" className="ui-btn-secondary" onClick={() => setEditTarget(null)} disabled={savingEdit}>
                Cancel
              </button>
              <button type="button" className="ui-btn-primary" onClick={submitEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesOfferedPage;

