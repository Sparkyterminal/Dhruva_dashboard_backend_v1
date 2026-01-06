// const express = require("express");
// const router = express.Router();
// const eventController = require("../../Controlers/ClientsBookings");

// // Create new event
// router.post("/", eventController.createEvent);

// // Update advance received amount and remarks by role
// router.patch("/:eventId/advances/:advanceNumber", eventController.updateAdvance);

// // Get event details
// router.get("/:eventId", eventController.getEvent);

// router.get("/", eventController.getAllEvents);

// router.put("/:eventId/edit", eventController.editEventExceptReceivedAmount);


// module.exports = router;

const express = require("express");
const router = express.Router();
const isAuth = require("../../authentication/is-auth");
const eventController = require("../../Controlers/ClientsBookings");

// Create new event
router.post("/", isAuth, eventController.createEvent);

// Update advance received amount and remarks by role
router.patch("/:eventId/advances/:advanceNumber", isAuth, eventController.updateAdvance);

// Add/Update advance to a specific event type
router.patch("/:eventId/event-types/:eventTypeId/advances/:advanceNumber", isAuth, eventController.addAdvanceToEventType);

// Get event details by ID
router.get("/:eventId", isAuth, eventController.getEvent);

// Get all events with pagination
router.get("/", isAuth, eventController.getAllEvents);

// Edit event details except receivedAmount in advances
router.put("/:eventId/edit", isAuth, eventController.editEventExceptReceivedAmount);

// Get my events
router.get("/my-events", isAuth, eventController.getMyEvents);

module.exports = router;

