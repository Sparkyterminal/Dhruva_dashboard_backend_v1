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

// Get my events (must be before /:eventId route)
router.get("/my-events", isAuth, eventController.getMyEvents);

// Lightweight list: booking id + event type name only (before /:eventId)
router.get("/minimal", eventController.getAllEventsMinimal);

// Leaderboard by creator (bookings count or amount) — before /:eventId
router.get("/leaderboard", eventController.getLeaderboard);

// Confirmed events balance sheet (payable − received) — before /:eventId
router.get("/balance-sheet", isAuth, eventController.getConfirmedEventsBalanceSheet);

// List all events — MUST be registered before /:eventId so "/" is not captured as an id (Express 5)
router.get("/", eventController.getAllEvents);

// Get event details by ID
router.get("/:eventId", isAuth, eventController.getEvent);

// Edit event details except receivedAmount in advances
router.put("/:eventId/edit", isAuth, eventController.editEventExceptReceivedAmount);

// Delete event (booking)
router.delete("/:eventId", isAuth, eventController.deleteEvent);

module.exports = router;

