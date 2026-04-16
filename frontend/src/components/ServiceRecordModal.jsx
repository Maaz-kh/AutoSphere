import { X, RefreshCw } from 'lucide-react';
import '../styles/ServiceRecordModal.css';

const ServiceRecordModal = ({ record, fullDetails, loadingDetails, onClose, onRefresh }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return `Rs. ${parseFloat(amount || 0).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const report = fullDetails?.report || null;

  // Normalize data shape to handle snake_case or camelCase
  const replacedParts =
    report?.replacedParts ||
    report?.replaced_parts ||
    report?.replaced_parts_list ||
    record?.replacedParts ||
    record?.replaced_parts ||
    [];

  const updatedParts =
    report?.updatedParts ||
    report?.updated_parts ||
    report?.updated_parts_list ||
    record?.updatedParts ||
    record?.updated_parts ||
    [];

  const laborCharges =
    report?.laborCharges ?? report?.labor_charges ?? record?.labor_charges;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content service-record-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Service Record Details</h2>
          <div className="modal-header-actions">
            {onRefresh && (
              <button
                type="button"
                className="modal-refresh-btn"
                onClick={onRefresh}
                disabled={loadingDetails}
                title="Refresh from blockchain"
                aria-label="Refresh details"
              >
                <RefreshCw size={18} className={loadingDetails ? 'spinning' : ''} />
              </button>
            )}
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {loadingDetails ? (
            <div className="loading-details">
              <p>Loading full details from blockchain...</p>
            </div>
          ) : (
            <>
              <div className="detail-section">
                <h3 className="detail-section-title">Vehicle Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Chassis Number</span>
                    <span className="detail-value">{record.vehicle_id || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {report ? (
                <div className="detail-section">
                  <h3 className="detail-section-title">Service Details</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Service Date & Time</span>
                      <span className="detail-value">
                        {formatDate(record.service_date || report.serviceDate || report.service_date)}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Odometer Reading</span>
                      <span className="detail-value">
                        {(report.odometer ?? report.odometer_reading ?? report.odometerReading)?.toLocaleString() || 'N/A'} km
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Replaced Parts</span>
                      {replacedParts && replacedParts.length > 0 ? (
                        <div className="parts-list-inline">
                          {replacedParts.map((part, index) => (
                            <div key={index} className="part-item-inline">
                              <span className="part-name">{part.name || part.part_name || part.partName}</span>
                              <span className="part-price">
                                {formatCurrency(part.price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="detail-value">N/A</span>
                      )}
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Updated Parts</span>
                      {updatedParts && updatedParts.length > 0 ? (
                        <div className="parts-list-inline">
                          {updatedParts.map((part, index) => (
                            <div key={index} className="part-item-inline">
                              <span className="part-name">{part.name || part.part_name || part.partName}</span>
                              <span className="part-price">
                                {formatCurrency(part.price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="detail-value">N/A</span>
                      )}
                    </div>

                    {report.description && (
                      <div className="detail-item full-width">
                        <span className="detail-label">Description</span>
                        <span className="detail-value">{report.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="detail-section">
                  <p className="detail-message">
                    Full service details could not be loaded from blockchain.
                  </p>
                </div>
              )}

              <div className="detail-section charges-summary">
                <h3 className="detail-section-title">Charges Summary</h3>
                <div className="charges-breakdown">
                  {report && (
                    <>
                      {replacedParts && replacedParts.length > 0 && (
                        <div className="charge-item">
                          <span className="charge-label">Replaced Parts</span>
                          <span className="charge-value">
                            {formatCurrency(
                              replacedParts.reduce(
                                (sum, part) => sum + parseFloat(part.price || 0),
                                0
                              )
                            )}
                          </span>
                        </div>
                      )}
                      {updatedParts && updatedParts.length > 0 && (
                        <div className="charge-item">
                          <span className="charge-label">Updated Parts</span>
                          <span className="charge-value">
                            {formatCurrency(
                              updatedParts.reduce(
                                (sum, part) => sum + parseFloat(part.price || 0),
                                0
                              )
                            )}
                          </span>
                        </div>
                      )}
                      {laborCharges && (
                        <div className="charge-item">
                          <span className="charge-label">Labor Charges</span>
                          <span className="charge-value">
                            {formatCurrency(laborCharges)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="charge-item total">
                    <span className="charge-label">Total Charges</span>
                    <span className="charge-value">
                      {formatCurrency(record.total_charges)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceRecordModal;

