const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD } = process.env;

    if (MAIL_HOST && MAIL_PORT && MAIL_USER && MAIL_PASSWORD) {
      this.transporter = nodemailer.createTransport({
        host: MAIL_HOST,
        port: Number(MAIL_PORT),
        secure: Number(MAIL_PORT) === 465,
        auth: {
          user: MAIL_USER,
          pass: MAIL_PASSWORD
        }
      });
    }
  }

  getVerificationUrl(token) {
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
    return `${baseUrl}/verify-email?token=${token}`;
  }

  async sendVerificationEmail(email, token) {
    const verificationUrl = this.getVerificationUrl(token);
    const mailOptions = {
      to: email,
      subject: 'Verify your AutoSphere account',
      text: `Welcome to AutoSphere!\n\nPlease verify your account by clicking the link below:\n${verificationUrl}\n\nIf you did not create this account, please ignore this email.`,
      html: `
        <h2>Welcome to AutoSphere!</h2>
        <p>Please verify your account by clicking the button below:</p>
        <p>
          <a href="${verificationUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
        </p>
        <p>If the button does not work, copy and paste this URL into your browser:</p>
        <p>${verificationUrl}</p>
      `
    };

    await this.dispatch(mailOptions);
  }

  async dispatch(mailOptions) {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || 'no-reply@autosphere.com',
        ...mailOptions
      });
      return;
    }

    console.log('\n[EmailService] Email transport not configured. Message details:\n', {
      ...mailOptions,
      previewUrl: mailOptions.text
    });
  }

  async sendOwnershipTransferRequestEmail({ to, vehicle, requester, expiresAt }) {
    const subject = 'AutoSphere: Vehicle ownership transfer request';
    const formattedExpiry = expiresAt.toLocaleString();
    const mailOptions = {
      to,
      subject,
      text: `
You have a pending ownership transfer request on AutoSphere.

Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.registration_number})
Requested by: ${requester?.email || 'Unknown'}
Expires at: ${formattedExpiry}

Please log in to AutoSphere to accept or reject this request.
      `.trim(),
      html: `
        <h2>Vehicle ownership transfer request</h2>
        <p><strong>Vehicle:</strong> ${vehicle.make} ${vehicle.model} (${vehicle.registration_number})</p>
        <p><strong>Requested by:</strong> ${requester?.email || 'AutoSphere user'}</p>
        <p><strong>Expires at:</strong> ${formattedExpiry}</p>
        <p>Please log in to AutoSphere to accept or reject this request.</p>
      `
    };

    await this.dispatch(mailOptions);
  }

  async sendNewBidToSeller({ to, auction, amount, bidderEmail }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your vehicle';
    const subject = 'AutoSphere: New bid on your auction';
    const mailOptions = {
      to,
      subject,
      text: `A new bid of PKR ${Number(amount).toLocaleString()} has been placed on your auction (${vehicleLabel}).\n\nBidder: ${bidderEmail || 'A bidder'}\n\nLog in to AutoSphere to view the auction.`,
      html: `
        <h2>New bid on your auction</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Bid amount:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p><strong>Bidder:</strong> ${bidderEmail || 'A bidder'}</p>
        <p>Log in to AutoSphere to view the auction.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendOutbidNotification({ to, auction, newAmount }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Auction';
    const subject = 'AutoSphere: You have been outbid';
    const mailOptions = {
      to,
      subject,
      text: `You have been outbid on an auction (${vehicleLabel}). The new high bid is PKR ${Number(newAmount).toLocaleString()}.\n\nLog in to AutoSphere to place a new bid.`,
      html: `
        <h2>You have been outbid</h2>
        <p><strong>Auction:</strong> ${vehicleLabel}</p>
        <p><strong>New high bid:</strong> PKR ${Number(newAmount).toLocaleString()}</p>
        <p>Log in to AutoSphere to place a new bid.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendScheduledAuctionReminder({ to, auction, startAt }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your vehicle';
    const startStr = startAt ? new Date(startAt).toLocaleString() : 'scheduled time';
    const subject = 'AutoSphere: Reminder – Your auction starts in 1 day';
    const mailOptions = {
      to,
      subject,
      text: `Your scheduled auction (${vehicleLabel}) will start in about 1 day (${startStr}).\n\nLog in to AutoSphere to view your listing and manage the auction.`,
      html: `
        <h2>Your auction starts soon</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Start time:</strong> ${startStr}</p>
        <p>Your auction will go live automatically. Log in to AutoSphere to view your listing and manage the auction.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionActivatedNotification({ to, auction }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your vehicle';
    const subject = 'AutoSphere: Your auction is now active';
    const mailOptions = {
      to,
      subject,
      text: `Your auction (${vehicleLabel}) is now active and visible to buyers. Bidding is open.\n\nLog in to AutoSphere to monitor bids and activity.`,
      html: `
        <h2>Your auction is now active</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p>Your auction is live and visible to buyers. Bidding is open.</p>
        <p>Log in to AutoSphere to monitor bids and activity.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedSoldToWinner({ to, auction, amount }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your won vehicle';
    const subject = 'AutoSphere: Congratulations – You won the auction!';
    const mailOptions = {
      to,
      subject,
      text: `Congratulations! You won the auction for ${vehicleLabel} with a bid of PKR ${Number(amount).toLocaleString()}.\n\nLog in to AutoSphere to view transaction details and contact the seller.`,
      html: `
        <h2>You won the auction!</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Your winning bid:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p>Log in to AutoSphere to view transaction details and contact the seller.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedSoldToSeller({ to, auction, amount }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your vehicle';
    const subject = 'AutoSphere: Your auction sold!';
    const mailOptions = {
      to,
      subject,
      text: `Your auction for ${vehicleLabel} has sold for PKR ${Number(amount).toLocaleString()}.\n\nLog in to AutoSphere to view transaction details and contact the buyer.`,
      html: `
        <h2>Your auction sold</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Final bid:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p>Log in to AutoSphere to view transaction details and contact the buyer.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedReserveNotMetToSeller({ to, auction, amount }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Your vehicle';
    const subject = 'AutoSphere: Reserve not met – Accept or decline the highest bid';
    const mailOptions = {
      to,
      subject,
      text: `Your auction for ${vehicleLabel} ended but the reserve price was not met. Highest bid: PKR ${Number(amount).toLocaleString()}.\n\nLog in to AutoSphere to accept or decline the bid.`,
      html: `
        <h2>Reserve not met</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Highest bid:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p>Log in to AutoSphere to accept or decline the bid.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedReserveNotMetToWinner({ to, auction }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Auction';
    const subject = 'AutoSphere: Auction ended – Reserve not met';
    const mailOptions = {
      to,
      subject,
      text: `The auction for ${vehicleLabel} has ended. The reserve price was not met. The seller will decide whether to accept your bid.\n\nLog in to AutoSphere for updates.`,
      html: `
        <h2>Auction ended – Reserve not met</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p>The seller will decide whether to accept your bid. Log in to AutoSphere for updates.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedAcceptToWinner({ to, auction, amount }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Vehicle';
    const subject = 'AutoSphere: Seller accepted your bid!';
    const mailOptions = {
      to,
      subject,
      text: `The seller has accepted your bid of PKR ${Number(amount).toLocaleString()} for ${vehicleLabel}.\n\nLog in to AutoSphere to view transaction details and contact the seller.`,
      html: `
        <h2>Your bid was accepted</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Amount:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p>Log in to AutoSphere to view transaction details and contact the seller.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendTransactionCompleted({ to, auction, amount, role }) {
    const vehicleLabel = `${auction.make || ''} ${auction.model || ''} ${auction.model_year || ''}`.trim() || 'Vehicle';
    const subject = 'AutoSphere: Transaction completed';
    const mailOptions = {
      to,
      subject,
      text: `The transaction for ${vehicleLabel} (PKR ${Number(amount).toLocaleString()}) has been completed. Both parties have confirmed. Thank you for using AutoSphere!`,
      html: `
        <h2>Transaction completed</h2>
        <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
        <p><strong>Final amount:</strong> PKR ${Number(amount).toLocaleString()}</p>
        <p>Both you and the ${role === 'buyer' ? 'seller' : 'buyer'} have confirmed the transaction. Thank you for using AutoSphere!</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendAuctionEndedDeclineToBidders({ to, auctionLabel }) {
    const subject = 'AutoSphere: Auction did not result in a sale';
    const mailOptions = {
      to,
      subject,
      text: `The auction for ${auctionLabel} did not result in a sale. The seller declined the highest bid.\n\nLog in to AutoSphere to browse other auctions.`,
      html: `
        <h2>Auction did not result in a sale</h2>
        <p><strong>Auction:</strong> ${auctionLabel}</p>
        <p>The seller declined the highest bid. Log in to AutoSphere to browse other auctions.</p>
      `
    };
    await this.dispatch(mailOptions);
  }

  async sendOwnershipTransferStatusEmail({ vehicle, request, status, currentOwner, newOwner }) {
    const statusLabel = status === 'accepted' ? 'approved' : 'rejected';
    const subject = `AutoSphere: Ownership transfer ${statusLabel}`;
    const messageBody = `
Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.registration_number})
Previous owner: ${currentOwner?.email || request.current_owner_id}
New owner: ${newOwner?.email || request.new_owner_id}
Status: ${statusLabel.toUpperCase()}
    `.trim();

    const htmlBody = `
      <h2>Ownership transfer ${statusLabel}</h2>
      <p><strong>Vehicle:</strong> ${vehicle.make} ${vehicle.model} (${vehicle.registration_number})</p>
      <p><strong>Previous owner:</strong> ${currentOwner?.email || request.current_owner_id}</p>
      <p><strong>New owner:</strong> ${newOwner?.email || request.new_owner_id}</p>
      <p><strong>Status:</strong> ${statusLabel.toUpperCase()}</p>
    `;

    const recipients = [
      currentOwner?.email,
      newOwner?.email
    ].filter(Boolean);

    await Promise.all(
      recipients.map((recipient) =>
        this.dispatch({
          to: recipient,
          subject,
          text: messageBody,
          html: htmlBody
        })
      )
    );
  }
}

module.exports = new EmailService();

