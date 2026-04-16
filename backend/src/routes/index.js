const express = require('express');
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const vehicleRoutes = require('./vehicle.routes');
const workshopRoutes = require('./workshop.routes');
const publicWorkshopRoutes = require('./public-workshop.routes');
const workshopAppointmentRoutes = require('./workshop-appointment.routes');
const auctionRoutes = require('./auction.routes');

const router = express.Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/workshop', workshopRoutes);
router.use('/public/workshops', publicWorkshopRoutes);
router.use('/workshops', workshopAppointmentRoutes);
router.use('/auctions', auctionRoutes);

module.exports = router;