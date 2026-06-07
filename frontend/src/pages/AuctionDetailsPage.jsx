import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/VehicleDetailsPage.css';

const AuctionDetailsPage = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [timeRemainingEnd, setTimeRemainingEnd] = useState(null);
  const [timeRemainingStart, setTimeRemainingStart] = useState(null);

  useEffect(() => {
    const fetchAuction = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/auctions/my-auctions/${auctionId}`);
        setAuction(response.data?.data);
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to load auction details';
        toast.error(msg);
        setAuction(null);
      } finally {
        setLoading(false);
      }
    };
    if (auctionId) fetchAuction();
  }, [auctionId]);

  useEffect(() => {
    if (!auction) return;
    const endAt = auction.end_at ? new Date(auction.end_at) : null;
    const startAt = auction.start_at ? new Date(auction.start_at) : null;
    const tick = () => {
      const n = new Date();
      if (auction.status === 'active' && endAt && endAt > n) {
        setTimeRemainingEnd(Math.max(0, Math.floor((endAt - n) / 1000)));
      } else {
        setTimeRemainingEnd(null);
      }
      if (auction.status === 'scheduled' && startAt && startAt > n) {
        setTimeRemainingStart(Math.max(0, Math.floor((startAt - n) / 1000)));
      } else {
        setTimeRemainingStart(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction?.id, auction?.status, auction?.end_at, auction?.start_at]);

  const getImages = () => {
    if (!auction?.photos?.length) return [];
    return auction.photos.map((p, i) => ({ url: p.image_url, label: `Photo ${i + 1}` }));
  };

  const images = getImages();
  const vehicle = auction ? {
    make: auction.make,
    model: auction.model,
    variant: auction.variant,
    model_year: auction.model_year,
    body_type: auction.body_type,
    fuel_type: auction.fuel_type,
    transmission_type: auction.transmission_type,
    engine_capacity: auction.engine_capacity,
    mileage_km: auction.mileage_km,
    color: auction.color,
    registered_city: auction.registered_city
  } : null;

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const formatCountdown = (seconds) => {
    if (seconds == null || seconds <= 0) return null;
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    parts.push(`${h}h`);
    parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' }) + ' ' + d.toLocaleTimeString(undefined, { timeStyle: 'short' });
  };

  if (loading) {
    return (
      <div className="vehicle-details-page">
        <LoadingSpinner message="Loading auction details..." />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="vehicle-details-page">
        <div className="vehicle-details-error">
          <p>Auction not found or you don&apos;t have access.</p>
          <button
            type="button"
            className="ui-btn-primary vehicle-details-back-btn"
            onClick={() => navigate('/dashboard/owner/auctions')}
          >
            Back to My Auctions
          </button>
        </div>
      </div>
    );
  }

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');

  let timeDisplay = null;
  if (auction.status === 'active') {
    timeDisplay = timeRemainingEnd != null && timeRemainingEnd > 0
      ? `Ends in ${formatCountdown(timeRemainingEnd)}`
      : 'Ended';
  } else if (auction.status === 'scheduled') {
    timeDisplay = timeRemainingStart != null && timeRemainingStart > 0
      ? `Starts in ${formatCountdown(timeRemainingStart)}`
      : 'Starting soon';
  } else if (auction.end_at) {
    timeDisplay = `Ended at: ${formatDateTime(auction.end_at)}`;
  }

  return (
    <div className="vehicle-details-page">
      <div className="vehicle-details-container">
        <div className="vehicle-details-header">
          <h1 className="vehicle-details-title">{title}</h1>
          <button
            type="button"
            className="ui-btn-primary vehicle-details-back-btn"
            onClick={() => navigate('/dashboard/owner/auctions')}
          >
            Back to My Auctions
          </button>
        </div>

        <div className="vehicle-details-content">
          <div className="vehicle-image-section">
            {images.length > 0 ? (
              <div className="image-viewer">
                <div className="image-container">
                  {images.length > 1 && (
                    <button className="image-nav-btn prev" onClick={handlePreviousImage} aria-label="Previous image">
                      <ChevronLeft size={24} />
                    </button>
                  )}
                  <img
                    src={images[currentImageIndex].url}
                    alt={images[currentImageIndex].label}
                    className="vehicle-main-image"
                  />
                  {images.length > 1 && (
                    <button className="image-nav-btn next" onClick={handleNextImage} aria-label="Next image">
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

          <div className="vehicle-attributes-section">
            <div className="detail-section">
              <h3 className="detail-section-title">Auction status</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className="detail-value" style={{ textTransform: 'capitalize' }}>{auction.status}</span>
                </div>
                {auction.featured && (
                  <div className="detail-item">
                    <span className="detail-label">Featured</span>
                    <span className="detail-value">Yes</span>
                  </div>
                )}
                {timeDisplay && (
                  <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="detail-label">Time</span>
                    <span className="detail-value">{timeDisplay}</span>
                  </div>
                )}
                {auction.start_at && (
                  <div className="detail-item">
                    <span className="detail-label">Start</span>
                    <span className="detail-value">{formatDateTime(auction.start_at)}</span>
                  </div>
                )}
                {auction.end_at && (
                  <div className="detail-item">
                    <span className="detail-label">End</span>
                    <span className="detail-value">{formatDateTime(auction.end_at)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">Bidding</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Starting bid</span>
                  <span className="detail-value">PKR {typeof auction.starting_bid === 'number' ? auction.starting_bid.toLocaleString() : auction.starting_bid}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Current high bid</span>
                  <span className="detail-value">
                    {auction.current_high_bid != null
                      ? `PKR ${typeof auction.current_high_bid === 'number' ? auction.current_high_bid.toLocaleString() : auction.current_high_bid}`
                      : 'No bids yet'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Reserve price</span>
                  <span className="detail-value">PKR {typeof auction.reserve_price === 'number' ? auction.reserve_price.toLocaleString() : auction.reserve_price}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total bids</span>
                  <span className="detail-value">{auction.bid_count ?? 0}</span>
                </div>
                {/* {auction.status === 'active' && auction.minimum_next_bid != null && (
                  <div className="detail-item">
                    <span className="detail-label">Minimum next bid</span>
                    <span className="detail-value">PKR {auction.minimum_next_bid.toLocaleString()}</span>
                  </div>
                )} */}
              </div>
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">Metrics</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Views</span>
                  <span className="detail-value">{auction.view_count ?? 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Watchlist</span>
                  <span className="detail-value">{auction.watchlist_count ?? 0}</span>
                </div>
              </div>
            </div>

            {vehicle && (
              <div className="detail-section">
                <h3 className="detail-section-title">Vehicle information</h3>
                <div className="detail-grid">
                  {vehicle.body_type && (
                    <div className="detail-item">
                      <span className="detail-label">Body type</span>
                      <span className="detail-value">{vehicle.body_type}</span>
                    </div>
                  )}
                  {vehicle.fuel_type && (
                    <div className="detail-item">
                      <span className="detail-label">Fuel type</span>
                      <span className="detail-value">{vehicle.fuel_type}</span>
                    </div>
                  )}
                  {vehicle.transmission_type && (
                    <div className="detail-item">
                      <span className="detail-label">Transmission</span>
                      <span className="detail-value">{vehicle.transmission_type}</span>
                    </div>
                  )}
                  {vehicle.engine_capacity && (
                    <div className="detail-item">
                      <span className="detail-label">Engine capacity</span>
                      <span className="detail-value">{vehicle.engine_capacity}</span>
                    </div>
                  )}
                  {vehicle.mileage_km != null && (
                    <div className="detail-item">
                      <span className="detail-label">Mileage</span>
                      <span className="detail-value">{Number(vehicle.mileage_km).toLocaleString()} km</span>
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
                      <span className="detail-label">Registered city</span>
                      <span className="detail-value">{vehicle.registered_city}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {auction.description && (
              <div className="detail-section">
                <h3 className="detail-section-title">Description</h3>
                <p className="detail-value" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{auction.description}</p>
              </div>
            )}

            {auction.status === 'draft' && (
              <div className="vehicle-details-actions vehicle-details-actions--auction-footer">
                <button
                  type="button"
                  className="ui-btn-primary"
                  onClick={() => navigate(`/dashboard/owner/auctions/edit/${auction.id}`)}
                >
                  Edit & Publish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDetailsPage;
