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

const BID_INCREMENT_PKR = 5000;

/** Match backend AuctionService.getMinimumNextBid — use current_high_bid, not bid_count. */
function getMinimumNextBid(auction) {
  if (!auction) return 0;
  const current =
    auction.current_high_bid != null && auction.current_high_bid !== ''
      ? parseFloat(auction.current_high_bid)
      : null;
  const starting = parseFloat(auction.starting_bid);
  if (current == null || Number.isNaN(current)) return Number.isNaN(starting) ? 0 : starting;
  return current + BID_INCREMENT_PKR;
}

const SORT_OPTIONS = [
  { value: 'ending_soon', label: 'Ending soon' },
  { value: 'newest', label: 'Newest' },
  { value: 'lowest_bid', label: 'Lowest bid' },
  { value: 'highest_bid', label: 'Highest bid' },
  { value: 'most_bids', label: 'Most bids' }
];

function openAuctionDetailInNewTab(detailPathPrefix, auctionId) {
  const path = `${detailPathPrefix}/${auctionId}`;
  window.open(`${window.location.origin}${path}`, '_blank', 'noopener,noreferrer');
}

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

function BrowseAuctionCard({ auction, detailPath, onPlaceBid, onToggleWatchlist, isLoggedIn }) {
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  if (!auction) return null;
  const endAt = auction.end_at ? new Date(auction.end_at) : null;
  const now = new Date();
  const initialSeconds =
    (typeof auction.time_remaining_seconds === 'number' ? auction.time_remaining_seconds : null) ??
    (endAt && endAt > now ? Math.floor((endAt - now) / 1000) : 0);
  const [displaySeconds, setDisplaySeconds] = useState(initialSeconds);

  useEffect(() => {
    const end = auction.end_at ? new Date(auction.end_at) : null;
    const tick = () => {
      const n = new Date();
      if (end && end > n) {
        setDisplaySeconds(Math.max(0, Math.floor((end - n) / 1000)));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction.end_at]);

  const handleWatchlistClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn || !onToggleWatchlist || watchlistLoading) return;
    setWatchlistLoading(true);
    try {
      await onToggleWatchlist(auction);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');
  const showCurrentBid = auction.bid_count > 0 && auction.current_high_bid != null;
  const bidLabel = showCurrentBid ? 'Current bid' : 'Starting bid';
  const bidValue = showCurrentBid ? auction.current_high_bid : auction.starting_bid;
  const timeLabel = displaySeconds != null && displaySeconds > 0
    ? `Ends in ${formatCountdown(displaySeconds)}`
    : 'Ending soon';
  const isWatching = Boolean(auction.is_watching);

  return (
    <article className="my-auction-card">
      <div className="my-auction-card-image-wrap">
        {auction.primary_image_url ? (
          <img src={auction.primary_image_url} alt={title} className="my-auction-card-image" />
        ) : (
          <div className="my-auction-card-image-placeholder">No image</div>
        )}
        {isLoggedIn && (
          <button
            type="button"
            className={`my-auction-card-watchlist-btn ${isWatching ? 'is-watching' : ''}`}
            onClick={handleWatchlistClick}
            disabled={watchlistLoading}
            title={isWatching ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-label={isWatching ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Heart size={20} fill={isWatching ? 'currentColor' : 'none'} strokeWidth={2} className="watchlist-heart-icon" />
          </button>
        )}
      </div>
      <h3 className="my-auction-card-title">{title}</h3>
      <div className="my-auction-card-bid">
        <span className="my-auction-card-bid-label">{bidLabel}</span>
        <span className="my-auction-card-bid-value">PKR {typeof bidValue === 'number' ? bidValue.toLocaleString() : bidValue}</span>
      </div>
      <div className="my-auction-card-time">
        <Clock size={14} className="my-auction-card-time-icon" />
        <span>{timeLabel}</span>
      </div>
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
        {auction.reserve_met ? (
          <span className="badge-pill reserve-met">Reserve met</span>
        ) : (
          <span className="badge-pill reserve-not-met">Reserve not met</span>
        )}
        {auction.featured && <span className="badge-pill featured">Featured</span>}
      </div>
      <div className="my-auction-card-actions my-auction-card-actions-split">
        <button
          type="button"
          className="card-btn-secondary my-auction-card-btn"
          onClick={() => openAuctionDetailInNewTab(detailPath, auction.id)}
        >
          View details
        </button>
        <button
          type="button"
          className="card-btn-primary my-auction-card-btn"
          onClick={() => onPlaceBid(auction)}
        >
          Place bid
        </button>
      </div>
    </article>
  );
}

function PlaceBidModal({ auction, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const minNextBid = auction
    ? (auction.minimum_next_bid != null && !Number.isNaN(Number(auction.minimum_next_bid))
        ? Number(auction.minimum_next_bid)
        : getMinimumNextBid(auction))
    : 0;

  useEffect(() => {
    if (auction) {
      setAmount(String(minNextBid));
      setError('');
    }
  }, [auction, minNextBid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const val = parseFloat(amount);
    if (isNaN(val) || val < minNextBid) {
      setError(`Bid must be at least PKR ${minNextBid.toLocaleString()}`);
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(`/auctions/${auction.id}/bids`, { amount: val });
      toast.success('Bid placed successfully!');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to place bid';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!auction) return null;

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');

  return (
    <div className="place-bid-modal-overlay" onClick={onClose}>
      <div
        className="place-bid-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-bid-modal-title"
      >
        <h2 id="place-bid-modal-title" className="place-bid-modal-title">Place bid</h2>
        <p className="place-bid-modal-subtitle">{title}</p>
        <form onSubmit={handleSubmit} className="place-bid-modal-form">
          <div className="form-group">
            <label htmlFor="bid-amount">Your bid (PKR)</label>
            <input
              id="bid-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minNextBid}
              step={BID_INCREMENT_PKR}
              required
              autoFocus
              disabled={loading}
              className={error ? 'error' : ''}
            />
            <span className="place-bid-modal-hint">Minimum next bid is PKR {minNextBid.toLocaleString()}</span>
          </div>
          {error && <span className="field-error place-bid-modal-error">{error}</span>}
          <div className="place-bid-modal-actions">
            <button type="button" className="place-bid-modal-btn place-bid-modal-btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="place-bid-modal-btn place-bid-modal-btn-submit" disabled={loading}>
              {loading ? 'Placing bid…' : 'Place bid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const BrowseAuctionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidModalAuction, setBidModalAuction] = useState(null);
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('ending_soon');

  const detailPath = user?.role === 'buyer' ? '/dashboard/buyer/auctions' : '/dashboard/owner/auctions/view';

  const handleToggleWatchlist = useCallback(async (auction) => {
    try {
      if (auction.is_watching) {
        await apiClient.delete(`/auctions/${auction.id}/watchlist`);
        toast.success('Removed from watchlist.');
      } else {
        await apiClient.post(`/auctions/${auction.id}/watchlist`);
        toast.success('Added to watchlist.');
      }
      setAuctions((prev) =>
        prev.map((a) =>
          a.id === auction.id
            ? {
                ...a,
                is_watching: !a.is_watching,
                watchlist_count: Math.max(0, (a.watchlist_count ?? 0) + (a.is_watching ? -1 : 1))
              }
            : a
        )
      );
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update watchlist';
      toast.error(msg);
    }
  }, []);

  const fetchAuctions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/auctions', {
        params: {
          search: search || undefined,
          min_price: minPrice || undefined,
          max_price: maxPrice || undefined,
          sort,
          page: 1,
          limit: 50
        }
      });
      setAuctions(response.data?.data?.auctions ?? []);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load auctions';
      toast.error(msg);
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, [search, minPrice, maxPrice, sort]);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  const filters = [
    { type: 'search', name: 'search', label: 'Search', value: search, onChange: setSearch, placeholder: 'Make, model, year...', width: 'wide' },
    { type: 'number', name: 'min_price', label: 'Min price (PKR)', value: minPrice, onChange: setMinPrice, placeholder: 'Min', min: 0 },
    { type: 'number', name: 'max_price', label: 'Max price (PKR)', value: maxPrice, onChange: setMaxPrice, placeholder: 'Max', min: 0 },
    { type: 'select', name: 'sort', label: 'Sort', value: sort, onChange: setSort, options: SORT_OPTIONS }
  ];

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="my-auctions-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Browse Auctions"
            subtitle="Find vehicles and place bids. All listings are active and open for bidding."
            button={user?.role === 'vehicle_owner' ? { text: 'My Auctions', onClick: () => navigate('/dashboard/owner/auctions') } : undefined}
            filters={filters}
          />
          <div className="my-auctions-body">
            {loading ? (
              <section className="my-auctions-list-section">
                <LoadingSpinner message="Loading auctions..." />
              </section>
            ) : auctions.length === 0 ? (
              <section className="dash-card my-auctions-empty">
                <p>No active auctions match your filters. Try broadening your search.</p>
              </section>
            ) : (
              <section className="my-auctions-list-section">
                <div className="my-auctions-grid">
                  {auctions.map((a) => (
                    <BrowseAuctionCard
                      key={a.id}
                      auction={a}
                      detailPath={detailPath}
                      onPlaceBid={(auction) => setBidModalAuction(auction)}
                      onToggleWatchlist={handleToggleWatchlist}
                      isLoggedIn={!!user}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
          {bidModalAuction && (
            <PlaceBidModal
              auction={bidModalAuction}
              onClose={() => setBidModalAuction(null)}
              onSuccess={() => fetchAuctions()}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default BrowseAuctionsPage;
