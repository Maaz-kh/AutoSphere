import { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Calendar, Clock, Car, User, Package, MessageSquare } from 'lucide-react';
import { apiClient } from '../services/api';
import '../styles/AppointmentDetailsModal.css';

/** Normalize comma-separated service names so each item has a space after the comma. */
const formatServicesDisplay = (label) => {
  if (label == null || label === '') return '';
  return String(label)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
};

const displayOrDash = (value) => {
  if (value == null || value === '') return '—';
  const s = String(value).trim();
  return s || '—';
};

const formatTransmissionLabel = (value) => {
  const base = displayOrDash(value);
  if (base === '—') return base;
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
};

const formatBodyTypeLabel = (value) => {
  const base = displayOrDash(value);
  if (base === '—') return base;
  return base
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const AppointmentDetailsModal = ({ appointment, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(false);

  const requestedServices = Array.isArray(appointment.requested_services)
    ? appointment.requested_services
    : [];
  const requestedServicesLabel =
    requestedServices.length > 0
      ? formatServicesDisplay(requestedServices.map((service) => service.name).join(', '))
      : formatServicesDisplay(appointment.requested_service_name);

  const ownerPhone = appointment.owner_phone != null ? String(appointment.owner_phone).trim() : '';
  const ownerEmail = appointment.owner_email != null ? String(appointment.owner_email).trim() : '';
  const contactDisplay = ownerPhone || ownerEmail || '—';

  const effectiveScheduledAt = () => appointment.scheduled_at || appointment.preferred_at;

  const canMarkCompleted = () => {
    const at = effectiveScheduledAt();
    if (!at) return false;
    const scheduledTime = new Date(at);
    const currentTime = new Date();
    return currentTime >= scheduledTime;
  };

  const getAvailableActions = () => {
    switch(appointment.status) {
      case 'pending':
        return ['accept', 'reject', 'cancel'];
      case 'accepted':
        const actions = ['cancel'];
        if (canMarkCompleted()) {
          actions.push('complete');
        }
        return actions;
      default:
        return [];
    }
  };

  const handleAction = async (action) => {
    setLoading(true);
    try {
      let endpoint;
      let updateData;
      
      if (action === 'cancelled') {
        endpoint = `/workshops/workshop/appointments/${appointment.id}/cancel`;
      } else if (action === 'completed') {
        endpoint = `/workshops/workshop/appointments/${appointment.id}/complete`;
      } else {
        endpoint = `/workshops/workshop/appointments/${appointment.id}`;
        updateData = { status: action };
      }
      
      await apiClient.patch(endpoint, updateData);
      toast.success(`Appointment ${action}.`);
      onUpdate();
      onClose();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || `Failed to ${action} appointment.`;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleString();
  };

  const availableActions = getAvailableActions();

  return (
    <div className="appointment-modal-overlay" onClick={onClose}>
      <div className="appointment-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-modal-header">
          <div className="appointment-modal-header-main">
            <h2 className="appointment-modal-title">Appointment Details</h2>
            <span className={`appointment-status appointment-status--header status-${appointment.status}`}>
              {appointment.status}
            </span>
          </div>
          <button type="button" className="appointment-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="appointment-modal-body">
          {/* Customer Information */}
          <div className="appointment-section">
            <div className="appointment-section-header">
              <User size={16} />
              <h3>Customer Information</h3>
            </div>
            <div className="appointment-info-grid appointment-info-grid--customer">
              <div className="appointment-info-item">
                <span className="appointment-info-label">Name:</span>
                <span className="appointment-info-value">{appointment.owner_name || ownerEmail || '—'}</span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Contact Information:</span>
                <span className="appointment-info-value">{contactDisplay}</span>
              </div>
            </div>
          </div>

          {/* Vehicle Information */}
          <div className="appointment-section">
            <div className="appointment-section-header">
              <Car size={16} />
              <h3>Vehicle Information</h3>
            </div>
            <div className="appointment-info-grid appointment-info-grid--vehicle">
              <div className="appointment-info-item">
                <span className="appointment-info-label">Vehicle:</span>
                <span className="appointment-info-value">
                  {[appointment.make, appointment.model, appointment.variant].filter(Boolean).join(' ')}
                </span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Registration:</span>
                <span className="appointment-info-value">{displayOrDash(appointment.registration_number)}</span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Model year:</span>
                <span className="appointment-info-value">{displayOrDash(appointment.model_year)}</span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Transmission:</span>
                <span className="appointment-info-value">{formatTransmissionLabel(appointment.transmission_type)}</span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Body type:</span>
                <span className="appointment-info-value">{formatBodyTypeLabel(appointment.body_type)}</span>
              </div>
              <div className="appointment-info-item">
                <span className="appointment-info-label">Color:</span>
                <span className="appointment-info-value">{displayOrDash(appointment.color)}</span>
              </div>
            </div>
          </div>

          {/* Service Information */}
          <div className="appointment-section">
            <div className="appointment-section-header">
              <Package size={16} />
              <h3>Requested Services</h3>
            </div>
            <div className="appointment-service-info">
              {requestedServicesLabel ? (
                <span className="appointment-service-name">{requestedServicesLabel}</span>
              ) : (
                <span className="appointment-no-service">No specific services requested</span>
              )}
            </div>
          </div>

          {/* Timing Information */}
          <div className="appointment-section">
            <div className="appointment-section-header">
              <Clock size={16} />
              <h3>Timing Information</h3>
            </div>
            <div className="appointment-info-grid">
              {['accepted', 'completed'].includes(appointment.status) ? (
                <div className="appointment-info-item">
                  <span className="appointment-info-label">Scheduled at:</span>
                  <span className="appointment-info-value">{formatDateTime(effectiveScheduledAt())}</span>
                </div>
              ) : (
                <div className="appointment-info-item">
                  <span className="appointment-info-label">Preferred at:</span>
                  <span className="appointment-info-value">{formatDateTime(appointment.preferred_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Customer Notes */}
          {appointment.notes && (
            <div className="appointment-section">
              <div className="appointment-section-header">
                <MessageSquare size={16} />
                <h3>Customer Notes</h3>
              </div>
              <div className="appointment-notes">
                "{appointment.notes}"
              </div>
            </div>
          )}

          {/* Time Validation Warning */}
          {appointment.status === 'accepted' && !canMarkCompleted() && (
            <div className="appointment-warning">
              <Calendar size={16} />
              <span>Mark as completed will be available only after the scheduled time</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {availableActions.length > 0 && (
          <div className="appointment-modal-actions">
            {availableActions.includes('cancel') && (
              <button
                type="button"
                className="card-btn-secondary"
                onClick={() => handleAction('cancelled')}
                disabled={loading}
              >
                Cancel Appointment
              </button>
            )}
            {availableActions.includes('reject') && (
              <button
                type="button"
                className="modal-btn-danger"
                onClick={() => handleAction('rejected')}
                disabled={loading}
              >
                Reject
              </button>
            )}
            {availableActions.includes('accept') && (
              <button
                type="button"
                className="card-btn-primary"
                onClick={() => handleAction('accepted')}
                disabled={loading}
              >
                Accept
              </button>
            )}
            {availableActions.includes('complete') && (
              <button
                type="button"
                className="card-btn-primary"
                onClick={() => handleAction('completed')}
                disabled={loading}
              >
                Mark Completed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentDetailsModal;
