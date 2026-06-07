const AuctionRepository = require('../repositories/auction-repository');
const TransactionRepository = require('../repositories/transaction-repository');
const UserRepository = require('../repositories/user-repository');
const VehicleRepository = require('../repositories/vehicle-repository');
const EmailService = require('./email-service');

class TransactionService {
  constructor() {
    this.auctionRepository = AuctionRepository;
    this.transactionRepository = TransactionRepository;
    this.userRepository = UserRepository;
    this.vehicleRepository = VehicleRepository;
    this.emailService = EmailService;
  }

  /**
   * Process ended auctions: create transaction, send notifications.
   * Called by cron when active auctions have end_at <= NOW.
   */
  async processEndedAuctions() {
    const toEnd = await this.auctionRepository.findActiveToEnd();
    for (const auction of toEnd) {
      try {
        await this.finalizeAuctionEnd(auction, {
          endReason: 'duration_elapsed',
          endedByUserId: null
        });
      } catch (err) {
        console.error(`[TransactionService] Error processing ended auction ${auction.id}:`, err.message);
      }
    }
  }

  buildTransactionOutcome(auction) {
    const reserveMet =
      auction.reserve_price != null &&
      auction.current_high_bid != null &&
      parseFloat(auction.current_high_bid) >= parseFloat(auction.reserve_price);
    const winnerId = auction.current_high_bidder_id
      ? parseInt(auction.current_high_bidder_id, 10)
      : null;
    const finalAmount = auction.current_high_bid
      ? parseFloat(auction.current_high_bid)
      : null;

    let outcome = 'no_sale';
    let transactionStatus = 'completed';

    if (winnerId && finalAmount != null) {
      if (reserveMet) {
        outcome = 'sold';
        transactionStatus = 'pending_completion';
      } else {
        outcome = 'reserve_not_met';
        transactionStatus = 'pending_seller_decision';
      }
    }

    return { winnerId, finalAmount, outcome, transactionStatus };
  }

  async sendAuctionEndedNotifications(auction, outcomeData) {
    const { winnerId, finalAmount, outcome } = outcomeData;
    const seller = await this.userRepository.findWithProfile(auction.seller_id);
    const winner = winnerId ? await this.userRepository.findWithProfile(winnerId) : null;

    if (outcome === 'sold') {
      if (winner && winner.email) {
        await this.emailService.sendAuctionEndedSoldToWinner({
          to: winner.email,
          auction: { make: auction.make, model: auction.model, model_year: auction.model_year },
          amount: finalAmount
        }).catch((e) => console.error('[TransactionService] sendAuctionEndedSoldToWinner:', e.message));
      }
      if (seller && seller.email) {
        await this.emailService.sendAuctionEndedSoldToSeller({
          to: seller.email,
          auction: { make: auction.make, model: auction.model, model_year: auction.model_year },
          amount: finalAmount
        }).catch((e) => console.error('[TransactionService] sendAuctionEndedSoldToSeller:', e.message));
      }
    } else if (outcome === 'reserve_not_met') {
      if (seller && seller.email) {
        await this.emailService.sendAuctionEndedReserveNotMetToSeller({
          to: seller.email,
          auction: { make: auction.make, model: auction.model, model_year: auction.model_year },
          amount: finalAmount
        }).catch((e) => console.error('[TransactionService] sendAuctionEndedReserveNotMetToSeller:', e.message));
      }
      if (winner && winner.email) {
        await this.emailService.sendAuctionEndedReserveNotMetToWinner({
          to: winner.email,
          auction: { make: auction.make, model: auction.model, model_year: auction.model_year }
        }).catch((e) => console.error('[TransactionService] sendAuctionEndedReserveNotMetToWinner:', e.message));
      }
    }
  }

  async finalizeAuctionEnd(auction, { endReason = 'duration_elapsed', endedByUserId = null } = {}) {
    if (!auction || !auction.id) throw new Error('Auction not found.');

    const alreadyHasTransaction = await this.transactionRepository.transactionExists(auction.id);
    await this.auctionRepository.endAuctionWithReason(auction.id, endReason, endedByUserId);
    if (alreadyHasTransaction) {
      return await this.transactionRepository.findByAuctionId(auction.id);
    }

    const outcomeData = this.buildTransactionOutcome(auction);
    await this.transactionRepository.create({
      auction_id: auction.id,
      winner_id: outcomeData.winnerId,
      seller_id: auction.seller_id,
      final_amount: outcomeData.finalAmount,
      outcome: outcomeData.outcome,
      transaction_status: outcomeData.transactionStatus
    });
    await this.sendAuctionEndedNotifications(auction, outcomeData);

    return await this.transactionRepository.findByAuctionId(auction.id);
  }

