import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import '../styles/MyVehicles.css';

const MyVehiclesPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    make: 'all',
    model: 'all'
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const listRes = await apiClient.get('/vehicles');
        setVehicles(listRes.data?.data || []);
      } catch (error) {
        const msg =
          error?.response?.data?.message ||
          error?.message ||
          'Failed to load your vehicles. Please try again.';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const uniqueMakes = useMemo(() => {
    const set = new Set();
    vehicles.forEach((v) => v.make && set.add(v.make));
    return Array.from(set);
  }, [vehicles]);

  const uniqueModels = useMemo(() => {
    const set = new Set();
    vehicles.forEach((v) => v.model && set.add(v.model));
    return Array.from(set);
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const { search, make, model } = filters;
    const q = search.trim().toLowerCase();

    return vehicles.filter((v) => {
      if (q) {
        const text =
          `${v.registration_number || ''} ${v.make || ''} ${v.model || ''} ${v.vin_number || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      if (make !== 'all' && v.make !== make) return false;
      if (model !== 'all' && v.model !== model) return false;

      return true;
    });
  }, [vehicles, filters]);

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="my-vehicles-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Your Vehicles"
            subtitle="Search and manage the vehicles you've added to AutoSphere."
            showAdvancedFilter={false}
            button={{
              text: 'Register new vehicle',
              onClick: () => navigate('/dashboard/owner/register')
            }}
            filters={[
              {
                type: 'search',
                label: 'Search',
                name: 'search',
                value: filters.search,
                onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
                placeholder: 'Registration, make/model or VIN',
                width: 'wide'
              },
              {
                type: 'select',
                label: 'Make',
                name: 'make',
                value: filters.make,
                onChange: (value) => setFilters((prev) => ({ ...prev, make: value })),
                options: [
                  { value: 'all', label: 'Any Make' },
                  ...uniqueMakes.map((m) => ({ value: m, label: m }))
                ]
              },
              {
                type: 'select',
                label: 'Model',
                name: 'model',
                value: filters.model,
                onChange: (value) => setFilters((prev) => ({ ...prev, model: value })),
                options: [
                  { value: 'all', label: 'Any Model' },
                  ...uniqueModels.map((m) => ({ value: m, label: m }))
                ]
              }
            ]}
          />

          <section className="my-vehicles-list-card">

            {loading ? (
              <div className="my-vehicles-empty">Loading your vehicles…</div>
            ) : filteredVehicles.length === 0 ? (
              <div className="my-vehicles-empty">
                No Vehicles Found
              </div>
            ) : (
              <div className="vehicle-rows">
                {filteredVehicles.map((v) => (
                  <div 
                    key={v.id} 
                    className="vehicle-row"
                    onClick={() => {
                      const url = `/dashboard/owner/vehicle/${v.id}`;
                      window.open(url, '_blank');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="vehicle-main">
                      <div className="vehicle-title">
                        {v.make} {v.model}
                        {v.variant ? ` ${v.variant}` : ''} {v.model_year ? `· ${v.model_year}` : ''}
                      </div>
                      <div className="vehicle-ids">
                        <div className="vehicle-reg-vin">Reg No: {v.registration_number}</div>
                        {v.chassis_number && (
                          <div className="vehicle-reg-vin">Chasis No: {v.chassis_number}</div>
                        )}
                      </div>
                      <div className="vehicle-specs">
                        {v.fuel_type && (
                          <span className="vehicle-spec-pill">{v.fuel_type}</span>
                        )}
                        {v.transmission_type && (
                          <span className="vehicle-spec-pill">
                            {v.transmission_type}
                          </span>
                        )}
                        {v.engine_capacity && (
                          <span className="vehicle-spec-pill">
                            {v.engine_capacity} cc
                          </span>
                        )}
                        {typeof v.mileage_km === 'number' && (
                          <span className="vehicle-spec-pill">
                            {v.mileage_km.toLocaleString()} km
                          </span>
                        )}
                        {v.color && (
                          <span className="vehicle-spec-pill">Colour: {v.color}</span>
                        )}
                      </div>
                      <div className="vehicle-meta">
                        Purchased: {formatDate(v.purchase_date)}
                      </div>
                    </div>

                    <div className="vehicle-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="vehicle-action-btn primary"
                        onClick={() => {
                          const url = `/dashboard/owner/vehicle/${v.id}`;
                          window.open(url, '_blank');
                        }}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        className="vehicle-action-btn placeholder"
                        onClick={() =>
                          navigate('/dashboard/owner/history', {
                            state: { chassisNumber: v.chassis_number }
                          })
                        }
                      >
                        View service history
                      </button>
                      <button
                        type="button"
                        className="vehicle-action-btn placeholder"
                        onClick={() =>
                          navigate('/dashboard/owner/valuation', {
                            state: { vehicle: v }
                          })
                        }
                      >
                        AI-based valuation
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default MyVehiclesPage;


