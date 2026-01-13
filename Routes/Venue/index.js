const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const venueController = require('../../Controlers/Venue');

// Create venue
router.post(
    "/",
    isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Venue name is required')
    ],
    venueController.createVenue
);

// Get all venues
router.get(
    "/",
    isAuth,
    venueController.getAllVenues
);

// Get single venue by ID
router.get(
    "/:id",
    isAuth,
    venueController.getVenueById
);

// Update venue
router.patch(
    "/:id",
    isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Venue name is required')
    ],
    venueController.updateVenue
);

// Delete venue
router.delete(
    "/:id",
    isAuth,
    venueController.deleteVenue
);

module.exports = router;

