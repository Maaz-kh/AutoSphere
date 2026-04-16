const cron = require('node-cron');
const AuctionRepository = require('../repositories/auction-repository');
const UserRepository = require('../repositories/user-repository');
const EmailService = require('../services/email-service');
const TransactionService = require('../services/transaction-service');

const CRON_SCHEDULE = '* * * * *'; // Every minute

let cronJob = null;

/**
 * Process ended active auctions (end_at <= NOW): create transaction, send notifications.
 */
async function processEndedAuctions() {
  try {
    await TransactionService.processEndedAuctions();
  } catch (err) {
    console.error('[AuctionScheduler] processEndedAuctions error:', err.message);
  }
}

/**
 * Activate scheduled auctions whose start_at has passed.
 * Sends "Your auction is now active" email to seller.
 */
async function processActivation() {
  try {
    const toActivate = await AuctionRepository.findScheduledToActivate();
    for (const auction of toActivate) {
      const activated = await AuctionRepository.activateScheduledAuction(auction.id);
      if (activated) {
        const seller = await UserRepository.findById(auction.seller_id);
        if (seller && seller.email) {
          await EmailService.sendAuctionActivatedNotification({
            to: seller.email,
            auction: { make: auction.make, model: auction.model, model_year: auction.model_year }
          });
        }
      }
    }
  } catch (err) {
    console.error('[AuctionScheduler] Activation error:', err.message);
  }
}

/**
 * Send 1-day reminder for scheduled auctions that start in ~24 hours.
 * Marks reminder_sent_at so we only send once.
 */
async function processReminders() {
  try {
    const forReminder = await AuctionRepository.findScheduledForReminder();
    for (const auction of forReminder) {
      const seller = await UserRepository.findById(auction.seller_id);
      if (seller && seller.email) {
        await EmailService.sendScheduledAuctionReminder({
          to: seller.email,
          auction: { make: auction.make, model: auction.model, model_year: auction.model_year },
          startAt: auction.start_at
        });
        await AuctionRepository.markReminderSent(auction.id);
      }
    }
  } catch (err) {
    console.error('[AuctionScheduler] Reminder error:', err.message);
  }
}

function runJob() {
  processActivation()
    .then(() => processReminders())
    .then(() => processEndedAuctions())
    .then(() => ensureRunning())
    .catch((err) => console.error('[AuctionScheduler]', err));
}

function start() {
  if (cronJob) return;
  cronJob = cron.schedule(CRON_SCHEDULE, runJob, { scheduled: true });
  console.log('[AuctionScheduler] Cron job started (scheduled activation + 1-day reminder).');
}

function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[AuctionScheduler] Cron job stopped (no scheduled auctions).');
  }
}

/**
 * Start cron if there is at least one scheduled or active auction; stop if there are none.
 * Call on app startup, after creating a scheduled auction.
 */
async function ensureRunning() {
  try {
    const [scheduled, active] = await Promise.all([
      AuctionRepository.countScheduledAuctions(),
      AuctionRepository.countActiveAuctions()
    ]);
    const shouldRun = scheduled > 0 || active > 0;
    if (shouldRun && !cronJob) {
      start();
    } else if (!shouldRun && cronJob) {
      stop();
    }
  } catch (err) {
    console.error('[AuctionScheduler] ensureRunning error:', err.message);
  }
}

module.exports = { start, stop, ensureRunning };
