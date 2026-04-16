import { useEffect, useState, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import PartModal from '../components/PartModal';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import '../styles/InventoryPage.css';

const InventoryPage = () => {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    stockLevel: 'all'
  });

  useEffect(() => {
    fetchParts();
  }, []);

  const fetchParts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/workshop/parts');
      setParts(response.data?.data || []);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load parts. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPart = () => {
    setEditingPart(null);
    setShowModal(true);
  };

  const handleEditPart = (part) => {
    setEditingPart(part);
    setShowModal(true);
  };

  const handleDeletePart = async (partId) => {
    if (!window.confirm('Are you sure you want to delete this part?')) {
      return;
    }

    try {
      await apiClient.delete(`/workshop/parts/${partId}`);
      toast.success('Part deleted successfully');
      fetchParts();
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to delete part. Please try again.';
      toast.error(msg);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingPart(null);
  };

  const handleModalSuccess = () => {
    handleModalClose();
    fetchParts();
  };

  const filteredParts = useMemo(() => {
    const { search, category, stockLevel } = filters;
    const q = search.trim().toLowerCase();

    return parts.filter((part) => {
      // Search filter
      if (q) {
        const text = part.part_name.toLowerCase();
        if (!text.includes(q)) return false;
      }

      // Category filter
      if (category !== 'all' && part.category !== category) return false;

      // Stock level filter
      if (stockLevel !== 'all') {
        const quantity = parseInt(part.quantity, 10);
        if (stockLevel === 'in_stock' && quantity === 0) return false;
        if (stockLevel === 'low_stock' && (quantity === 0 || quantity > 5)) return false;
        if (stockLevel === 'out_of_stock' && quantity > 0) return false;
      }

      return true;
    });
  }, [parts, filters]);

  const getCategoryLabel = (category) => {
    const labels = {
      parts: 'Parts',
      fluids: 'Fluids',
      filters: 'Filters'
    };
    return labels[category] || category;
  };

  const getCategoryBadgeClass = (category) => {
    const classes = {
      parts: 'category-badge-parts',
      fluids: 'category-badge-fluids',
      filters: 'category-badge-filters'
    };
    return classes[category] || 'category-badge-parts';
  };

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="inventory-main">
        <div className="layout-page-inner inventory-container">
          <PageHeroWithFilters
            title="Inventory Management"
            subtitle="Manage your workshop parts and inventory efficiently."
            button={{
              text: 'Add Inventory Item',
              onClick: handleAddPart
            }}
            filters={[
              {
                type: 'search',
                label: 'Search',
                name: 'search',
                value: filters.search,
                onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
                placeholder: 'Search by item name',
                width: 'wide'
              },
              {
                type: 'select',
                label: 'Category',
                name: 'category',
                value: filters.category,
                onChange: (value) => setFilters((prev) => ({ ...prev, category: value })),
                options: [
                  { value: 'all', label: 'All Categories' },
                  { value: 'parts', label: 'Parts' },
                  { value: 'fluids', label: 'Fluids' },
                  { value: 'filters', label: 'Filters' }
                ]
              },
              {
                type: 'select',
                label: 'Stock Level',
                name: 'stockLevel',
                value: filters.stockLevel,
                onChange: (value) => setFilters((prev) => ({ ...prev, stockLevel: value })),
                options: [
                  { value: 'all', label: 'All Stock Levels' },
                  { value: 'in_stock', label: 'In Stock' },
                  { value: 'low_stock', label: 'Low Stock' },
                  { value: 'out_of_stock', label: 'Out of Stock' }
                ]
              }
            ]}
          />

          <section className="inventory-list-card">
            {/* Parts List */}
            {loading ? (
              <div className="inventory-loading">
                <p>Loading inventory...</p>
              </div>
            ) : filteredParts.length === 0 ? (
              <div className="inventory-empty">
                <p>
                  {parts.length === 0
                    ? 'No items in inventory. Click "Add Inventory Item" to get started.'
                    : 'No items match your filters.'}
                </p>
              </div>
            ) : (
              <div className="parts-grid">
                {filteredParts.map((part) => (
                  <div key={part.id} className="part-card">
                    <div className="part-card-head">
                      <h3 className="part-card-name">{part.part_name}</h3>
                      <div className="part-card-icon-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => handleEditPart(part)}
                          aria-label="Edit part"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => handleDeletePart(part.id)}
                          aria-label="Delete part"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="part-card-mid">
                      <div className="part-info-row">
                        <span className="part-info-label">Price</span>
                        <span className="part-info-value">
                          Rs. {parseFloat(part.price).toLocaleString()}
                        </span>
                      </div>
                      <div className="part-info-row">
                        <span className="part-info-label">Quantity</span>
                        <span className="part-info-value">{part.quantity}</span>
                      </div>
                    </div>
                    <div className="part-card-footer">
                      <span className={`category-badge ${getCategoryBadgeClass(part.category)}`}>
                        {getCategoryLabel(part.category)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Part Modal */}
      {showModal && (
        <PartModal
          part={editingPart}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
};

export default InventoryPage;

