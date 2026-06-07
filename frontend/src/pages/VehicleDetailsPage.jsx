import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../services/api';
import '../styles/VehicleDetailsPage.css';

const VehicleDetailsPage = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    fetchVehicleDetails();
  }, [vehicleId]);

  const fetchVehicleDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/vehicles/${vehicleId}`);
      setVehicle(response.data?.data);
      
      // Set first image to front_image
      if (response.data?.data?.front_image_path) {
        setCurrentImageIndex(0);
      }
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load vehicle details';
      toast.error(msg);
      console.error('Vehicle details error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleImages = () => {
    if (!vehicle) return [];
    const images = [];
    if (vehicle.front_image_path) images.push({ url: vehicle.front_image_path, label: 'Front View' });
    if (vehicle.back_image_path) images.push({ url: vehicle.back_image_path, label: 'Back View' });
    if (vehicle.interior_image_path) images.push({ url: vehicle.interior_image_path, label: 'Interior View' });
    return images;
  };

  const images = getVehicleImages();

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="vehicle-details-page">
        <div className="vehicle-details-loading">
          <p>Loading vehicle details...</p>
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="vehicle-details-page">
        <div className="vehicle-details-error">
          <p>Vehicle not found</p>
          <button className="primary-btn" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vehicle-details-page">
      <div className="vehicle-details-container">
        {/* Header */}
        <div className="vehicle-details-header">
          <h1 className="vehicle-details-title">
            {vehicle.make} {vehicle.model} {vehicle.variant ? vehicle.variant : ''} {vehicle.model_year ? `· ${vehicle.model_year}` : ''}
          </h1>
          <button
            type="button"
            className="ui-btn-primary vehicle-details-back-btn"
            onClick={() => navigate('/dashboard/owner')}
          >
            Back to My Vehicles
          </button>
        </div>

        {/* Main Content */}
        <div className="vehicle-details-content">
          {/* Image Section */}
          <div className="vehicle-image-section">
            {images.length > 0 ? (
              <div className="image-viewer">
                <div className="image-container">
                  {images.length > 1 && (
                    <button
                      className="image-nav-btn prev"
                      onClick={handlePreviousImage}
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={24} />
                    </button>
                  )}
                  <img
                    src={images[currentImageIndex].url}
                    alt={images[currentImageIndex].label}
                    className="vehicle-main-image"
                  />
                  {images.length > 1 && (
                    <button
                      className="image-nav-btn next"
                      onClick={handleNextImage}
                      aria-label="Next image"
                    >
                      <ChevronRight size={24} />
                    </button>
                  )}
                </div>
                <div className="image-indicator">
                  {images.map((_, idx) => (
                    <span
                      key={idx}
                      className={`indicator-dot ${idx === currentImageIndex ? 'active' : ''}`}
                      onClick={() => setCurrentImageIndex(idx)}
                    />
                  ))}
                </div>
                <p className="image-label">{images[currentImageIndex].label}</p>
              </div>
            ) : (
              <div className="no-image-placeholder">
                <p>No images available</p>
              </div>
            )}
          </div>

          {/* Attributes Section */}
          <div className="vehicle-attributes-section">
            <div className="detail-section">
              <h3 className="detail-section-title">Vehicle Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Registration Number</span>
                  <span className="detail-value">{vehicle.registration_number || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Chassis Number</span>
                  <span className="detail-value">{vehicle.chassis_number || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Engine Number</span>
                  <span className="detail-value">{vehicle.engine_number || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Body Type</span>
                  <span className="detail-value">{vehicle.body_type || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fuel Type</span>
                  <span className="detail-value">{vehicle.fuel_type || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Transmission</span>
                  <span className="detail-value">{vehicle.transmission_type || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Assembly</span>
                  <span className="detail-value">{vehicle.assembly || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Engine Capacity</span>
                  <span className="detail-value">{vehicle.engine_capacity || 'N/A'}</span>
                </div>
                {vehicle.mileage_km && (
                  <div className="detail-item">
                    <span className="detail-label">Mileage</span>
                    <span className="detail-value">{vehicle.mileage_km.toLocaleString()} km</span>
                  </div>
                )}
                {vehicle.color && (
                  <div className="detail-item">
                    <span className="detail-label">Color</span>
                    <span className="detail-value">{vehicle.color}</span>
                  </div>
                )}
                {vehicle.registered_city && (
                  <div className="detail-item">
                    <span className="detail-label">Registered City</span>
                    <span className="detail-value">{vehicle.registered_city}</span>
                  </div>
                )}
                {vehicle.purchase_date && (
                  <div className="detail-item">
                    <span className="detail-label">Purchase Date</span>
                    <span className="detail-value">{formatDate(vehicle.purchase_date)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="vehicle-details-actions vehicle-details-actions--dual">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  navigate('/dashboard/owner/history', { state: { chassisNumber: vehicle.chassis_number } });
                }}
              >
                View Service History
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  navigate('/dashboard/owner/valuation', { state: { vehicle } });
                }}
              >
                AI-based Valuation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetailsPage;