  async endAuctionEarly(auctionId, endedByUserId) {
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    if (!auction) throw new Error('Auction not found.');
    if (auction.status !== 'active') {
      throw new Error('Only active auctions can be ended early.');
    }
    await this.finalizeAuctionEnd(auction, {
      endReason: 'seller_ended',
      endedByUserId
    });
    return this.getTransactionSummary(auctionId, auction.seller_id, 'vehicle_owner');
  }

  /**
   * Seller accepts highest bid when reserve not met. (Phase 2)
   */
  async acceptBid(auctionId, userId) {
    const transaction = await this.transactionRepository.findByAuctionId(auctionId);
    if (!transaction) throw new Error('Transaction not found.');
    if (transaction.seller_id !== userId) throw new Error('Only the seller can accept the bid.');
    if (transaction.outcome !== 'reserve_not_met' || transaction.transaction_status !== 'pending_seller_decision') {
      throw new Error('This auction is not pending your acceptance.');
    }

    await this.transactionRepository.updateOutcome(auctionId, 'sold', 'pending_completion');
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    const winner = transaction.winner_id ? await this.userRepository.findWithProfile(transaction.winner_id) : null;
    if (winner && winner.email) {
      await this.emailService.sendAuctionEndedAcceptToWinner({
        to: winner.email,
        auction: { make: auction.make, model: auction.model, model_year: auction.model_year },
        amount: transaction.final_amount
      }).catch((e) => console.error('[TransactionService] sendAuctionEndedAcceptToWinner:', e.message));
    }
    return this.getTransactionSummary(auctionId, userId, 'vehicle_owner');
  }

  /**
   * Seller declines highest bid when reserve not met. (Phase 2)
   */
  async declineBid(auctionId, userId) {
    const transaction = await this.transactionRepository.findByAuctionId(auctionId);
    if (!transaction) throw new Error('Transaction not found.');
    if (transaction.seller_id !== userId) throw new Error('Only the seller can decline the bid.');
    if (transaction.outcome !== 'reserve_not_met' || transaction.transaction_status !== 'pending_seller_decision') {
      throw new Error('This auction is not pending your decision.');
    }

    await this.transactionRepository.updateOutcome(auctionId, 'no_sale', 'failed');
    const bidderIds = await this.auctionRepository.getBiddersForAuction(auctionId);
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    const auctionLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Auction';
    for (const bidderId of bidderIds) {
      const bidder = await this.userRepository.findById(bidderId);
      if (bidder && bidder.email) {
        await this.emailService.sendAuctionEndedDeclineToBidders({
          to: bidder.email,
          auctionLabel
        }).catch((e) => console.error('[TransactionService] sendAuctionEndedDeclineToBidders:', e.message));
      }
    }
    return this.getTransactionSummary(auctionId, userId, 'vehicle_owner');
  }

  /**
   * Get transaction summary for buyer (winner) or seller. User must be winner or seller.
   */
  async getTransactionSummary(auctionId, userId, userRole) {
    const transaction = await this.transactionRepository.findByAuctionId(auctionId);
    if (!transaction) return null;

    const isSeller = transaction.seller_id === userId;
    const isWinner = transaction.winner_id === userId;
    if (!isSeller && !isWinner) return null;

    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    if (!auction) return null;
    if (auction.status !== 'ended') return null;

    const seller = await this.userRepository.findWithProfile(transaction.seller_id);
    const winner = transaction.winner_id ? await this.userRepository.findWithProfile(transaction.winner_id) : null;

    const vehicle = {
      make: auction.make,
      model: auction.model,
      variant: auction.variant,
      model_year: auction.model_year
    };

    const counterparty = isSeller ? winner : seller;
    const counterpartyInfo = counterparty
      ? { id: counterparty.id, email: counterparty.email, full_name: counterparty.full_name }
      : null;

    const isSold = transaction.outcome === 'sold';
    const isPendingCompletion = transaction.transaction_status === 'pending_completion';
    const checklist = {
      inspection_completed: Boolean(transaction.inspection_completed),
      payment_completed: Boolean(transaction.payment_completed),
      docs_transferred: Boolean(transaction.docs_transferred),
      vehicle_delivered: Boolean(transaction.vehicle_delivered)
    };
    const buyerConfirmed = Boolean(transaction.buyer_confirmed_complete);
    const sellerConfirmed = Boolean(transaction.seller_confirmed_complete);
    const userHasConfirmed = isSeller ? sellerConfirmed : buyerConfirmed;
    const canConfirmComplete =
      isSold &&
      isPendingCompletion &&
      !userHasConfirmed;

    return {
      id: transaction.id,
      auction_id: auctionId,
      outcome: transaction.outcome,
      transaction_status: transaction.transaction_status,
      final_amount: transaction.final_amount ? parseFloat(transaction.final_amount) : null,
      vehicle,
      seller_id: transaction.seller_id,
      winner_id: transaction.winner_id,
      counterparty: counterpartyInfo,
      can_accept: isSeller && transaction.outcome === 'reserve_not_met' && transaction.transaction_status === 'pending_seller_decision',
      can_decline: isSeller && transaction.outcome === 'reserve_not_met' && transaction.transaction_status === 'pending_seller_decision',
      checklist,
      buyer_confirmed_complete: buyerConfirmed,
      seller_confirmed_complete: sellerConfirmed,
      can_confirm_complete: canConfirmComplete
    };
  }

