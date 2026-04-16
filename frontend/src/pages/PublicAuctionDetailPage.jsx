import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/Dashboard.css';
import '../styles/VehicleDetailsPage.css';

const PublicAuctionDetailPage = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);

  const isBuyerOrOwner = user && (user.role === 'buyer' || user.role === 'vehicle_owner');
  const canBid = isBuyerOrOwner && auction && auction.seller_id !== user?.userId;
  const backPath = location.pathname.includes('/buyer/') ? '/dashboard/buyer/auctions' : '/dashboard/owner/auctions/browse';

  useEffect(() => {
    const fetchAuction = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/auctions/${auctionId}`);
        setAuction(response.data?.data);
        if (response.data?.data?.minimum_next_bid != null) {
          setBidAmount(String(response.data.data.minimum_next_bid));
        }
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to load auction';
        toast.error(msg);
        setAuction(null);
      } finally {
        setLoading(false);
      }
    };
    if (auctionId) fetchAuction();
  }, [auctionId]);

  useEffect(() => {
    if (!auction?.end_at) return;
    const endAt = new Date(auction.end_at);
    const tick = () => {
      const n = new Date();
      setTimeRemaining(endAt > n ? Math.max(0, Math.floor((endAt - n) / 1000)) : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction?.end_at]);

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

  const handlePreviousImage = () => setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  const handleNextImage = () => setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));

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

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' }) + ' ' + d.toLocaleTimeString(undefined, { timeStyle: 'short' });
  };

  const handlePlaceBid = async (e) => {
    e.preventDefault();
    if (!canBid || !auction) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid bid amount.');
      return;
    }
    setSubmittingBid(true);
    try {
      await apiClient.post(`/auctions/${auctionId}/bids`, { amount });
      toast.success('Bid placed successfully. You are the current high bidder!');
      const res = await apiClient.get(`/auctions/${auctionId}`);
      setAuction(res.data?.data);
      setBidAmount(res.data?.data?.minimum_next_bid != null ? String(res.data.data.minimum_next_bid) : '');
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to place bid';
      toast.error(msg);
    } finally {
      setSubmittingBid(false);
    }
  };

  const wrapWithShell = (content) => (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="public-auction-detail-main">
        <div className="layout-page-inner">{content}</div>
      </main>
    </div>
  );

  if (loading) {
    return wrapWithShell(
      <div className="vehicle-details-page vehicle-details-page--dashboard">
        <LoadingSpinner message="Loading auction..." />
      </div>
    );
  }

  if (!auction) {
    return wrapWithShell(
      <div className="vehicle-details-page vehicle-details-page--dashboard">
        <div className="vehicle-details-error">
          <p>Auction not found or no longer active.</p>
          <button type="button" className="ui-btn-primary" onClick={() => navigate(backPath)}>Back to Auctions</button>
        </div>
      </div>
    );
  }

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');
  const timeDisplay = timeRemaining != null && timeRemaining > 0
    ? `Ends in ${formatCountdown(timeRemaining)}`
    : 'Auction ended';

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="public-auction-detail-main">
        <div className="layout-page-inner">
          <div className="vehicle-details-page vehicle-details-page--dashboard">
      <div className="vehicle-details-container">
        <div className="vehicle-details-header">
          <h1 className="vehicle-details-title">{title}</h1>
          <button className="close-page-btn" onClick={() => navigate(backPath)} aria-label="Close">
            <X size={24} />
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
                  <img src={images[currentImageIndex].url} alt={images[currentImageIndex].label} className="vehicle-main-image" />
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
              <div className="no-image-placeholder"><p>No images available</p></div>
            )}
          </div>

          <div className="vehicle-attributes-section">
            <div className="detail-section">
              <h3 className="detail-section-title">Time & status</h3>
              <div className="detail-grid">
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-label">Time remaining</span>
                  <span className="detail-value">{timeDisplay}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Reserve</span>
                  <span className="detail-value">{auction.reserve_met ? 'Met' : 'Not met'}</span>
                </div>
                {auction.end_at && (
                  <div className="detail-item">
                    <span className="detail-label">Ends at</span>
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
                {auction.minimum_next_bid != null && (
                  <div className="detail-item">
                    <span className="detail-label">Minimum next bid</span>
                    <span className="detail-value">PKR {auction.minimum_next_bid.toLocaleString()}</span>
                  </div>
                )}
                <div className="detail-item">
                  <span className="detail-label">Total bids</span>
                  <span className="detail-value">{auction.bid_count ?? 0}</span>
                </div>
              </div>
            </div>

            {canBid && timeRemaining != null && timeRemaining > 0 && (
              <div className="detail-section">
                <h3 className="detail-section-title">Place bid</h3>
                <form className="public-auction-bid-form" onSubmit={handlePlaceBid}>
                  <div className="ui-form-group">
                    <label htmlFor="bid_amount" className="ui-label">Your bid (PKR)</label>
                    <input
                      id="bid_amount"
                      type="number"
                      className="ui-input"
                      min={auction.minimum_next_bid ?? auction.starting_bid}
                      step="5000"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={auction.minimum_next_bid != null ? String(auction.minimum_next_bid) : String(auction.starting_bid)}
                    />
                  </div>
                  <div className="public-auction-bid-submit-row">
                    <button type="submit" className="ui-btn-primary" disabled={submittingBid}>
                      {submittingBid ? 'Placing bid...' : 'Place bid'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {vehicle && (
              <div className="detail-section">
                <h3 className="detail-section-title">Vehicle information</h3>
                <div className="detail-grid">
                  {vehicle.body_type && <div className="detail-item"><span className="detail-label">Body type</span><span className="detail-value">{vehicle.body_type}</span></div>}
                  {vehicle.fuel_type && <div className="detail-item"><span className="detail-label">Fuel type</span><span className="detail-value">{vehicle.fuel_type}</span></div>}
                  {vehicle.transmission_type && <div className="detail-item"><span className="detail-label">Transmission</span><span className="detail-value">{vehicle.transmission_type}</span></div>}
                  {vehicle.engine_capacity && <div className="detail-item"><span className="detail-label">Engine capacity</span><span className="detail-value">{vehicle.engine_capacity}</span></div>}
                  {vehicle.mileage_km != null && <div className="detail-item"><span className="detail-label">Mileage</span><span className="detail-value">{Number(vehicle.mileage_km).toLocaleString()} km</span></div>}
                  {vehicle.color && <div className="detail-item"><span className="detail-label">Color</span><span className="detail-value">{vehicle.color}</span></div>}
                  {vehicle.registered_city && <div className="detail-item"><span className="detail-label">Registered city</span><span className="detail-value">{vehicle.registered_city}</span></div>}
                </div>
              </div>
            )}

            {auction.description && (
              <div className="detail-section">
                <h3 className="detail-section-title">Description</h3>
                <p className="detail-value" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{auction.description}</p>
              </div>
            )}

            <div className="vehicle-details-actions vehicle-details-actions--center">
              <button type="button" className="ui-btn-primary" onClick={() => navigate(backPath)}>Back to Auctions</button>
            </div>
          </div>
        </div>
      </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PublicAuctionDetailPage;
