import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Eye, Gavel, Heart, Clock} from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { apiClient } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/MyAuctionsPage.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' }
];

const SORT_OPTIONS = [
  { value: 'newest_first', label: 'Newest first' },
  { value: 'ending_soon', label: 'Ending soon' },
  { value: 'start_soon', label: 'Starting soon' }
];

function openAuctionDetailsInNewTab(auctionId) {
  const path = `/dashboard/owner/auctions/${auctionId}`;
  const url = `${window.location.origin}${path}`;
  window.open(url, '_blank', 'noopener,noreferrer');
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

function AuctionCard({ auction, now, onDeleteDraft, onRequestEndAuction, isEnding }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDeleteDraft(auction.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleEndAuctionClick = () => {
    onRequestEndAuction?.(auction.id);
  };
  const [displaySecondsEnd, setDisplaySecondsEnd] = useState(auction.time_remaining_end_seconds);
  const [displaySecondsStart, setDisplaySecondsStart] = useState(auction.time_remaining_start_seconds);

  useEffect(() => {
    const endAt = auction.end_at ? new Date(auction.end_at) : null;
    const startAt = auction.start_at ? new Date(auction.start_at) : null;
    const tick = () => {
      const n = new Date();
      if (auction.status === 'active' && endAt && endAt > n) {
        setDisplaySecondsEnd(Math.max(0, Math.floor((endAt - n) / 1000)));
      }
      if (auction.status === 'scheduled' && startAt && startAt > n) {
        setDisplaySecondsStart(Math.max(0, Math.floor((startAt - n) / 1000)));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction.status, auction.end_at, auction.start_at]);

  const title = [auction.make, auction.model, auction.variant].filter(Boolean).join(' ') +
    (auction.model_year ? ` · ${auction.model_year}` : '');
  const showCurrentBid = auction.status === 'active' && auction.bid_count > 0 && auction.current_high_bid != null;
  const bidLabel = showCurrentBid ? 'Current bid' : 'Starting bid';
  const bidValue = showCurrentBid ? auction.current_high_bid : auction.starting_bid;

  let timeLabel = null;
  if (auction.status === 'active') {
    timeLabel = displaySecondsEnd != null && displaySecondsEnd > 0
      ? `Ends in ${formatCountdown(displaySecondsEnd)}`
      : 'Ended';
  } else if (auction.status === 'scheduled') {
    timeLabel = displaySecondsStart != null && displaySecondsStart > 0
      ? `Starts in ${formatCountdown(displaySecondsStart)}`
      : 'Starting soon';
  } else if (auction.status === 'ended' || auction.status === 'draft') {
    if (auction.end_at) {
      const d = new Date(auction.end_at);
      timeLabel = `Ended at: ${d.toLocaleDateString(undefined, { dateStyle: 'medium' })} ${d.toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
    } else {
      timeLabel = auction.status === 'draft' ? 'Draft' : null;
    }
  }

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
        <span className="my-auction-card-bid-label">{bidLabel}</span>
        <span className="my-auction-card-bid-value">PKR {typeof bidValue === 'number' ? bidValue.toLocaleString() : bidValue}</span>
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
        {auction.status === 'ended' && auction.outcome && (
          <span className={`badge-pill outcome-${auction.outcome}`}>
            {auction.outcome === 'sold' ? 'Sold' : auction.outcome === 'reserve_not_met' ? 'Reserve not met' : 'No sale'}
          </span>
        )}
        {auction.featured && <span className="badge-pill featured">Featured</span>}
      </div>
      <div className={`my-auction-card-actions ${(auction.status === 'draft' || auction.status === 'active') ? 'my-auction-card-actions-split' : ''}`}>
        {auction.status === 'draft' ? (
          <>
            <button
              type="button"
              className="card-btn-secondary my-auction-card-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              Delete
            </button>
            <button
              type="button"
              className="card-btn-primary my-auction-card-btn"
              onClick={() => navigate(`/dashboard/owner/auctions/edit/${auction.id}`)}
            >
              Edit & Publish
            </button>
          </>
        ) : auction.status === 'ended' ? (
          <button
            type="button"
            className="card-btn-primary my-auction-card-btn"
            onClick={() => navigate(`/dashboard/owner/auctions/${auction.id}/transaction`)}
          >
            View transaction
          </button>
        ) : auction.status === 'active' ? (
          <>
            <button
              type="button"
              className="card-btn-secondary my-auction-card-btn"
              onClick={handleEndAuctionClick}
              disabled={isEnding}
            >
              {isEnding ? 'Ending…' : 'End Auction'}
            </button>
            <button
              type="button"
              className="card-btn-primary my-auction-card-btn"
              onClick={() => openAuctionDetailsInNewTab(auction.id)}
            >
              View details
            </button>
          </>
        ) : (
          <button
            type="button"
            className="card-btn-primary my-auction-card-btn"
            onClick={() => openAuctionDetailsInNewTab(auction.id)}
          >
            View details
          </button>
        )}
      </div>
    </article>
  );
}

const MyAuctionsPage = () => {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest_first');
  const [now, setNow] = useState(() => new Date());
  const [endConfirmAuctionId, setEndConfirmAuctionId] = useState(null);
  const [isEndingAuction, setIsEndingAuction] = useState(false);

  const fetchMyAuctions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/auctions/my-auctions', {
        params: { search: search || undefined, status: status === 'all' ? undefined : status, sort }
      });
      setAuctions(response.data?.data?.auctions ?? []);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load my auctions';
      toast.error(msg);
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, [search, status, sort]);

  const handleDeleteDraft = useCallback(async (auctionId) => {
    try {
      await apiClient.delete(`/auctions/my-auctions/${auctionId}`);
      toast.success('Draft deleted.');
      fetchMyAuctions();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to delete draft.');
    }
  }, [fetchMyAuctions]);

  const pendingEndAuction = endConfirmAuctionId
    ? auctions.find((a) => a.id === endConfirmAuctionId)
    : null;
  const pendingEndTitle = pendingEndAuction
    ? [pendingEndAuction.make, pendingEndAuction.model, pendingEndAuction.variant]
        .filter(Boolean)
        .join(' ') + (pendingEndAuction.model_year ? ` · ${pendingEndAuction.model_year}` : '')
    : '';

  const handleConfirmEndAuction = useCallback(async () => {
    if (!endConfirmAuctionId || isEndingAuction) return;
    setIsEndingAuction(true);
    try {
      await apiClient.post(`/auctions/my-auctions/${endConfirmAuctionId}/end`);
      toast.success('Auction ended successfully.');
      setEndConfirmAuctionId(null);
      fetchMyAuctions();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to end auction.');
    } finally {
      setIsEndingAuction(false);
    }
  }, [endConfirmAuctionId, isEndingAuction, fetchMyAuctions]);

  useEffect(() => {
    fetchMyAuctions();
  }, [fetchMyAuctions]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const filters = [
    { type: 'search', name: 'search', label: 'Search', value: search, onChange: setSearch, placeholder: 'Search make, model, year...', width: 'wide' },
    { type: 'select', name: 'status', label: 'Status', value: status, onChange: setStatus, options: STATUS_OPTIONS },
    { type: 'select', name: 'sort', label: 'Sort', value: sort, onChange: setSort, options: SORT_OPTIONS }
  ];

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="my-auctions-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="My Auctions"
            subtitle="Manage your auction listings. View status, bids, and performance."
            button={{ text: 'Create Auction', onClick: () => navigate('/dashboard/owner/auctions/create') }}
            filters={filters}
          />
          <div className="my-auctions-body">
            {loading ? (
              <section className="my-auctions-list-section">
                <LoadingSpinner message="Loading your auctions..." />
              </section>
            ) : auctions.length === 0 ? (
              <section className="dash-card my-auctions-empty">
                <p>No auctions match your filters. Create your first auction to get started.</p>
              </section>
            ) : (
              <section className="my-auctions-list-section">
                <div className="my-auctions-grid">
                  {auctions.map((a) => (
                    <AuctionCard
                      key={a.id}
                      auction={a}
                      now={now}
                      onDeleteDraft={handleDeleteDraft}
                      onRequestEndAuction={(id) => setEndConfirmAuctionId(id)}
                      isEnding={isEndingAuction && endConfirmAuctionId === a.id}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      <ConfirmModal
        isOpen={endConfirmAuctionId != null}
        title="End this auction?"
        message="Bidding will close immediately. This action cannot be undone."
        detail={pendingEndTitle ? `Listing: ${pendingEndTitle}` : undefined}
        confirmLabel="End auction"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isEndingAuction}
        onClose={() => !isEndingAuction && setEndConfirmAuctionId(null)}
        onConfirm={handleConfirmEndAuction}
      />
    </div>
  );
};

export default MyAuctionsPage;
