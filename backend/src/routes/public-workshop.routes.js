const express = require('express');
const PublicWorkshopController = require('../controllers/public-workshop-controller');

const router = express.Router();
const controller = PublicWorkshopController;

// Public workshop search (verified only by default)
router.get('/', controller.search.bind(controller));

// Public services catalog (for workshop registration + search filters)
router.get('/services/catalog', controller.servicesCatalog.bind(controller));

// Public workshop reviews
router.get('/:id/reviews', controller.reviews.bind(controller));

// Public workshop details
router.get('/:id', controller.details.bind(controller));

module.exports = router;

