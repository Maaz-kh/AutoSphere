import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import { apiClient } from '../services/api';
import '../styles/PartModal.css';
import '../styles/OwnerAppointmentsPage.css';

const OwnerAppointmentsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: '5', comment: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/workshops/owner/appointments');
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

  const cancelAppointment = async (id) => {
    const ok = window.confirm('Cancel this appointment request?');
    if (!ok) return;
    try {
      await apiClient.patch(`/workshops/owner/appointments/${id}/cancel`);
      toast.success('Appointment cancelled.');
      await load();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to cancel appointment.';
      toast.error(msg);
    }
  };

  const submitReview = async () => {
    if (!reviewTarget?.id) return;
    setReviewSubmitting(true);
    try {
      await apiClient.post(`/workshops/owner/appointments/${reviewTarget.id}/review`, {
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment?.trim() || null
      });
      toast.success('Review submitted.');
      setReviewTarget(null);
      await load();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to submit review.';
      toast.error(msg);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const getRequestedServicesLabel = (appointment) => {
    if (Array.isArray(appointment.requested_services) && appointment.requested_services.length > 0) {
      return appointment.requested_services.map((service) => service.name).join(', ');
    }
    return appointment.requested_service_name || null;
  };

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="owner-appointments-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="My Appointments"
            subtitle="Track workshop booking requests and leave reviews after completion."
            button={{ text: 'Book Appointment', onClick: () => navigate('/dashboard/owner/workshops') }}
          />

          <div className="owner-appointments-body">
            <section className="owner-appointments-card">
              {loading ? (
                <div className="owner-appointments-empty">Loading…</div>
              ) : items.length === 0 ? (
                <div className="owner-appointments-empty">No appointments yet.</div>
              ) : (
                <div className="owner-appointments-grid">
                  {items.map((a) => {
                    const requestedServicesLabel = getRequestedServicesLabel(a);
                    return (
                    <article key={a.id} className="owner-appointment-item">
                      <div className="owner-appointment-head">
                        <div className="owner-appointment-title">{a.workshop_name}</div>
                        <span className={`owner-appointment-status status-${a.status}`}>{a.status}</span>
                      </div>
                      <div className="owner-appointment-meta">
                        {[a.workshop_city, a.workshop_country].filter(Boolean).join(', ')}
                      </div>
                      {requestedServicesLabel && (
                        <div className="owner-appointment-meta">Services: {requestedServicesLabel}</div>
                      )}
                      {['accepted', 'completed'].includes(a.status)
                        ? (a.scheduled_at || a.preferred_at) && (
                            <div className="owner-appointment-meta">
                              Scheduled at: {new Date(a.scheduled_at || a.preferred_at).toLocaleString()}
                            </div>
                          )
                        : a.preferred_at && (
                            <div className="owner-appointment-meta">
                              Preferred at: {new Date(a.preferred_at).toLocaleString()}
                            </div>
                          )}
                      <div className="owner-appointment-actions">
                        {['pending', 'accepted'].includes(a.status) && (
                          <button type="button" className="card-btn-secondary" onClick={() => cancelAppointment(a.id)}>Cancel</button>
                        )}
                        {a.status === 'completed' && !a.review_id && (
                          <button
                            type="button"
                            className="card-btn-primary"
                            onClick={() => {
                              setReviewTarget(a);
                              setReviewForm({ rating: '5', comment: '' });
                            }}
                          >
                            Add Review
                          </button>
                        )}
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

      {reviewTarget && (
        <div className="modal-overlay" onClick={() => !reviewSubmitting && setReviewTarget(null)}>
          <div className="modal-content owner-review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Review</h2>
              <button type="button" className="modal-close-btn" onClick={() => setReviewTarget(null)} disabled={reviewSubmitting}>
                <X size={20} />
              </button>
            </div>
            <div className="owner-review-body">
              <div className="modal-field">
                <label>Workshop</label>
                <input type="text" value={reviewTarget.workshop_name || ''} readOnly />
              </div>
              <div className="modal-field">
                <label>Rating</label>
                <select value={reviewForm.rating} onChange={(e) => setReviewForm((p) => ({ ...p, rating: e.target.value }))}>
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Good</option>
                  <option value="3">3 - Average</option>
                  <option value="2">2 - Poor</option>
                  <option value="1">1 - Bad</option>
                </select>
              </div>
              <div className="modal-field">
                <label>Comment</label>
                <textarea
                  rows="4"
                  className="owner-review-text"
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm((p) => ({ ...p, comment: e.target.value }))}
                />
              </div>
            </div>
            <div className="owner-review-actions">
              <button type="button" className="modal-btn cancel" onClick={() => setReviewTarget(null)} disabled={reviewSubmitting}>Cancel</button>
              <button type="button" className="modal-btn primary" onClick={submitReview} disabled={reviewSubmitting}>
                {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerAppointmentsPage;

