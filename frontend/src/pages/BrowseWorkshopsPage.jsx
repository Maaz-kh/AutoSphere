import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { MapPin, ChevronLeft, ChevronRight, X, Phone } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';
import '../styles/PartModal.css';
import '../styles/BrowseWorkshopsPage.css';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All service categories' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'bodywork', label: 'Bodywork' }
];

const RADIUS_OPTIONS = [
  { value: '', label: 'Distance radius' },
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '25', label: '25 km' },
  { value: '50', label: '50 km' },
  { value: '100', label: '100 km' }
];

const formatDistance = (km) => {
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
};

const BrowseWorkshopsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isVehicleOwner = user?.role === 'vehicle_owner';
  const [filters, setFilters] = useState({
    q: '',
    city: '',
    country: '',
    category: '',
    service_id: '',
    radius_km: ''
  });
  const [geo, setGeo] = useState({ lat: null, lng: null });
  const geoRequestId = useRef(0);

  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 0 });
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingWorkshop, setBookingWorkshop] = useState(null);
  const [bookingServices, setBookingServices] = useState([]);
  const [ownerVehicles, setOwnerVehicles] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsWorkshop, setDetailsWorkshop] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);
  const [bookingForm, setBookingForm] = useState({
    vehicle_id: '',
    requested_service_ids: [],
    preferred_at: '',
    notes: ''
  });

  const requestUserLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }
      );
    });
  }, []);

  const fetchWorkshops = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const params = {
        q: filters.q || undefined,
        city: filters.city || undefined,
        country: filters.country || undefined,
        category: filters.category || undefined,
        service_id: filters.service_id || undefined,
        page: nextPage,
        limit: pagination.limit
      };
      if (filters.radius_km && geo.lat != null && geo.lng != null) {
        params.lat = geo.lat;
        params.lng = geo.lng;
        params.radius_km = filters.radius_km;
      }
      const res = await apiClient.get('/public/workshops', { params });
      const data = res.data?.data || {};
      setWorkshops(data.workshops || []);
      setPagination(data.pagination || { page: nextPage, limit: pagination.limit, total: 0, totalPages: 0 });
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load workshops.';
      toast.error(msg);
      setWorkshops([]);
      setPagination((p) => ({ ...p, page: 1, total: 0, totalPages: 0 }));
    } finally {
      setLoading(false);
    }
  }, [filters, geo.lat, geo.lng, pagination.limit]);

  useEffect(() => {
    if (!filters.radius_km) return;
    if (geo.lat != null && geo.lng != null) return;
    const id = ++geoRequestId.current;
    (async () => {
      try {
        const { lat, lng } = await requestUserLocation();
        if (geoRequestId.current !== id) return;
        setGeo({ lat, lng });
      } catch {
        if (geoRequestId.current !== id) return;
        toast.error('Location access is required to filter workshops by distance.');
        setFilters((p) => ({ ...p, radius_km: '' }));
      }
    })();
  }, [filters.radius_km, geo.lat, geo.lng, requestUserLocation]);

  useEffect(() => {
    fetchWorkshops(1);
  }, [fetchWorkshops]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdown = document.getElementById('booking_services_dropdown');
      const container = event.target.closest('.multi-select-container');
      
      if (dropdown && !container && dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const uiFilters = useMemo(() => ([
    {
      type: 'search',
      label: 'Search by name, address or city',
      name: 'q',
      value: filters.q,
      placeholder: 'Search by name, address or city',
      width: 'wide',
      onChange: (v) => setFilters((p) => ({ ...p, q: v }))
    },
    {
      type: 'select',
      label: 'Distance radius',
      name: 'radius_km',
      value: filters.radius_km,
      options: RADIUS_OPTIONS,
      onChange: (v) => {
        if (!v) geoRequestId.current += 1;
        setFilters((p) => ({ ...p, radius_km: v }));
      }
    },
    {
      type: 'select',
      label: 'Service category',
      name: 'category',
      value: filters.category,
      options: CATEGORY_OPTIONS,
      onChange: (v) => setFilters((p) => ({ ...p, category: v }))
    }
  ]), [filters]);

  const openDetailsModal = async (workshop, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setDetailsWorkshop(workshop);
    setShowDetailsModal(true);
    setDetailsLoading(true);
    try {
      const res = await apiClient.get(`/public/workshops/${workshop.id}`);
      setDetailsWorkshop(res.data?.data || null);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load workshop details.';
      toast.error(msg);
      setDetailsWorkshop(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openBookingModal = async (workshop, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setBookingWorkshop(workshop);
    setShowBookingModal(true);
    setBookingForm({ vehicle_id: '', requested_service_ids: [], preferred_at: '', notes: '' });
    setSelectedServices([]);
    setBookingLoading(true);
    try {
      const [vehiclesRes, detailsRes] = await Promise.all([
        apiClient.get('/vehicles'),
        apiClient.get(`/public/workshops/${workshop.id}`)
      ]);
      setOwnerVehicles(vehiclesRes.data?.data || []);
      setBookingServices(detailsRes.data?.data?.services || []);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load booking data.';
      toast.error(msg);
      setOwnerVehicles([]);
      setBookingServices([]);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleToggleService = (serviceId) => {
    setSelectedServices((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId];
      setBookingForm((formPrev) => ({
        ...formPrev,
        requested_service_ids: next
      }));
      return next;
    });
  };

  const handleRemoveService = (serviceId) => {
    setSelectedServices((prev) => {
      const next = prev.filter((id) => id !== serviceId);
      setBookingForm((formPrev) => ({
        ...formPrev,
        requested_service_ids: next
      }));
      return next;
    });
  };

  const submitBooking = async () => {
    if (!bookingWorkshop?.id) return;
    if (!bookingForm.vehicle_id) {
      toast.error('Please select a vehicle.');
      return;
    }
    setBookingSubmitting(true);
    try {
      await apiClient.post('/workshops/owner/appointments', {
        workshop_id: bookingWorkshop.id,
        vehicle_id: Number(bookingForm.vehicle_id),
        requested_service_ids: bookingForm.requested_service_ids.length > 0 ? bookingForm.requested_service_ids : null,
        preferred_at: bookingForm.preferred_at || null,
        notes: bookingForm.notes?.trim() || null
      });
      toast.success('Appointment request submitted.');
      setShowBookingModal(false);
      navigate('/dashboard/owner/appointments');
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to book appointment.';
      toast.error(msg);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const canPrev = pagination.page > 1;
  const canNext = pagination.totalPages && pagination.page < pagination.totalPages;

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="browse-workshops-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Browse Workshops"
            subtitle="Find verified workshops by location and services offered."
            button={{
              text: 'My Appointments',
              onClick: () => navigate('/dashboard/owner/appointments')
            }}
            filters={uiFilters}
          />

          <div className="browse-workshops-body">
            <section className="browse-workshops-card">
              {loading ? (
                <div className="browse-workshops-empty">Loading workshops…</div>
              ) : workshops.length === 0 ? (
                <div className="browse-workshops-empty">
                  No workshops found. Try adjusting filters.
                </div>
              ) : (
                <>
                  <div className="workshops-grid">
                    {workshops.map((w) => (
                      <article
                        key={w.id}
                        className="workshop-card"
                      >
                        <div className="workshop-card-head">
                          <div className="workshop-card-title">{w.name}</div>
                          <span className="workshop-verified">Verified</span>
                        </div>
                        <div className="workshop-card-loc">
                          <MapPin size={14} />
                          <span>{[w.city, w.country].filter(Boolean).join(', ')}</span>
                        </div>
                        {w.address && (
                          <div className="workshop-card-address">{w.address}</div>
                        )}
                        {w.distance_km != null && (
                          <div className="workshop-card-distance">
                            {formatDistance(w.distance_km)}
                          </div>
                        )}
                        <div className="workshop-card-actions">
                          <button
                            type="button"
                            className="card-btn-secondary workshop-details-btn"
                            onClick={(e) => openDetailsModal(w, e)}
                          >
                            View Details
                          </button>
                          {isVehicleOwner && (
                            <button
                              type="button"
                              className="card-btn-primary workshop-book-btn"
                              onClick={(e) => openBookingModal(w, e)}
                            >
                              Book Appointment
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="workshops-pagination">
                    <button
                      type="button"
                      className="card-btn-secondary pg-btn"
                      disabled={!canPrev}
                      onClick={() => fetchWorkshops(pagination.page - 1)}
                    >
                      <ChevronLeft size={16} /> Prev
                    </button>
                    <div className="pg-meta">
                      Page <b>{pagination.page}</b>
                      {pagination.totalPages ? <> of <b>{pagination.totalPages}</b></> : null}
                    </div>
                    <button
                      type="button"
                      className="card-btn-secondary pg-btn"
                      disabled={!canNext}
                      onClick={() => fetchWorkshops(pagination.page + 1)}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>

      {showBookingModal && (
        <div className="modal-overlay" onClick={() => !bookingSubmitting && setShowBookingModal(false)}>
          <div className="modal-content workshop-booking-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Book Appointment</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowBookingModal(false)}
                disabled={bookingSubmitting}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="workshop-booking-body">
              {bookingWorkshop && (
                <div className="workshop-booking-target">
                  {bookingWorkshop.name} - {[bookingWorkshop.city, bookingWorkshop.country].filter(Boolean).join(', ')}
                </div>
              )}

              {bookingLoading ? (
                <div className="browse-workshops-empty">Loading details…</div>
              ) : (
                <>
                  <div className="modal-field">
                    <label htmlFor="booking_vehicle">Vehicle *</label>
                    <select
                      id="booking_vehicle"
                      value={bookingForm.vehicle_id}
                      onChange={(e) => setBookingForm((p) => ({ ...p, vehicle_id: e.target.value }))}
                    >
                      <option value="">Select vehicle</option>
                      {ownerVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {[v.make, v.model, v.variant].filter(Boolean).join(' ')} ({v.registration_number})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="booking_services">Requested services (optional)</label>
                    <div className="multi-select-container">
                      <div className="multi-select-display" onClick={() => document.getElementById('booking_services_dropdown').classList.toggle('show')}>
                        <div className="selected-items">
                          {selectedServices.length === 0 ? (
                            <span className="placeholder">Select services...</span>
                          ) : (
                            selectedServices.map(serviceId => {
                              const service = bookingServices.find(s => s.service_id === serviceId);
                              return service ? (
                                <span key={serviceId} className="selected-item">
                                  {service.name}
                                  <button
                                    type="button"
                                    className="remove-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveService(serviceId);
                                    }}
                                  >
                                    <X size={14} />
                                  </button>
                                </span>
                              ) : null;
                            })
                          )}
                        </div>
                        <div className="dropdown-arrow">▼</div>
                      </div>
                      <div id="booking_services_dropdown" className="multi-select-dropdown">
                        {bookingServices.map((s) => (
                          <div
                            key={s.service_id}
                            className={`dropdown-item ${selectedServices.includes(s.service_id) ? 'selected' : ''}`}
                            onClick={() => handleToggleService(s.service_id)}
                          >
                            <span className="item-name">{s.name}</span>
                            <span className="item-category">({s.category})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="booking_time">Preferred date & time</label>
                    <input
                      id="booking_time"
                      type="datetime-local"
                      value={bookingForm.preferred_at}
                      onChange={(e) => setBookingForm((p) => ({ ...p, preferred_at: e.target.value }))}
                    />
                  </div>

                  <div className="modal-field">
                    <label htmlFor="booking_notes">Notes</label>
                    <textarea
                      id="booking_notes"
                      className="booking-notes"
                      rows="4"
                      placeholder="Any issue details, symptoms, or requests..."
                      value={bookingForm.notes}
                      onChange={(e) => setBookingForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="workshop-booking-actions">
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() => setShowBookingModal(false)}
                disabled={bookingSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-btn-primary"
                onClick={submitBooking}
                disabled={bookingLoading || bookingSubmitting}
              >
                {bookingSubmitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content workshop-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Workshop Details</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDetailsModal(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="workshop-details-body">
              {detailsLoading ? (
                <div className="browse-workshops-empty">Loading details…</div>
              ) : detailsWorkshop ? (
                <>
                  <div className="wd-top">
                    <div className="wd-title-row">
                      <div className="wd-name">{detailsWorkshop.name}</div>
                      <span className="wd-verified">Verified</span>
                    </div>

                    <div className="wd-meta">
                      <div className="wd-meta-item">
                        <MapPin size={16} />
                        <span>{[detailsWorkshop.city, detailsWorkshop.country].filter(Boolean).join(', ')}</span>
                      </div>
                      {detailsWorkshop.contact_phone && (
                        <div className="wd-meta-item">
                          <Phone size={16} />
                          <span>{detailsWorkshop.contact_phone}</span>
                        </div>
                      )}
                    </div>

                    {detailsWorkshop.address && (
                      <div className="wd-address">
                        <strong>Address:</strong> {detailsWorkshop.address}
                      </div>
                    )}

                    {detailsWorkshop.description && (
                      <div className="wd-description">
                        <strong>About:</strong> {detailsWorkshop.description}
                      </div>
                    )}

                    {detailsWorkshop.latitude && detailsWorkshop.longitude && (
                      <div className="wd-maps-section">
                        <a
                          href={`https://www.google.com/maps?q=${encodeURIComponent(String(detailsWorkshop.latitude))},${encodeURIComponent(String(detailsWorkshop.longitude))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="wd-maps-link"
                        >
                          <MapPin size={16} />
                          View in Google Maps
                        </a>
                      </div>
                    )}
                  </div>

                  {detailsWorkshop.services && detailsWorkshop.services.length > 0 && (
                    <div className="wd-services-section">
                      <h3 className="wd-section-title">Services Offered</h3>
                      <div className="wd-services-list">
                        {(() => {
                          // Group services by category
                          const groupedServices = detailsWorkshop.services.reduce((groups, service) => {
                            const category = service.category || 'Other';
                            if (!groups[category]) {
                              groups[category] = [];
                            }
                            groups[category].push(service);
                            return groups;
                          }, {});

                          return Object.entries(groupedServices).map(([category, services]) => (
                            <div key={category} className="wd-service-category-group">
                              <h4 className="wd-category-title">{category}</h4>
                              <ul className="wd-service-items">
                                {services.map((service) => (
                                  <li key={service.service_id} className="wd-service-item">
                                    <div className="wd-service-info">
                                      <span className="wd-service-name">{service.name}</span>
                                      <span className="wd-service-price">
                                        {service.price_min || service.price_max ? (
                                          <>
                                            {service.price_min && service.price_max
                                              ? `PKR ${Number(service.price_min).toLocaleString()} - ${Number(service.price_max).toLocaleString()}`
                                              : service.price_min
                                              ? `From PKR ${Number(service.price_min).toLocaleString()}`
                                              : `Up to PKR ${Number(service.price_max).toLocaleString()}`
                                            }
                                          </>
                                        ) : (
                                          <span className="wd-price-not-set">Price not set</span>
                                        )}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="browse-workshops-empty">
                  Workshop details not available.
                </div>
              )}
            </div>

            <div className="workshop-details-actions">
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowseWorkshopsPage;

