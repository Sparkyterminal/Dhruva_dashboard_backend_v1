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
const eventController = require("../../Controlers/ClientsBookings");

// Create new event
router.post("/", eventController.createEvent);

// Update advance received amount and remarks by role
router.patch("/:eventId/advances/:advanceNumber", eventController.updateAdvance);

// Add advance to a specific event type
router.post("/:eventId/event-types/:eventType/advances", eventController.addAdvanceToEventType);

// Get event details by ID
router.get("/:eventId", eventController.getEvent);

// Get all events with pagination
router.get("/", eventController.getAllEvents);

// Edit event details except receivedAmount in advances
router.put("/:eventId/edit", eventController.editEventExceptReceivedAmount);

module.exports = router;

