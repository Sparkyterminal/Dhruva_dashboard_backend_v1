const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const eventTypeController = require('../../Controlers/eventTypes');

// Create event type
router.post(
    "/",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Event type name is required'),
        body('event').not().isEmpty().withMessage('Event ID is required')
    ],
    eventTypeController.createEventType
);

// Get all event types
router.get(
    "/",
    // isAuth,
    eventTypeController.getAllEventTypes
);

// Get single event type by ID
router.get(
    "/:id",
    // isAuth,
    eventTypeController.getEventTypeById
);

// Update event type
router.patch(
    "/:id",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Event type name is required')
    ],
    eventTypeController.updateEventType
);

// Delete event type
router.delete(
    "/:id",
    // isAuth,
    eventTypeController.deleteEventType
);

module.exports = router;

