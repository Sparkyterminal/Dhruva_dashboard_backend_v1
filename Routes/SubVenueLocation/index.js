const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const subVenueLocationController = require('../../Controlers/SubVenueLocation');

// Create sub venue location
router.post(
    "/",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Sub venue location name is required'),
        body('venue').not().isEmpty().withMessage('Venue ID is required')
    ],
    subVenueLocationController.createSubVenueLocation
);

// Get all sub venue locations
router.get(
    "/",
    // isAuth,
    subVenueLocationController.getAllSubVenueLocations
);

// Get sub venue locations by venue ID
router.get(
    "/venue/:venueId",
    // isAuth,
    subVenueLocationController.getSubVenueLocationsByVenueId
);

// Get single sub venue location by ID
router.get(
    "/:id",
    // isAuth,
    subVenueLocationController.getSubVenueLocationById
);

// Update sub venue location
router.patch(
    "/:id",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Sub venue location name is required')
    ],
    subVenueLocationController.updateSubVenueLocation
);

// Delete sub venue location
router.delete(
    "/:id",
    // isAuth,
    subVenueLocationController.deleteSubVenueLocation
);

module.exports = router;

