const Event = require("../../Modals/ClientsBookings");

// Create new event with advances
exports.createEvent = async (req, res) => {
  try {
    const { clientName, eventDate, venueLocation, agreedAmount, advances } = req.body;

    if (!clientName || !eventDate || !venueLocation || !agreedAmount || !advances) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Validate advances: Array of { advanceNumber, expectedAmount }
    if (!Array.isArray(advances) || advances.length === 0) {
      return res.status(400).json({ message: "Advances must be a non-empty array" });
    }

    const event = new Event({
      clientName,
      eventDate,
      venueLocation,
      agreedAmount,
      advances: advances.map(adv => ({
        advanceNumber: adv.advanceNumber,
        expectedAmount: adv.expectedAmount,
        receivedAmount: 0,
        remarks: { accounts: "", owner: "", approver: "" },
      }))
    });

    await event.save();

    res.status(201).json({ message: "Event created", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update advance details by advanceNumber and role (Accounts / Owner / Approver)
exports.updateAdvance = async (req, res) => {
  try {
    const { eventId, advanceNumber } = req.params;
    const { role, receivedAmount, remarks, userId } = req.body;

    // role should be one of 'accounts', 'owner', 'approver'
    if (!["accounts", "owner", "approver"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (receivedAmount == null && remarks == null) {
      return res.status(400).json({ message: "At least one of receivedAmount or remarks required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const advance = event.advances.find(a => a.advanceNumber === parseInt(advanceNumber));
    if (!advance) return res.status(404).json({ message: "Advance not found" });

    // Update fields as provided
    if (typeof receivedAmount === "number") {
      advance.receivedAmount = receivedAmount;
    }
    if (typeof remarks === "string") {
      advance.remarks[role] = remarks;
      advance.updatedBy[role] = userId;  // userId from authenticated user
      advance.updatedAt[role] = new Date();
    }

    await event.save();

    res.status(200).json({ message: "Advance updated", advance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get event by ID, including advances
exports.getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    res.status(200).json({ event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all events with optional pagination
exports.getAllEvents = async (req, res) => {
    try {
      // Optional pagination query params : page, limit
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
  
      const events = await Event.find()
        .sort({ createdAt: -1 })  // latest events first
        .skip(skip)
        .limit(limit);
  
      const totalEvents = await Event.countDocuments();
  
      res.status(200).json({
        page,
        limit,
        totalEvents,
        totalPages: Math.ceil(totalEvents / limit),
        events
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  };
  