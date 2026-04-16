import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { Eye, Gavel, Heart, Clock } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import LoadingSpinner from '../components/LoadingSpinner';
import { apiClient } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/MyAuctionsPage.css';

const SORT_OPTIONS = [
  { value: 'ending_soon', label: 'Ending soon' },
  { value: 'newest', label: 'Newest first' }
];

function formatCountdown(seconds) {
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
}

function BidCard({ auction, isOwner }) {
  const navigate = useNavigate();
  const bidsPath = isOwner ? '/dashboard/owner/bids' : '/dashboard/buyer/bids';
  const transactionPath = isOwner
    ? `/dashboard/owner/auctions/${auction.id}/transaction`
    : `/dashboard/buyer/auctions/${auction.id}/transaction`;
  const detailPath = isOwner
    ? `/dashboard/owner/auctions/view/${auction.id}`
    : `/dashboard/buyer/auctions/${auction.id}`;

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');
  const showCurrentBid = auction.status === 'active' && auction.bid_count > 0 && auction.current_high_bid != null;
  const bidLabel = showCurrentBid ? 'Current bid' : 'Starting bid';
  const bidValue = showCurrentBid ? auction.current_high_bid : auction.starting_bid;

  let timeLabel = null;
  if (auction.status === 'active') {
    timeLabel = auction.time_remaining_seconds != null && auction.time_remaining_seconds > 0
      ? `Ends in ${formatCountdown(auction.time_remaining_seconds)}`
      : 'Ended';
  } else if (auction.status === 'ended') {
    if (auction.end_at) {
      const d = new Date(auction.end_at);
      timeLabel = `Ended: ${d.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
    }
  }

  const bidStatusLabel = () => {
    if (auction.status !== 'ended') return null;
    if (!auction.is_high_bidder) return 'Outbid';
    if (auction.outcome === 'sold') return 'Won';
    if (auction.outcome === 'reserve_not_met') return 'Pending seller decision';
    if (auction.outcome === 'no_sale') return 'No sale';
    return null;
  };

  const bidStatus = bidStatusLabel();
  const showViewTransaction = auction.status === 'ended' && auction.is_high_bidder;

  return (
    <article className="my-auction-card">
      <div className="my-auction-card-image-wrap">
        {auction.primary_image_url ? (
          <img src={auction.primary_image_url} alt={title} className="my-auction-card-image" />
        ) : (
          <div className="my-auction-card-image-placeholder">No image</div>
        )}
      </div>
      <h3 className="my-auction-card-title">{title}</h3>
      <div className="my-auction-card-bid">
        <span className="my-auction-card-bid-label">Your last bid</span>
        <span className="my-auction-card-bid-value">
          PKR {typeof auction.my_last_bid === 'number' ? auction.my_last_bid.toLocaleString() : auction.my_last_bid ?? '—'}
        </span>
      </div>
      {timeLabel && (
        <div className="my-auction-card-time">
          <Clock className="my-auction-card-time-icon" />
          <span>{timeLabel}</span>
        </div>
      )}
      <div className="my-auction-card-metrics">
        <span className="my-auction-card-metric" title="Views">
          <Eye size={14} /> {auction.view_count ?? 0}
        </span>
        <span className="my-auction-card-metric" title="Bids">
          <Gavel size={14} /> {auction.bid_count ?? 0}
        </span>
        <span className="my-auction-card-metric" title="Watchlist">
          <Heart size={14} /> {auction.watchlist_count ?? 0}
        </span>
      </div>
      <div className="my-auction-card-badges">
        <span className={`badge-pill status-${auction.status}`}>{auction.status}</span>
        {auction.is_high_bidder && auction.status === 'active' && (
          <span className="badge-pill bidder-high">Highest bidder</span>
        )}
        {auction.status === 'ended' && bidStatus && (
          <span className={`badge-pill bid-status-${(bidStatus || '').replace(/\s+/g, '-').toLowerCase()}`}>
            {bidStatus}
          </span>
        )}
      </div>
      <div className="my-auction-card-actions">
        {showViewTransaction ? (
          <button
            type="button"
            className="card-btn-primary my-auction-card-btn"
            onClick={() => navigate(transactionPath)}
          >
            View transaction
          </button>
        ) : (
          <button
            type="button"
            className="card-btn-primary my-auction-card-btn"
            onClick={() => navigate(detailPath)}
          >
            View details
          </button>
        )}
      </div>
    </article>
  );
}

const MyBidsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.role === 'vehicle_owner';
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyBids = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/auctions/my-bids');
      setAuctions(response.data?.data?.auctions ?? []);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load my bids';
      toast.error(msg);
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyBids();
  }, [fetchMyBids]);

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="my-auctions-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="My Bids"
            subtitle="Auctions you have bid on. Track your bids and view transaction details for won auctions."
            button={{
              text: 'Browse Auctions',
              onClick: () => navigate(isOwner ? '/dashboard/owner/auctions/browse' : '/dashboard/buyer/auctions')
            }}
            filters={[]}
          />
          <div className="my-auctions-body">
            {loading ? (
              <section className="my-auctions-list-section">
                <LoadingSpinner message="Loading your bids..." />
              </section>
            ) : auctions.length === 0 ? (
              <section className="dash-card my-auctions-empty">
                <p>You have not placed any bids yet.</p>
              </section>
            ) : (
              <section className="my-auctions-list-section">
                <div className="my-auctions-grid">
                  {auctions.map((a) => (
                    <BidCard key={a.id} auction={a} isOwner={isOwner} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MyBidsPage;
