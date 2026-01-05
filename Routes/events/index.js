const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const eventController = require('../../Controlers/events');

// Create event
router.post(
    "/",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Event name is required')
    ],
    eventController.createEvent
);

// Get all events
router.get(
    "/",
    // isAuth,
    eventController.getAllEvents
);

// Get single event by ID
router.get(
    "/:id",
    // isAuth,
    eventController.getEventById
);

// Update event
router.patch(
    "/:id",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Event name is required')
    ],
    eventController.updateEvent
);

// Delete event
router.delete(
    "/:id",
    // isAuth,
    eventController.deleteEvent
);

module.exports = router;

