import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';
import { apiClient } from '../services/api';
import '../styles/WorkshopAppointmentsPage.css';

const WorkshopAppointmentsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/workshops/workshop/appointments');
      setItems(res.data?.data?.appointments || []);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load appointments.';
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getRequestedServicesLabel = (appointment) => {
    if (Array.isArray(appointment.requested_services) && appointment.requested_services.length > 0) {
      return appointment.requested_services.map((service) => service.name).join(', ');
    }
    return appointment.requested_service_name || null;
  };

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="workshop-appointments-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Appointments"
            subtitle="Manage incoming booking requests from vehicle owners."
            button={{ text: 'Manage Services Offered', onClick: () => navigate('/dashboard/workshop/services') }}
          />

          <div className="workshop-appointments-body">
            <section className="workshop-appointments-card">
              {loading ? (
                <div className="workshop-appointments-empty">Loading…</div>
              ) : items.length === 0 ? (
                <div className="workshop-appointments-empty">No appointments yet.</div>
              ) : (
                <div className="workshop-appointments-grid">
                  {items.map((a) => {
                    const requestedServicesLabel = getRequestedServicesLabel(a);
                    return (
                    <article key={a.id} className="workshop-appointment-item">
                      <div className="workshop-appointment-head">
                        <div className="workshop-appointment-title">{a.owner_name || a.owner_email}</div>
                        <span className={`workshop-appointment-status status-${a.status}`}>{a.status}</span>
                      </div>
                      <div className="workshop-appointment-meta">
                        Vehicle: {[a.make, a.model, a.variant].filter(Boolean).join(' ')} ({a.registration_number || 'N/A'})
                      </div>
                      {requestedServicesLabel && (
                        <div className="workshop-appointment-meta">Services: {requestedServicesLabel}</div>
                      )}
                      {['accepted', 'completed'].includes(a.status)
                        ? (a.scheduled_at || a.preferred_at) && (
                            <div className="workshop-appointment-meta">
                              Scheduled at: {new Date(a.scheduled_at || a.preferred_at).toLocaleString()}
                            </div>
                          )
                        : a.preferred_at && (
                            <div className="workshop-appointment-meta">
                              Preferred at: {new Date(a.preferred_at).toLocaleString()}
                            </div>
                          )}
                      {a.notes && <div className="workshop-appointment-notes">{a.notes}</div>}
                      <div className="workshop-appointment-actions">
                        <button 
                          type="button" 
                          className="card-btn-secondary" 
                          onClick={() => setSelectedAppointment(a)}
                        >
                          View Details
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      
      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onUpdate={load}
        />
      )}
    </div>
  );
};

export default WorkshopAppointmentsPage;

