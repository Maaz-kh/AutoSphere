import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChevronLeft, Check, User, FileText, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardNavbar from '../components/DashboardNavbar';
import LoadingSpinner from '../components/LoadingSpinner';
import { apiClient } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/TransactionPage.css';

const OUTCOME_LABELS = {
  sold: 'Sold',
  reserve_not_met: 'Reserve not met',
  no_sale: 'No sale'
};

const STATUS_LABELS = {
  pending_seller_decision: 'Pending your decision',
  pending_completion: 'Pending completion',
  completed: 'Completed',
  failed: 'Ended – no sale'
};

const CHECKLIST_LABELS = {
  inspection_completed: 'Vehicle inspection completed',
  payment_completed: 'Payment received/sent',
  docs_transferred: 'Ownership documents transferred',
  vehicle_delivered: 'Vehicle delivered'
};

const TransactionPage = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const isOwner = user?.role === 'vehicle_owner';
  const backPath = isOwner ? '/dashboard/owner/auctions' : '/dashboard/buyer/auctions';
  const backLabel = isOwner ? 'My Auctions' : 'My Bids';

  const fetchTransaction = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/auctions/${auctionId}/transaction`);
      setData(res.data?.data ?? null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Transaction not found';
      if (err?.response?.status === 404) {
        toast.error(msg);
        navigate(backPath);
      } else {
        toast.error(msg);
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!auctionId) return;
    try {
      const res = await apiClient.get(`/auctions/${auctionId}/messages`);
      setMessages(res.data?.data?.messages ?? []);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (auctionId) fetchTransaction();
  }, [auctionId]);

  useEffect(() => {
    if (data?.outcome === 'sold' && auctionId) fetchMessages();
  }, [data?.outcome, auctionId]);

  const handleAcceptBid = async () => {
    try {
      setActionLoading(true);
      await apiClient.post(`/auctions/${auctionId}/accept-bid`);
      toast.success('Bid accepted. The buyer has been notified.');
      await fetchTransaction();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to accept bid.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineBid = async () => {
    if (!window.confirm('Decline the highest bid? All bidders will be notified.')) return;
    try {
      setActionLoading(true);
      await apiClient.post(`/auctions/${auctionId}/decline-bid`);
      toast.success('Bid declined. All bidders have been notified.');
      await fetchTransaction();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to decline bid.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChecklistChange = async (key, value) => {
    try {
      await apiClient.patch(`/auctions/${auctionId}/transaction/checklist`, { [key]: value });
      await fetchTransaction();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update checklist.');
    }
  };

  const handleSendMessage = async () => {
    const trimmed = messageInput.trim();
    if (!trimmed || sendingMessage) return;
    try {
      setSendingMessage(true);
      await apiClient.post(`/auctions/${auctionId}/messages`, { content: trimmed });
      setMessageInput('');
      await fetchMessages();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleConfirmComplete = async () => {
    try {
      setActionLoading(true);
      await apiClient.post(`/auctions/${auctionId}/transaction/confirm-complete`);
      toast.success('Confirmation recorded.');
      await fetchTransaction();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to confirm.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dash-shell">
        <DashboardNavbar />
        <main className="transaction-main">
          <div className="layout-page-inner">
            <LoadingSpinner message="Loading transaction..." />
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-shell">
        <DashboardNavbar />
        <main className="transaction-main">
          <div className="layout-page-inner">
            <section className="dash-card">
              <p>Unable to load transaction.</p>
              <button type="button" className="primary-btn" onClick={() => navigate(backPath)}>
                Back to {backLabel}
              </button>
            </section>
          </div>
        </main>
      </div>
    );
  }

  const vehicleLabel = [data.vehicle?.make, data.vehicle?.model, data.vehicle?.variant].filter(Boolean).join(' ') +
    (data.vehicle?.model_year ? ` · ${data.vehicle.model_year}` : '') || 'Vehicle';

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="transaction-main">
        <div className="layout-page-inner">
        <div className="transaction-container">
          <button type="button" className="transaction-back" onClick={() => navigate(backPath)}>
            <ChevronLeft size={18} />
            {backLabel}
          </button>

          <section className="dash-card transaction-card">
            <div className="transaction-header">
              <h1 className="transaction-title">{vehicleLabel}</h1>
              <div className="transaction-badges">
                <span className={`badge-pill outcome-${data.outcome}`}>
                  {OUTCOME_LABELS[data.outcome] || data.outcome}
                </span>
                <span className={`badge-pill status-${data.transaction_status}`}>
                  {STATUS_LABELS[data.transaction_status] || data.transaction_status}
                </span>
              </div>
            </div>

            {data.final_amount != null && (
              <div className="transaction-amount">
                <span className="transaction-amount-label">Final amount</span>
                <span className="transaction-amount-value">PKR {data.final_amount.toLocaleString()}</span>
              </div>
            )}

            {data.counterparty && (
              <div className="transaction-counterparty">
                <User size={18} />
                <div>
                  <span className="transaction-counterparty-label">
                    {isOwner ? 'Buyer' : 'Seller'}
                  </span>
                  <span className="transaction-counterparty-name">{data.counterparty.full_name || data.counterparty.email}</span>
                  <span className="transaction-counterparty-email">{data.counterparty.email}</span>
                </div>
              </div>
            )}

            {/* Messages – sold transactions */}
            {data.outcome === 'sold' && (
              <div className="transaction-messages">
                <h2 className="transaction-section-title">
                  <MessageCircle size={18} />
                  Messages
                </h2>
                <div className="transaction-messages-list">
                  {messages.length === 0 ? (
                    <p className="transaction-messages-empty">No messages yet. Start the conversation.</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`transaction-message ${m.is_mine ? 'transaction-message-mine' : ''}`}
                      >
                        <div className="transaction-message-header">
                          <span className="transaction-message-sender">{m.sender_name}</span>
                          <span className="transaction-message-time">
                            {new Date(m.created_at).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                        <div className="transaction-message-content">{m.content}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="transaction-messages-input-row">
                  <input
                    type="text"
                    className="transaction-messages-input"
                    placeholder={`Message ${isOwner ? 'buyer' : 'seller'}...`}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={sendingMessage}
                  />
                  <button
                    type="button"
                    className="primary-btn transaction-messages-send"
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !messageInput.trim()}
                  >
                    <Send size={16} />
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* Reserve not met – seller Accept/Decline */}
            {data.can_accept && data.can_decline && (
              <div className="transaction-actions-row">
                <p className="transaction-prompt">Reserve was not met. Accept or decline the highest bid.</p>
                <div className="transaction-actions-split">
                  <button
                    type="button"
                    className="primary-btn transaction-btn"
                    onClick={handleAcceptBid}
                    disabled={actionLoading}
                  >
                    Accept highest bid
                  </button>
                  <button
                    type="button"
                    className="btn-secondary transaction-btn"
                    onClick={handleDeclineBid}
                    disabled={actionLoading}
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Checklist – sold & pending completion */}
            {data.outcome === 'sold' && data.transaction_status === 'pending_completion' && data.checklist && (
              <div className="transaction-checklist">
                <h2 className="transaction-section-title">
                  <FileText size={18} />
                  Transaction checklist
                </h2>
                <div className="transaction-checklist-items">
                  {Object.entries(data.checklist).map(([key, checked]) => (
                    <label key={key} className="transaction-checklist-item">
                      <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={(e) => handleChecklistChange(key, e.target.checked)}
                      />
                      <span>{CHECKLIST_LABELS[key] || key}</span>
                    </label>
                  ))}
                </div>

                {data.can_confirm_complete && (
                  <div className="transaction-confirm-row">
                    <button
                      type="button"
                      className="primary-btn transaction-btn"
                      onClick={handleConfirmComplete}
                      disabled={actionLoading}
                    >
                      <Check size={18} />
                      Confirm transaction completed
                    </button>
                  </div>
                )}

                {data.buyer_confirmed_complete && data.seller_confirmed_complete && (
                  <p className="transaction-completed-msg">Both parties have confirmed. Transaction completed.</p>
                )}
              </div>
            )}

            {data.outcome === 'sold' && data.transaction_status === 'completed' && (
              <p className="transaction-completed-msg">Transaction completed. Both parties have confirmed.</p>
            )}
          </section>
        </div>
        </div>
      </main>
    </div>
  );
};

export default TransactionPage;
