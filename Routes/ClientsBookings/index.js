const express = require("express");
const router = express.Router();
const eventController = require("../../Controlers/ClientsBookings");

// Create new event
router.post("/", eventController.createEvent);

// Update advance received amount and remarks by role
router.patch("/:eventId/advances/:advanceNumber", eventController.updateAdvance);

// Get event details
router.get("/:eventId", eventController.getEvent);

router.get("/", eventController.getAllEvents);

router.put("/:eventId/edit", eventController.editEventExceptReceivedAmount);


module.exports = router;