  /**
   * Update checklist items. (Phase 4)
   * User must be winner or seller; transaction must be sold and pending_completion.
   */
  async updateChecklist(auctionId, userId, updates) {
    const transaction = await this.transactionRepository.findByAuctionId(auctionId);
    if (!transaction) throw new Error('Transaction not found.');
    const isSeller = transaction.seller_id === userId;
    const isWinner = transaction.winner_id === userId;
    if (!isSeller && !isWinner) throw new Error('Only the buyer or seller can update the checklist.');
    if (transaction.outcome !== 'sold' || transaction.transaction_status !== 'pending_completion') {
      throw new Error('Checklist can only be updated for sold transactions pending completion.');
    }

    const allowed = ['inspection_completed', 'payment_completed', 'docs_transferred', 'vehicle_delivered'];
    const sanitized = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) {
        sanitized[k] = updates[k] === true || updates[k] === 1 || updates[k] === '1';
      }
    }
    if (Object.keys(sanitized).length === 0) throw new Error('No valid checklist updates provided.');
    await this.transactionRepository.updateChecklist(auctionId, sanitized);
    return this.getTransactionSummary(auctionId, userId, null);
  }

  /**
   * Buyer or seller confirms "Transaction completed". (Phase 4)
   * When both have confirmed, transaction_status is set to completed.
   */
  async confirmComplete(auctionId, userId) {
    const transaction = await this.transactionRepository.findByAuctionId(auctionId);
    if (!transaction) throw new Error('Transaction not found.');
    const isSeller = transaction.seller_id === userId;
    const isWinner = transaction.winner_id === userId;
    if (!isSeller && !isWinner) throw new Error('Only the buyer or seller can confirm completion.');
    if (transaction.outcome !== 'sold' || transaction.transaction_status !== 'pending_completion') {
      throw new Error('Completion can only be confirmed for sold transactions pending completion.');
    }

    const alreadyConfirmed = isSeller ? transaction.seller_confirmed_complete : transaction.buyer_confirmed_complete;
    if (alreadyConfirmed) {
      return this.getTransactionSummary(auctionId, userId, null);
    }

    await this.transactionRepository.confirmComplete(auctionId, isWinner);
    const updated = await this.transactionRepository.findByAuctionId(auctionId);
    if (updated.buyer_confirmed_complete && updated.seller_confirmed_complete) {
      await this.transactionRepository.setTransactionCompleted(auctionId);
      const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
      const seller = await this.userRepository.findWithProfile(transaction.seller_id);
      const winner = transaction.winner_id ? await this.userRepository.findWithProfile(transaction.winner_id) : null;
      const auctionInfo = auction ? { make: auction.make, model: auction.model, model_year: auction.model_year } : {};
      const amount = updated.final_amount ? parseFloat(updated.final_amount) : 0;

      await this.transferVehicleOwnershipOnCompletion(auction, transaction);

      if (seller && seller.email) {
        this.emailService.sendTransactionCompleted({
          to: seller.email,
          auction: auctionInfo,
          amount,
          role: 'seller'
        }).catch((e) => console.error('[TransactionService] sendTransactionCompleted to seller:', e.message));
      }
      if (winner && winner.email) {
        this.emailService.sendTransactionCompleted({
          to: winner.email,
          auction: auctionInfo,
          amount,
          role: 'buyer'
        }).catch((e) => console.error('[TransactionService] sendTransactionCompleted to buyer:', e.message));
      }
    }
    return this.getTransactionSummary(auctionId, userId, null);
  }

  /**
   * Transfer vehicle ownership from seller to winner when auction transaction is completed.
   * Idempotent: skips if vehicle is already owned by winner.
   */
  async transferVehicleOwnershipOnCompletion(auction, transaction) {
    if (!auction || !transaction || !transaction.winner_id) return;
    const vehicleId = auction.vehicle_id;
    const sellerId = transaction.seller_id;
    const winnerId = transaction.winner_id;
    if (!vehicleId) return;

    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);
      if (!vehicle) return;
      if (parseInt(vehicle.owner_id, 10) === winnerId) return;

      await this.vehicleRepository.updateOwner(vehicleId, winnerId);
      await this.vehicleRepository.addHistoryEntry(
        vehicleId,
        'ownership_change',
        `Ownership transferred via auction completion (Auction #${auction.id})`,
        null,
        {
          auction_id: auction.id,
          transaction_id: transaction.id,
          previous_owner_id: sellerId,
          new_owner_id: winnerId
        }
      );
    } catch (err) {
      console.error('[TransactionService] transferVehicleOwnershipOnCompletion error:', err.message);
    }
  }
}

module.exports = new TransactionService();
